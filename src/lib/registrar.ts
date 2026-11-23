// src/lib/registrar.ts — lógica única de alta de movimientos (webhook iOS y formulario manual)
import type { PoolClient } from "pg";
import { resolverCategoria, type CategoriaResuelta, type TipoTransaccion } from "@/lib/categorizar";
import { asegurarTasasDelDia } from "@/lib/cambio";
import { MONEDAS_SOPORTADAS } from "@/lib/parseo";
import { buscarCompanero, divisionConocida, PORCENTAJE_PROPIO_DEFECTO } from "@/lib/companeros";

/** Nombre con el que se guarda un cobro cuyo comercio no se pudo leer: nunca se rechaza por eso. */
export const COMERCIO_DESCONOCIDO = "Comercio desconocido";

export type OrigenInsercion = "Webhook_iOS" | "Manual_Web" | "Importacion";

export interface EntradaRegistro {
  usuarioId: string;
  monedaPrincipal: string;
  cuentaId?: string;          // prioridad sobre cuentaIdent
  cuentaIdent?: string;       // identificador_notificacion
  monto: number;
  moneda?: string;            // por defecto, la de la cuenta
  comercio: string;
  tipo: TipoTransaccion;
  categoriaId?: string;       // si falta, se resuelve por diccionario/memoria
  fechaLocal?: string;        // YYYY-MM-DD en la zona del usuario (formulario manual)
  fechaHoraIso?: string;      // ISO 8601 con offset (webhook)
  textoOriginal?: string;
  origen: OrigenInsercion;
  hashDedup?: string | null;
  // Dividir el gasto (solo egresos). Por id o por nombre; si no se indica ninguno, se aplica la
  // división recordada para ese comercio, si existe.
  companeroId?: string;
  dividirCon?: string;
  porcentajePropio?: number;  // tu parte, 0 < % < 100 (50 por defecto)
}

export interface DivisionAplicada { companeroId: string; companero: string; porcentajePropio: number; montoPropio: number; recordada: boolean }

export interface CuentaRow { id: string; nombre_cuenta: string; saldo_actual: string; moneda: string }

export type ResultadoRegistro =
  | { duplicado: true; transaccionId: string; comercio: string; monto: number; moneda: string }
  | {
      duplicado: false;
      transaccionId: string;
      fechaHora: string;
      cuenta: CuentaRow;
      categoria: CategoriaResuelta;
      tipo: TipoTransaccion;
      monto: number;
      moneda: string;
      comercio: string;
      saldoNuevo: number;
      montoPrincipal: number | null;
      division: DivisionAplicada | null;
    };

export class ErrorRegistro extends Error {
  constructor(public codigo: string, public status: number) { super(codigo); }
}

export async function registrarTransaccion(client: PoolClient, e: EntradaRegistro): Promise<ResultadoRegistro> {
  // 1. Cuenta bloqueada
  const cuentaRes = await client.query<CuentaRow>(
    `SELECT id, nombre_cuenta, saldo_actual, moneda
       FROM cuentas_bancarias
      WHERE usuario_id = $1
        AND ($2::uuid IS NULL OR id = $2)
        AND ($3::text IS NULL OR identificador_notificacion = $3)
      ORDER BY creado_en ASC LIMIT 1 FOR UPDATE`,
    [e.usuarioId, e.cuentaId ?? null, e.cuentaIdent ?? null],
  );
  const cuenta = cuentaRes.rows[0];
  if (!cuenta) throw new ErrorRegistro("CUENTA_NO_ENCONTRADA", 404);

  const moneda = e.moneda && (MONEDAS_SOPORTADAS as readonly string[]).includes(e.moneda) ? e.moneda : cuenta.moneda;
  const monto = Math.round(e.monto * 100) / 100;
  if (!(monto > 0)) throw new ErrorRegistro("MONTO_NO_RECONOCIDO", 422);
  // Un comercio ilegible no impide registrar el pago: queda como «Comercio desconocido» en «Por clasificar».
  const comercio = e.comercio.trim() || COMERCIO_DESCONOCIDO;

  // 2. Idempotencia (solo webhook)
  if (e.hashDedup) {
    const dup = await client.query<{ id: string }>(`SELECT id FROM transacciones WHERE hash_dedup = $1`, [e.hashDedup]);
    if (dup.rows[0]) return { duplicado: true, transaccionId: dup.rows[0].id, comercio, monto, moneda };
  }

  // 3. Cotización del día
  await asegurarTasasDelDia(client);

  // 4. Categoría
  let categoria: CategoriaResuelta;
  if (e.categoriaId) {
    const c = await client.query<{ id: string; nombre_categoria: string; es_por_clasificar: boolean }>(
      `SELECT id, nombre_categoria, es_por_clasificar FROM categorias WHERE id = $1 AND usuario_id = $2 AND tipo = $3::tipo_transaccion`,
      [e.categoriaId, e.usuarioId, e.tipo],
    );
    if (!c.rows[0]) throw new ErrorRegistro("CATEGORIA_INVALIDA", 422);
    categoria = { ...c.rows[0], origen: "memoria" };
  } else {
    categoria = await resolverCategoria(client, e.usuarioId, e.tipo, comercio, e.textoOriginal);
  }

  // 4b. División con un compañero (solo egresos)
  let division: { companeroId: string; companero: string; porcentajePropio: number; recordada: boolean } | null = null;
  if (e.tipo === "egreso") {
    if (e.companeroId || e.dividirCon) {
      const comp = await buscarCompanero(client, e.usuarioId, { id: e.companeroId, nombre: e.dividirCon });
      if (!comp) throw new ErrorRegistro("COMPANERO_NO_ENCONTRADO", 422);
      const pct = e.porcentajePropio ?? PORCENTAJE_PROPIO_DEFECTO;
      if (!(pct > 0 && pct < 100)) throw new ErrorRegistro("PORCENTAJE_INVALIDO", 422);
      division = { companeroId: comp.id, companero: comp.nombre, porcentajePropio: pct, recordada: false };
    } else if (comercio !== COMERCIO_DESCONOCIDO) {
      const k = await divisionConocida(client, e.usuarioId, comercio);
      if (k) division = { companeroId: k.companeroId, companero: k.nombre, porcentajePropio: k.porcentajePropio, recordada: true };
    }
  }

  // 5. Fecha: ISO con offset (webhook) > fecha local a mediodía (manual) > ahora
  const zona = (await client.query<{ zona_horaria: string }>(`SELECT zona_horaria FROM usuarios WHERE id = $1`, [e.usuarioId])).rows[0]?.zona_horaria ?? "UTC";
  const fechaSql = e.fechaHoraIso
    ? `($1::timestamptz AT TIME ZONE 'UTC')`
    : e.fechaLocal
      ? `((($1::text || ' 12:00')::timestamp AT TIME ZONE $2) AT TIME ZONE 'UTC')`
      : `CURRENT_TIMESTAMP`;
  const fechaParams: string[] = e.fechaHoraIso ? [e.fechaHoraIso] : e.fechaLocal ? [e.fechaLocal, zona] : [];

  // 6. INSERT (los parámetros de fecha van primero)
  const base = fechaParams.length;
  const ins = await client.query<{ id: string; fecha_hora: string; fecha: string }>(
    `INSERT INTO transacciones
       (cuenta_id, categoria_id, tipo, monto, moneda, fecha_hora, descripcion, origen_insercion, hash_dedup, companero_id, porcentaje_propio)
     VALUES ($${base + 1}, $${base + 2}, $${base + 3}::tipo_transaccion, $${base + 4}, $${base + 5}, ${fechaSql}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})
     RETURNING id, fecha_hora, to_char(fecha_hora::date, 'YYYY-MM-DD') AS fecha`,
    [...fechaParams, cuenta.id, categoria.id, e.tipo, monto.toFixed(2), moneda, comercio, e.origen, e.hashDedup ?? null,
      division?.companeroId ?? null, (division?.porcentajePropio ?? 100).toFixed(2)],
  );

  // 7. Saldo en la moneda de la cuenta, con la cotización de la fecha del movimiento
  //    (misma regla que las vistas y que eliminarTransaccion: así el saldo siempre cuadra con la suma)
  const fecha = ins.rows[0].fecha;
  const conv = await client.query<{ v: string | null }>(`SELECT convertir($1, $2, $3, $4::date) AS v`, [monto, moneda, cuenta.moneda, fecha]);
  if (conv.rows[0]?.v == null) throw new ErrorRegistro(`SIN_COTIZACION_${moneda}_${cuenta.moneda}`, 500);
  const delta = Number(conv.rows[0].v) * (e.tipo === "egreso" ? -1 : 1);
  const upd = await client.query<{ saldo_actual: string }>(
    `UPDATE cuentas_bancarias SET saldo_actual = saldo_actual + $1 WHERE id = $2 RETURNING saldo_actual`,
    [delta.toFixed(2), cuenta.id],
  );
  if (upd.rowCount !== 1) throw new ErrorRegistro("SALDO_NO_ACTUALIZADO", 500);

  // 8. Importe en moneda principal (para el mensaje)
  const prin = await client.query<{ v: string | null }>(`SELECT convertir($1, $2, $3, $4::date) AS v`, [monto, moneda, e.monedaPrincipal, fecha]);

  return {
    duplicado: false,
    transaccionId: ins.rows[0].id,
    fechaHora: ins.rows[0].fecha_hora,
    cuenta, categoria, tipo: e.tipo, monto, moneda, comercio,
    saldoNuevo: Number(upd.rows[0].saldo_actual),
    montoPrincipal: prin.rows[0]?.v == null ? null : Number(prin.rows[0].v),
    division: division
      ? { ...division, montoPropio: Math.round(monto * division.porcentajePropio) / 100 }
      : null,
  };
}

export interface CambiosTransaccion {
  monto?: number;
  moneda?: string;
  comercio?: string;
  tipo?: TipoTransaccion;
  cuentaId?: string;
  fechaLocal?: string; // YYYY-MM-DD en la zona del usuario
  horaLocal?: string;  // HH:MM en la zona del usuario
}

/**
 * Edita un movimiento y deja el saldo de las cuentas coherente: revierte el efecto del movimiento
 * tal como estaba (con su moneda, cuenta y fecha de entonces) y aplica el nuevo. Es la misma regla
 * que registrarTransaccion y eliminarTransaccion, así saldo = suma de movimientos siempre.
 * Devuelve null si el movimiento no existe o no es del usuario.
 */
export async function editarTransaccion(client: PoolClient, usuarioId: string, id: string, c: CambiosTransaccion): Promise<{ transaccionId: string; fechaLocal: string } | null> {
  const t = await client.query<{
    cuenta_id: string; tipo: TipoTransaccion; monto: string; moneda: string; descripcion: string | null;
    fecha_utc: string; fecha_local: string; hora_local: string; zona_horaria: string; moneda_cuenta: string;
  }>(
    `SELECT t.cuenta_id, t.tipo, t.monto, t.moneda, t.descripcion,
            to_char(t.fecha_hora::date, 'YYYY-MM-DD') AS fecha_utc,
            to_char((t.fecha_hora AT TIME ZONE 'UTC') AT TIME ZONE u.zona_horaria, 'YYYY-MM-DD') AS fecha_local,
            to_char((t.fecha_hora AT TIME ZONE 'UTC') AT TIME ZONE u.zona_horaria, 'HH24:MI') AS hora_local,
            u.zona_horaria, cu.moneda AS moneda_cuenta
       FROM transacciones t
       JOIN cuentas_bancarias cu ON cu.id = t.cuenta_id
       JOIN usuarios u ON u.id = cu.usuario_id
      WHERE t.id = $1 AND cu.usuario_id = $2
        FOR UPDATE OF t, cu`,
    [id, usuarioId],
  );
  const viejo = t.rows[0];
  if (!viejo) return null;

  // ---- valores nuevos (lo que no se indica se conserva)
  const monto = c.monto === undefined ? Number(viejo.monto) : Math.round(c.monto * 100) / 100;
  if (!(monto > 0)) throw new ErrorRegistro("MONTO_NO_RECONOCIDO", 422);
  const moneda = c.moneda ?? viejo.moneda;
  if (!(MONEDAS_SOPORTADAS as readonly string[]).includes(moneda)) throw new ErrorRegistro("MONEDA_NO_SOPORTADA", 422);
  const tipo = c.tipo ?? viejo.tipo;
  const descripcion = c.comercio === undefined ? viejo.descripcion : c.comercio.trim();
  if (c.comercio !== undefined && !descripcion) throw new ErrorRegistro("COMERCIO_VACIO", 422);

  // Cuenta nueva (bloqueada también); si no cambia, es la misma ya bloqueada
  const cuentaId = c.cuentaId ?? viejo.cuenta_id;
  let monedaCuenta = viejo.moneda_cuenta;
  if (cuentaId !== viejo.cuenta_id) {
    const cu = await client.query<{ moneda: string }>(`SELECT moneda FROM cuentas_bancarias WHERE id = $1 AND usuario_id = $2 FOR UPDATE`, [cuentaId, usuarioId]);
    if (!cu.rows[0]) throw new ErrorRegistro("CUENTA_NO_ENCONTRADA", 404);
    monedaCuenta = cu.rows[0].moneda;
  }

  // Fecha y hora: se combinan con las actuales en la zona del usuario; no se admite el futuro
  let fechaUtc = viejo.fecha_utc;
  let fechaLocal = viejo.fecha_local;
  let fechaHoraSql: string | null = null;
  if (c.fechaLocal !== undefined || c.horaLocal !== undefined) {
    fechaLocal = c.fechaLocal ?? viejo.fecha_local;
    const hora = c.horaLocal ?? viejo.hora_local;
    const f = await client.query<{ f: string; d: string; futura: boolean }>(
      `WITH x AS (SELECT (((($1::text || ' ' || $2::text)::timestamp) AT TIME ZONE $3) AT TIME ZONE 'UTC') AS f)
       SELECT to_char(x.f, 'YYYY-MM-DD"T"HH24:MI:SS') AS f, to_char(x.f::date, 'YYYY-MM-DD') AS d,
              x.f > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + interval '5 minutes' AS futura
         FROM x`,
      [fechaLocal, hora, viejo.zona_horaria],
    );
    if (f.rows[0].futura) throw new ErrorRegistro("FECHA_FUTURA", 422);
    fechaHoraSql = f.rows[0].f;
    fechaUtc = f.rows[0].d;
  }

  // Categoría: si cambia el tipo, la actual deja de valer (las categorías son por tipo) y se vuelve a resolver
  let categoriaId: string | undefined;
  if (tipo !== viejo.tipo) {
    categoriaId = (await resolverCategoria(client, usuarioId, tipo, descripcion ?? "")).id;
  }

  // ---- saldo: revertir el efecto viejo y aplicar el nuevo
  await asegurarTasasDelDia(client);
  const convViejo = await client.query<{ v: string | null }>(`SELECT convertir($1, $2, $3, $4::date) AS v`, [viejo.monto, viejo.moneda, viejo.moneda_cuenta, viejo.fecha_utc]);
  if (convViejo.rows[0]?.v == null) throw new ErrorRegistro(`SIN_COTIZACION_${viejo.moneda}_${viejo.moneda_cuenta}`, 500);
  const convNuevo = await client.query<{ v: string | null }>(`SELECT convertir($1, $2, $3, $4::date) AS v`, [monto, moneda, monedaCuenta, fechaUtc]);
  if (convNuevo.rows[0]?.v == null) throw new ErrorRegistro(`SIN_COTIZACION_${moneda}_${monedaCuenta}`, 500);
  const deltaViejo = Number(convViejo.rows[0].v) * (viejo.tipo === "egreso" ? -1 : 1);
  const deltaNuevo = Number(convNuevo.rows[0].v) * (tipo === "egreso" ? -1 : 1);

  await client.query(`UPDATE cuentas_bancarias SET saldo_actual = saldo_actual - $1 WHERE id = $2`, [deltaViejo.toFixed(2), viejo.cuenta_id]);
  await client.query(`UPDATE cuentas_bancarias SET saldo_actual = saldo_actual + $1 WHERE id = $2`, [deltaNuevo.toFixed(2), cuentaId]);

  await client.query(
    `UPDATE transacciones
        SET monto = $2, moneda = $3, tipo = $4::tipo_transaccion, cuenta_id = $5, descripcion = $6,
            fecha_hora = COALESCE($7::timestamp, fecha_hora),
            categoria_id = COALESCE($8::uuid, categoria_id),
            -- un ingreso no se divide
            companero_id = CASE WHEN $4 = 'ingreso' THEN NULL ELSE companero_id END,
            porcentaje_propio = CASE WHEN $4 = 'ingreso' THEN 100 ELSE porcentaje_propio END,
            saldada_en = CASE WHEN $4 = 'ingreso' THEN NULL ELSE saldada_en END
      WHERE id = $1`,
    [id, monto.toFixed(2), moneda, tipo, cuentaId, descripcion, fechaHoraSql, categoriaId ?? null],
  );
  return { transaccionId: id, fechaLocal };
}

/** Elimina un movimiento y revierte su efecto en el saldo de la cuenta. */
export async function eliminarTransaccion(client: PoolClient, usuarioId: string, transaccionId: string): Promise<boolean> {
  const t = await client.query<{ id: string; cuenta_id: string; tipo: TipoTransaccion; monto: string; moneda: string; fecha: string; moneda_cuenta: string }>(
    `SELECT t.id, t.cuenta_id, t.tipo, t.monto, t.moneda, t.fecha_hora::date AS fecha, cu.moneda AS moneda_cuenta
       FROM transacciones t JOIN cuentas_bancarias cu ON cu.id = t.cuenta_id
      WHERE t.id = $1 AND cu.usuario_id = $2 FOR UPDATE OF t, cu`,
    [transaccionId, usuarioId],
  );
  const row = t.rows[0];
  if (!row) return false;
  const conv = await client.query<{ v: string | null }>(`SELECT convertir($1, $2, $3, $4::date) AS v`, [row.monto, row.moneda, row.moneda_cuenta, row.fecha]);
  const delta = Number(conv.rows[0]?.v ?? 0) * (row.tipo === "egreso" ? 1 : -1); // revertir
  await client.query(`UPDATE cuentas_bancarias SET saldo_actual = saldo_actual + $1 WHERE id = $2`, [delta.toFixed(2), row.cuenta_id]);
  await client.query(`DELETE FROM transacciones WHERE id = $1`, [row.id]);
  return true;
}

export function fmtMoneda(monto: number, moneda: string): string {
  try {
    return new Intl.NumberFormat("es", { style: "currency", currency: moneda }).format(monto);
  } catch {
    return `${monto.toFixed(2)} ${moneda}`;
  }
}

export function mensajeConfirmacion(r: Extract<ResultadoRegistro, { duplicado: false }>, monedaPrincipal: string): string {
  const etiqueta = r.tipo === "egreso" ? "Gasto" : "Ingreso";
  const original = fmtMoneda(r.monto, r.moneda);
  const convertido = r.moneda !== monedaPrincipal && r.montoPrincipal !== null ? ` (≈ ${fmtMoneda(r.montoPrincipal, monedaPrincipal)})` : "";
  // Comercio sin rubro conocido: se registra igual y se pregunta a qué rubro pertenece.
  const sufijo = r.categoria.es_por_clasificar
    ? ` · ❓ ¿A qué rubro pertenece «${r.comercio}»? Elígelo en Finanzas → Por clasificar`
    : ` · ${r.categoria.nombre_categoria}`;
  const dividido = r.division ? ` · dividido con ${r.division.companero} (tu parte ${fmtMoneda(r.division.montoPropio, r.moneda)})` : "";
  return `✅ ${etiqueta} de ${original}${convertido} en ${r.comercio} registrado con éxito${sufijo}${dividido}`;
}
