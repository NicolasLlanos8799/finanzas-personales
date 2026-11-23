// src/app/api/v1/transactions/auto/route.ts — webhook del iPhone
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { autenticarPorApiKey, anotarWebhook } from "@/lib/auth";
import { extraerDatosNotificacion, extraerImporte, parsearMonto } from "@/lib/parseo";
import { registrarTransaccion, mensajeConfirmacion, fmtMoneda, ErrorRegistro } from "@/lib/registrar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  texto_original: z.string().trim().max(2000).optional(),
  monto: z.union([z.number(), z.string()]).optional(),
  moneda: z.string().trim().toUpperCase().length(3).optional(),
  comercio: z.string().trim().min(1).max(200).optional(),
  tipo: z.enum(["ingreso", "egreso"]).optional(),
  cuenta: z.string().trim().min(1).max(100).optional(),
  fecha_hora: z.iso.datetime({ offset: true }).optional(),
  // Opcionales para atajos que ya sepan con quién dividir (nombre de un compañero guardado en Ajustes)
  dividir_con: z.string().trim().min(1).max(40).optional(),
  porcentaje_propio: z.number().gt(0).lt(100).optional(),
});

/** Convierte cualquier valor que mande iOS (texto, lista, objeto) en un solo texto. */
function aTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(aTexto).filter(Boolean).join(" ");
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).map(aTexto).filter(Boolean).join(" ");
  return "";
}

export async function POST(req: NextRequest) {
  const auth = await autenticarPorApiKey(req.headers);
  if ("error" in auth) return auth.error;
  const { usuario } = auth;

  // iOS puede enviar JSON limpio, el texto crudo de la notificación o un objeto con título y cuerpo.
  const crudo = await req.text();
  let entrada: unknown;
  try {
    entrada = JSON.parse(crudo);
  } catch {
    entrada = { texto_original: crudo };
  }
  if (typeof entrada === "string") entrada = { texto_original: entrada };
  if (entrada && typeof entrada === "object" && !Array.isArray(entrada)) {
    const o = entrada as Record<string, unknown>;
    for (const campo of ["texto_original", "comercio", "monto", "moneda"] as const) {
      if (o[campo] === undefined || typeof o[campo] === "number") continue;
      const t = aTexto(o[campo]).trim();
      // El atajo manda siempre los tres campos; con una notificación de texto, comercio y monto
      // llegan vacíos (o repitiendo el texto entero). Solo cuentan si aportan algo propio.
      // Con Wallet el texto ES el nombre del comercio, así que coincidir con él es normal; solo se
      // descarta si repite un aviso completo (con cifras), que es lo que llega con una notificación.
      const repiteAviso = campo !== "texto_original" && t === aTexto(o.texto_original).trim() && /\d/.test(t);
      if (!t || repiteAviso) delete o[campo];
      else o[campo] = t;
    }
    if (typeof o.moneda === "string" && !/^[A-Za-z]{3}$/.test(o.moneda)) delete o.moneda;
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(entrada);
  } catch (err) {
    const detalle = err instanceof z.ZodError ? z.flattenError(err).fieldErrors : "JSON inválido";
    console.error("[webhook auto] BODY_INVALIDO", { recibido: crudo.slice(0, 300) });
    return NextResponse.json({ ok: false, codigo: "BODY_INVALIDO", detalle }, { status: 400 });
  }

  // Prueba de conexión desde la web: comprueba clave y red sin registrar ningún movimiento
  if (body.texto_original?.includes("[prueba-finanzas]")) {
    await anotarWebhook(usuario.id, "PRUEBA");
    return NextResponse.json(
      { ok: true, prueba: true, mensaje_notificacion: "✅ Conexión correcta: tu iPhone ya puede registrar gastos en Finanzas" },
      { status: 200 },
    );
  }

  try {
    const resultado = await withTransaction(async (client) => {
      // La moneda de la cuenta se necesita para resolver "$" y "kr" ambiguos
      const cta = await client.query<{ moneda: string }>(
        `SELECT moneda FROM cuentas_bancarias WHERE usuario_id = $1 AND ($2::text IS NULL OR identificador_notificacion = $2) ORDER BY creado_en LIMIT 1`,
        [usuario.id, body.cuenta ?? null],
      );
      const monedaCuenta = cta.rows[0]?.moneda ?? usuario.moneda_principal;
      const ext = body.texto_original ? extraerDatosNotificacion(body.texto_original, monedaCuenta) : null;
      // Importe de Wallet: llega como texto con formato local ("1,00 kr.", "DKK 1,00", "12,50 €")
      const importeWallet = typeof body.monto === "string" ? extraerImporte(body.monto, monedaCuenta) : null;
      const monto = importeWallet?.monto ?? parsearMonto(body.monto) ?? ext?.monto ?? null;
      const comercio = body.comercio ?? ext?.comercio ?? null;
      const tipo = body.tipo ?? ext?.tipo ?? "egreso";
      const monedaDelImporte = typeof body.monto === "string" && /[^\d\s.,]/.test(body.monto) ? importeWallet?.moneda : undefined;
      const moneda = body.moneda ?? monedaDelImporte ?? ext?.moneda ?? monedaCuenta;
      if (!monto) {
        // La automatización de Wallet (disparador "Transacción") entrega el comercio y el importe
        // por separado; si el atajo pasa la transacción sin combinarlos en un texto, aquí solo
        // llega el nombre del comercio, sin ninguna cifra. Se distingue de un texto de banco que
        // el lector simplemente no supo interpretar, para dar una instrucción concreta.
        const soloComercioSinCifras = !!body.texto_original && !/\d/.test(body.texto_original);
        throw new ErrorRegistro(soloComercioSinCifras ? "SOLO_COMERCIO_SIN_IMPORTE" : "MONTO_NO_RECONOCIDO", 422);
      }
      // Un comercio que no se pudo leer NO impide registrar el pago: se guarda como
      // «Comercio desconocido» en «Por clasificar» y la web pregunta a qué rubro pertenece.

      const hash = createHash("sha256")
        .update(`${usuario.id}|${body.texto_original ?? ""}|${tipo}|${monto.toFixed(2)}|${moneda}|${(comercio ?? "").toLowerCase()}|${new Date().toISOString().slice(0, 16)}`)
        .digest("hex");

      return registrarTransaccion(client, {
        usuarioId: usuario.id, monedaPrincipal: usuario.moneda_principal,
        cuentaIdent: body.cuenta, monto, moneda, comercio: comercio ?? "", tipo,
        fechaHoraIso: body.fecha_hora, textoOriginal: body.texto_original,
        origen: "Webhook_iOS", hashDedup: hash,
        dividirCon: body.dividir_con, porcentajePropio: body.porcentaje_propio,
      });
    });

    await anotarWebhook(usuario.id, resultado.duplicado ? "DUPLICADO" : "OK");
    if (resultado.duplicado) {
      return NextResponse.json(
        { ok: true, duplicado: true, transaccion_id: resultado.transaccionId, mensaje_notificacion: `ℹ️ Ese movimiento de ${fmtMoneda(resultado.monto, resultado.moneda)} en ${resultado.comercio} ya estaba registrado` },
        { status: 200 },
      );
    }
    return NextResponse.json(
      {
        ok: true, duplicado: false,
        transaccion_id: resultado.transaccionId, tipo: resultado.tipo,
        monto: resultado.monto, moneda: resultado.moneda,
        monto_principal: resultado.montoPrincipal, moneda_principal: usuario.moneda_principal,
        comercio: resultado.comercio, cuenta: resultado.cuenta.nombre_cuenta, moneda_cuenta: resultado.cuenta.moneda,
        categoria: resultado.categoria.nombre_categoria, categoria_origen: resultado.categoria.origen, por_clasificar: resultado.categoria.es_por_clasificar,
        // Si no se conoce el rubro, el movimiento ya está guardado y se pide clasificarlo aquí
        pregunta_rubro: resultado.categoria.es_por_clasificar,
        clasificar_url: resultado.categoria.es_por_clasificar ? `${req.nextUrl.origin}/clasificar` : null,
        division: resultado.division
          ? { companero: resultado.division.companero, porcentaje_propio: resultado.division.porcentajePropio, monto_propio: resultado.division.montoPropio, recordada: resultado.division.recordada }
          : null,
        saldo_nuevo: resultado.saldoNuevo, fecha_hora: resultado.fechaHora,
        mensaje_notificacion: mensajeConfirmacion(resultado, usuario.moneda_principal),
      },
      { status: 201 },
    );
  } catch (err) {
    const status = err instanceof ErrorRegistro ? err.status : 500;
    const codigo = err instanceof Error ? err.message : "ERROR_INTERNO";
    await anotarWebhook(usuario.id, codigo);
    console.error("[webhook auto] ROLLBACK", {
      usuario: usuario.id,
      codigo,
      // solo cuando no se entiende el texto: ayuda a ajustar el lector a tu banco
      ...(status === 422 ? { recibido: crudo.slice(0, 300), tipoContenido: req.headers.get("content-type") } : {}),
    });
    const mensaje_notificacion =
      codigo === "SOLO_COMERCIO_SIN_IMPORTE"
        ? "❌ Solo llegó el comercio, sin el importe. Vuelve a instalar el atajo desde Finanzas → Ajustes → Conectar tu iPhone."
        : `❌ No se pudo registrar el movimiento (${codigo})`;
    return NextResponse.json({ ok: false, codigo, mensaje_notificacion }, { status });
  }
}

export function GET() {
  return NextResponse.json({ ok: false, codigo: "METODO_NO_PERMITIDO" }, { status: 405, headers: { Allow: "POST" } });
}
