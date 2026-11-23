// src/app/api/v1/transactions/route.ts — alta manual desde la web (protegida por el proxy Basic Auth)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction, pool } from "@/lib/db";
import { usuarioIdActual } from "@/lib/usuario";
import { parsearMonto, MONEDAS_SOPORTADAS } from "@/lib/parseo";
import { registrarTransaccion, mensajeConfirmacion, ErrorRegistro } from "@/lib/registrar";
import { recordarDivision } from "@/lib/companeros";

export const runtime = "nodejs";

const Schema = z.object({
  tipo: z.enum(["ingreso", "egreso"]),
  monto: z.union([z.number(), z.string()]),
  moneda: z.enum(MONEDAS_SOPORTADAS).optional(),
  comercio: z.string().trim().min(1).max(200),
  categoria_id: z.uuid().optional().nullable(),
  cuenta_id: z.uuid().optional(),
  fecha: z.iso.date().optional(), // YYYY-MM-DD en la zona del usuario
  // Dividir con un compañero guardado en Ajustes (solo gastos). Tu parte, en %, 50 por defecto.
  companero_id: z.uuid().optional().nullable(),
  porcentaje_propio: z.number().gt(0).lt(100).optional(),
  recordar_division: z.boolean().optional(), // dividir siempre este comercio con ese compañero
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ ok: false, codigo: "BODY_INVALIDO", detalle: err instanceof z.ZodError ? z.flattenError(err).fieldErrors : undefined }, { status: 400 });
  }
  const monto = parsearMonto(body.monto);
  if (!monto) return NextResponse.json({ ok: false, codigo: "MONTO_NO_RECONOCIDO", mensaje: "Importe inválido" }, { status: 422 });

  const usuarioId = await usuarioIdActual();
  if (!usuarioId) return NextResponse.json({ ok: false, codigo: "NO_AUTORIZADO" }, { status: 401 });
  const u = await pool.query<{ moneda_principal: string }>(`SELECT moneda_principal FROM usuarios WHERE id = $1`, [usuarioId]);
  const monedaPrincipal = u.rows[0]?.moneda_principal ?? "EUR";

  try {
    const r = await withTransaction(async (client) => {
      const res = await registrarTransaccion(client, {
        usuarioId, monedaPrincipal,
        cuentaId: body.cuenta_id, monto, moneda: body.moneda, comercio: body.comercio, tipo: body.tipo,
        categoriaId: body.categoria_id ?? undefined, fechaLocal: body.fecha, origen: "Manual_Web",
        companeroId: body.companero_id ?? undefined, porcentajePropio: body.porcentaje_propio,
      });
      if (!res.duplicado && body.recordar_division && res.division) {
        await recordarDivision(client, usuarioId, res.comercio, res.division.companeroId, res.division.porcentajePropio);
      }
      return res;
    });
    if (r.duplicado) return NextResponse.json({ ok: true, duplicado: true }, { status: 200 });
    return NextResponse.json(
      { ok: true, transaccion_id: r.transaccionId, categoria: r.categoria.nombre_categoria, por_clasificar: r.categoria.es_por_clasificar, saldo_nuevo: r.saldoNuevo, mensaje: mensajeConfirmacion(r, monedaPrincipal) },
      { status: 201 },
    );
  } catch (err) {
    const status = err instanceof ErrorRegistro ? err.status : 500;
    const codigo = err instanceof Error ? err.message : "ERROR_INTERNO";
    console.error("[POST manual] ROLLBACK", codigo);
    return NextResponse.json({ ok: false, codigo, mensaje: `No se pudo guardar (${codigo})` }, { status });
  }
}
