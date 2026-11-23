// src/lib/queries.ts
import { pool } from "@/lib/db";
import { asegurarTasasDelDia } from "@/lib/cambio";
import { obtenerDeudas, type Deuda } from "@/lib/companeros";
import type { Movimiento } from "@/lib/tipos";

export interface ResumenDashboard {
  moneda: string;
  saldoTotal: number | null;
  gastoHoy: number;
  movimientosHoy: number;
  cuentas: { id: string; nombre: string; saldo: number; moneda: string; saldoPrincipal: number | null }[];
  presupuestos: { id: string; nombre: string; presupuesto: number; gastado: number }[];
  pendientes: number;
  deudas: Deuda[]; // lo que te deben los compañeros con los que dividiste gastos
  esteMes: { mes: string; ingresos: number; egresos: number; balance: number };
  ultimos: Movimiento[];
}

/** Fila de v_transacciones_principal con lo necesario para la ventana de detalle de un movimiento. */
interface FilaMovimiento {
  id: string; descripcion: string | null; tipo: "ingreso" | "egreso"; categoria: string | null; categoria_id: string | null; es_por_clasificar: boolean | null;
  monto: string; moneda: string; monto_principal: string | null; monto_propio_principal: string | null;
  companero_nombre: string | null; companero_id: string | null; porcentaje_propio: string; saldada_en: Date | null;
  fecha_local: string; hora_local: string; nombre_cuenta: string; origen_insercion: string;
}

function aMovimiento(r: FilaMovimiento): Movimiento {
  return {
    id: r.id, descripcion: r.descripcion ?? "", tipo: r.tipo,
    categoria: r.categoria, categoriaId: r.categoria_id, esPorClasificar: !!r.es_por_clasificar,
    monto: Number(r.monto), moneda: r.moneda,
    montoPrincipal: r.monto_principal == null ? null : Number(r.monto_principal),
    montoPropio: r.monto_propio_principal == null ? null : Number(r.monto_propio_principal),
    companero: r.companero_nombre, companeroId: r.companero_id, porcentajePropio: Number(r.porcentaje_propio), saldada: r.saldada_en != null,
    fechaLocal: r.fecha_local, horaLocal: r.hora_local, cuenta: r.nombre_cuenta, origen: r.origen_insercion,
  };
}

export async function obtenerResumen(usuarioId: string): Promise<ResumenDashboard> {
  await asegurarTasasDelDia(pool);
  const [u, saldo, hoy, cuentas, presupuestos, pendientes, ultimos, mesActual, deudas] = await Promise.all([
    pool.query<{ moneda_principal: string }>(`SELECT moneda_principal FROM usuarios WHERE id = $1`, [usuarioId]),
    pool.query<{ saldo_total: string | null }>(`SELECT saldo_total FROM v_saldo_consolidado WHERE usuario_id = $1`, [usuarioId]),
    pool.query<{ gasto: string; n: string }>(
      `SELECT COALESCE(SUM(monto_propio_principal), 0) AS gasto, COUNT(*) AS n
         FROM v_transacciones_principal
        WHERE usuario_id = $1 AND tipo = 'egreso'
          AND fecha_local = ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE zona_horaria)::date`,
      [usuarioId],
    ),
    pool.query<{ id: string; nombre_cuenta: string; saldo_actual: string; moneda: string; saldo_principal: string | null }>(
      `SELECT c.id, c.nombre_cuenta, c.saldo_actual, c.moneda,
              convertir(c.saldo_actual, c.moneda, u.moneda_principal, CURRENT_DATE) AS saldo_principal
         FROM cuentas_bancarias c JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.usuario_id = $1 ORDER BY c.creado_en`,
      [usuarioId],
    ),
    pool.query<{ id: string; nombre_categoria: string; presupuesto_mensual: string; gastado: string }>(
      `SELECT c.id, c.nombre_categoria, c.presupuesto_mensual,
              COALESCE(SUM(t.monto_propio_principal) FILTER (WHERE t.mes = date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE t.zona_horaria)::date), 0) AS gastado
         FROM categorias c
         LEFT JOIN v_transacciones_principal t ON t.categoria_id = c.id AND t.tipo = 'egreso'
        WHERE c.usuario_id = $1 AND c.tipo = 'egreso' AND c.presupuesto_mensual > 0
        GROUP BY c.id, c.nombre_categoria, c.presupuesto_mensual
        ORDER BY 4 DESC`,
      [usuarioId],
    ),
    pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM v_transacciones_principal t
         LEFT JOIN categorias ca ON ca.id = t.categoria_id
        WHERE t.usuario_id = $1 AND (t.categoria_id IS NULL OR ca.es_por_clasificar)`,
      [usuarioId],
    ),
    pool.query<FilaMovimiento>(
      `SELECT t.id, t.descripcion, t.tipo, t.nombre_categoria AS categoria, t.categoria_id, t.es_por_clasificar,
              t.monto, t.moneda, t.monto_principal, t.monto_propio_principal,
              t.companero_nombre, t.companero_id, t.porcentaje_propio, t.saldada_en,
              to_char(t.fecha_local, 'YYYY-MM-DD') AS fecha_local,
              to_char((t.fecha_hora AT TIME ZONE 'UTC') AT TIME ZONE t.zona_horaria, 'HH24:MI') AS hora_local,
              t.nombre_cuenta, t.origen_insercion
         FROM v_transacciones_principal t
        WHERE t.usuario_id = $1 ORDER BY t.fecha_hora DESC LIMIT 8`,
      [usuarioId],
    ),
    pool.query<{ mes: string; ingresos: string; egresos: string; balance: string }>(
      `SELECT to_char(m.mes, 'YYYY-MM') AS mes, m.ingresos, m.egresos, m.balance
         FROM v_resumen_mensual m JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.usuario_id = $1
          AND m.mes = date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE u.zona_horaria)::date`,
      [usuarioId],
    ),
    obtenerDeudas(pool, usuarioId),
  ]);

  return {
    moneda: u.rows[0]?.moneda_principal ?? "EUR",
    saldoTotal: saldo.rows[0]?.saldo_total == null ? null : Number(saldo.rows[0].saldo_total),
    gastoHoy: Number(hoy.rows[0].gasto),
    movimientosHoy: Number(hoy.rows[0].n),
    cuentas: cuentas.rows.map((r) => ({ id: r.id, nombre: r.nombre_cuenta, saldo: Number(r.saldo_actual), moneda: r.moneda, saldoPrincipal: r.saldo_principal == null ? null : Number(r.saldo_principal) })),
    presupuestos: presupuestos.rows.map((r) => ({ id: r.id, nombre: r.nombre_categoria, presupuesto: Number(r.presupuesto_mensual), gastado: Number(r.gastado) })),
    pendientes: Number(pendientes.rows[0].n),
    deudas,
    esteMes: mesActual.rows[0]
      ? { mes: mesActual.rows[0].mes, ingresos: Number(mesActual.rows[0].ingresos), egresos: Number(mesActual.rows[0].egresos), balance: Number(mesActual.rows[0].balance) }
      : { mes: new Date().toISOString().slice(0, 7), ingresos: 0, egresos: 0, balance: 0 },
    ultimos: ultimos.rows.map(aMovimiento),
  };
}

export interface TransaccionPendiente {
  id: string; monto: number; moneda: string; montoPrincipal: number | null; descripcion: string; fecha_hora: string; cuenta: string; tipo: "ingreso" | "egreso";
}

export async function obtenerPendientes(usuarioId: string): Promise<TransaccionPendiente[]> {
  const { rows } = await pool.query<{ id: string; monto: string; moneda: string; monto_principal: string | null; descripcion: string; fecha_hora: Date; cuenta: string; tipo: "ingreso" | "egreso" }>(
    `SELECT t.id, t.monto, t.moneda, t.monto_principal, COALESCE(t.descripcion, '') AS descripcion, t.fecha_hora, cu.nombre_cuenta AS cuenta, t.tipo
       FROM v_transacciones_principal t
       JOIN cuentas_bancarias cu ON cu.id = t.cuenta_id
       LEFT JOIN categorias ca ON ca.id = t.categoria_id
      WHERE t.usuario_id = $1 AND (t.categoria_id IS NULL OR ca.es_por_clasificar)
      ORDER BY t.fecha_hora DESC LIMIT 100`,
    [usuarioId],
  );
  return rows.map((r) => ({ id: r.id, monto: Number(r.monto), moneda: r.moneda, montoPrincipal: r.monto_principal == null ? null : Number(r.monto_principal), descripcion: r.descripcion, fecha_hora: new Date(r.fecha_hora).toISOString(), cuenta: r.cuenta, tipo: r.tipo }));
}

export interface CategoriaOpcion { id: string; nombre: string; tipo: "ingreso" | "egreso" }

export async function obtenerCategorias(usuarioId: string): Promise<CategoriaOpcion[]> {
  const { rows } = await pool.query<CategoriaOpcion>(
    `SELECT id, nombre_categoria AS nombre, tipo FROM categorias WHERE usuario_id = $1 AND NOT es_por_clasificar ORDER BY tipo, nombre_categoria`,
    [usuarioId],
  );
  return rows;
}

export interface Ajustes {
  nombre: string;
  moneda_principal: string;
  zona_horaria: string;
  cuentas: { id: string; nombre_cuenta: string; identificador_notificacion: string; moneda: string; saldo_actual: number }[];
  ultimaCotizacion: string | null;
}

export async function obtenerAjustes(usuarioId: string): Promise<Ajustes> {
  const [u, c, tc] = await Promise.all([
    pool.query<{ nombre: string; moneda_principal: string; zona_horaria: string }>(`SELECT nombre, moneda_principal, zona_horaria FROM usuarios WHERE id = $1`, [usuarioId]),
    pool.query<{ id: string; nombre_cuenta: string; identificador_notificacion: string; moneda: string; saldo_actual: string }>(
      `SELECT id, nombre_cuenta, identificador_notificacion, moneda, saldo_actual FROM cuentas_bancarias WHERE usuario_id = $1 ORDER BY creado_en`, [usuarioId]),
    pool.query<{ fecha: Date | null }>(`SELECT MAX(fecha) AS fecha FROM tipos_cambio`),
  ]);
  return {
    nombre: u.rows[0]?.nombre ?? "",
    moneda_principal: u.rows[0]?.moneda_principal ?? "EUR",
    zona_horaria: u.rows[0]?.zona_horaria ?? "UTC",
    cuentas: c.rows.map((r) => ({ ...r, saldo_actual: Number(r.saldo_actual) })),
    ultimaCotizacion: tc.rows[0]?.fecha ? new Date(tc.rows[0].fecha).toISOString().slice(0, 10) : null,
  };
}

export function formatoMoneda(valor: number | null, moneda: string): string {
  if (valor === null) return "—";
  try {
    return new Intl.NumberFormat("es", { style: "currency", currency: moneda, maximumFractionDigits: 2 }).format(valor);
  } catch {
    return `${valor.toFixed(2)} ${moneda}`;
  }
}

export interface ResumenMes { mes: string; etiqueta: string; ingresos: number; egresos: number; balance: number; movimientos: number; sinClasificar: number }

export function etiquetaMes(mesIso: string): string {
  const [y, m] = mesIso.split("-").map(Number);
  const txt = new Intl.DateTimeFormat("es", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export async function obtenerMeses(usuarioId: string): Promise<{ moneda: string; meses: ResumenMes[] }> {
  const { rows } = await pool.query<{ mes: string; moneda_principal: string; ingresos: string; egresos: string; balance: string; movimientos: string; sin_clasificar: string }>(
    `SELECT to_char(mes, 'YYYY-MM') AS mes, moneda_principal, ingresos, egresos, balance, movimientos, sin_clasificar
       FROM v_resumen_mensual WHERE usuario_id = $1 ORDER BY mes DESC`,
    [usuarioId],
  );
  const u = await pool.query<{ moneda_principal: string; zona_horaria: string }>(`SELECT moneda_principal, zona_horaria FROM usuarios WHERE id = $1`, [usuarioId]);
  const moneda = u.rows[0]?.moneda_principal ?? "EUR";
  const meses = rows.map((r) => ({ mes: r.mes, etiqueta: etiquetaMes(r.mes), ingresos: Number(r.ingresos), egresos: Number(r.egresos), balance: Number(r.balance), movimientos: Number(r.movimientos), sinClasificar: Number(r.sin_clasificar) }));
  // El mes en curso aparece aunque aún no tenga movimientos
  const actual = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", timeZone: u.rows[0]?.zona_horaria ?? "UTC" }).format(new Date());
  if (!meses.some((m) => m.mes === actual)) meses.unshift({ mes: actual, etiqueta: etiquetaMes(actual), ingresos: 0, egresos: 0, balance: 0, movimientos: 0, sinClasificar: 0 });
  return { moneda, meses };
}

export interface DetalleMes {
  mes: string; etiqueta: string; moneda: string;
  ingresos: number; egresos: number; balance: number;
  porCategoria: { id: string | null; nombre: string; tipo: "ingreso" | "egreso"; total: number; presupuesto: number; movimientos: number }[];
  dias: { fecha: string; etiqueta: string; total: number; movimientos: Movimiento[] }[];
}

export async function obtenerDetalleMes(usuarioId: string, mes: string): Promise<DetalleMes | null> {
  if (!/^\d{4}-\d{2}$/.test(mes)) return null;
  const mesDate = `${mes}-01`;
  const [u, cat, movs] = await Promise.all([
    pool.query<{ moneda_principal: string }>(`SELECT moneda_principal FROM usuarios WHERE id = $1`, [usuarioId]),
    pool.query<{ id: string | null; nombre: string; tipo: "ingreso" | "egreso"; total: string; presupuesto: string; movimientos: string }>(
      `SELECT t.categoria_id AS id, COALESCE(t.nombre_categoria, 'Por clasificar') AS nombre, t.tipo,
              COALESCE(SUM(t.monto_propio_principal), 0) AS total, COALESCE(MAX(c.presupuesto_mensual), 0) AS presupuesto, COUNT(*) AS movimientos
         FROM v_transacciones_principal t LEFT JOIN categorias c ON c.id = t.categoria_id
        WHERE t.usuario_id = $1 AND t.mes = $2::date
        GROUP BY t.categoria_id, t.nombre_categoria, t.tipo
        ORDER BY t.tipo, total DESC`,
      [usuarioId, mesDate],
    ),
    pool.query<FilaMovimiento>(
      `SELECT id, descripcion, tipo, nombre_categoria AS categoria, categoria_id, es_por_clasificar,
              monto, moneda, monto_principal, monto_propio_principal,
              companero_nombre, companero_id, porcentaje_propio, saldada_en,
              to_char(fecha_local, 'YYYY-MM-DD') AS fecha_local,
              to_char((fecha_hora AT TIME ZONE 'UTC') AT TIME ZONE zona_horaria, 'HH24:MI') AS hora_local,
              nombre_cuenta, origen_insercion
         FROM v_transacciones_principal WHERE usuario_id = $1 AND mes = $2::date
        ORDER BY fecha_hora DESC`,
      [usuarioId, mesDate],
    ),
  ]);
  const moneda = u.rows[0]?.moneda_principal ?? "EUR";
  const porCategoria = cat.rows.map((r) => ({ id: r.id, nombre: r.nombre, tipo: r.tipo, total: Number(r.total), presupuesto: Number(r.presupuesto), movimientos: Number(r.movimientos) }));
  const ingresos = porCategoria.filter((c) => c.tipo === "ingreso").reduce((a, c) => a + c.total, 0);
  const egresos = porCategoria.filter((c) => c.tipo === "egreso").reduce((a, c) => a + c.total, 0);
  const diasMap = new Map<string, DetalleMes["dias"][number]>();
  for (const r of movs.rows) {
    const etiquetaDia = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${r.fecha_local}T00:00:00Z`));
    const d = diasMap.get(r.fecha_local) ?? { fecha: r.fecha_local, etiqueta: etiquetaDia.charAt(0).toUpperCase() + etiquetaDia.slice(1), total: 0, movimientos: [] };
    const m = aMovimiento(r);
    d.movimientos.push(m);
    d.total += (m.montoPropio ?? 0) * (m.tipo === "egreso" ? -1 : 1); // el total del día cuenta solo tu parte
    diasMap.set(r.fecha_local, d);
  }
  return { mes, etiqueta: etiquetaMes(mes), moneda, ingresos, egresos, balance: ingresos - egresos, porCategoria, dias: [...diasMap.values()] };
}

export interface CuentaOpcion { id: string; nombre: string; moneda: string }

export async function obtenerCuentas(usuarioId: string): Promise<CuentaOpcion[]> {
  const { rows } = await pool.query<CuentaOpcion>(`SELECT id, nombre_cuenta AS nombre, moneda FROM cuentas_bancarias WHERE usuario_id = $1 ORDER BY creado_en`, [usuarioId]);
  return rows;
}

export interface PresupuestoFila { id: string; nombre: string; monto: number }

export async function obtenerPresupuestos(usuarioId: string): Promise<PresupuestoFila[]> {
  const { rows } = await pool.query<{ id: string; nombre_categoria: string; presupuesto_mensual: string }>(
    `SELECT id, nombre_categoria, presupuesto_mensual FROM categorias
      WHERE usuario_id = $1 AND tipo = 'egreso' AND NOT es_por_clasificar ORDER BY nombre_categoria`,
    [usuarioId],
  );
  return rows.map((r) => ({ id: r.id, nombre: r.nombre_categoria, monto: Number(r.presupuesto_mensual) }));
}

export interface Conexion {
  nombre: string;
  apiKey: string;
  ultimoWebhook: string | null;
  ultimoResultado: string | null;
}

export async function obtenerConexion(usuarioId: string): Promise<Conexion> {
  const { rows } = await pool.query<{ nombre: string; api_key_celular: string; ultimo_webhook: string | null; ultimo_webhook_resultado: string | null }>(
    `SELECT nombre, api_key_celular,
            to_char(ultimo_webhook, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ultimo_webhook, ultimo_webhook_resultado
       FROM usuarios WHERE id = $1`,
    [usuarioId],
  );
  const r = rows[0];
  return {
    nombre: r?.nombre ?? "",
    apiKey: r?.api_key_celular ?? "",
    ultimoWebhook: r?.ultimo_webhook ?? null, // ya en ISO con Z (la base guarda UTC)
    ultimoResultado: r?.ultimo_webhook_resultado ?? null,
  };
}

export interface TransaccionEditable {
  id: string;
  tipo: "ingreso" | "egreso";
  monto: number;
  moneda: string;
  descripcion: string;
  categoriaId: string | null;
  esPorClasificar: boolean;
  cuentaId: string;
  fechaLocal: string; // YYYY-MM-DD en la zona del usuario
  horaLocal: string;  // HH:MM en la zona del usuario
  companeroId: string | null;
  porcentajePropio: number;
}

/** Un movimiento del usuario con fecha y hora en SU zona horaria, listo para el formulario de edición. */
export async function obtenerTransaccion(usuarioId: string, id: string): Promise<TransaccionEditable | null> {
  const { rows } = await pool.query<{
    id: string; tipo: "ingreso" | "egreso"; monto: string; moneda: string; descripcion: string | null; categoria_id: string | null; es_por_clasificar: boolean | null;
    cuenta_id: string; fecha_local: string; hora_local: string; companero_id: string | null; porcentaje_propio: string;
  }>(
    `SELECT id, tipo, monto, moneda, descripcion, categoria_id, es_por_clasificar, cuenta_id,
            to_char(fecha_local, 'YYYY-MM-DD') AS fecha_local,
            to_char((fecha_hora AT TIME ZONE 'UTC') AT TIME ZONE zona_horaria, 'HH24:MI') AS hora_local,
            companero_id, porcentaje_propio
       FROM v_transacciones_principal WHERE id = $1 AND usuario_id = $2`,
    [id, usuarioId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, tipo: r.tipo, monto: Number(r.monto), moneda: r.moneda, descripcion: r.descripcion ?? "",
    categoriaId: r.categoria_id, esPorClasificar: !!r.es_por_clasificar, cuentaId: r.cuenta_id,
    fechaLocal: r.fecha_local, horaLocal: r.hora_local, companeroId: r.companero_id, porcentajePropio: Number(r.porcentaje_propio),
  };
}
