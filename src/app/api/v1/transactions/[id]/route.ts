// src/app/api/v1/transactions/[id]/route.ts — PATCH categoría + aprendizaje del comercio
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { usuarioIdActual } from "@/lib/usuario";
import { recordarComercio } from "@/lib/categorizar";
import { eliminarTransaccion } from "@/lib/registrar";
import { buscarCompanero, recordarDivision, olvidarDivision, PORCENTAJE_PROPIO_DEFECTO } from "@/lib/companeros";

export const runtime = "nodejs";

const Schema = z
  .object({
    categoria_id: z.uuid().optional(),
    recordar: z.boolean().default(true),
    // Dividir: companero_id = uuid divide el gasto; null lo deja solo a tu nombre.
    companero_id: z.uuid().nullable().optional(),
    porcentaje_propio: z.number().gt(0).lt(100).optional(), // tu parte; 50 por defecto
    recordar_division: z.boolean().optional(),              // con companero_id: dividir siempre este comercio; con null: olvidarlo
  })
  .refine((b) => b.categoria_id !== undefined || b.companero_id !== undefined, { message: "Nada que actualizar" });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ ok: false, mensaje: "ID inválido" }, { status: 400 });

  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, mensaje: "Datos inválidos" }, { status: 400 });
  }

  const usuarioId = await usuarioIdActual();
  if (!usuarioId) return NextResponse.json({ ok: false, codigo: "NO_AUTORIZADO" }, { status: 401 });
  try {
    const actualizada = await withTransaction(async (client) => {
      let encontrada = false;

      if (body.categoria_id) {
        const upd = await client.query<{ descripcion: string | null }>(
          `UPDATE transacciones t
              SET categoria_id = c.id
             FROM categorias c, cuentas_bancarias cu
            WHERE t.id = $1 AND cu.id = t.cuenta_id AND cu.usuario_id = $3
              AND c.id = $2 AND c.usuario_id = $3 AND c.tipo = t.tipo
            RETURNING t.descripcion`,
          [id, body.categoria_id, usuarioId],
        );
        if (upd.rowCount === 0) return null;
        encontrada = true;
        if (body.recordar && upd.rows[0].descripcion) {
          await recordarComercio(client, usuarioId, upd.rows[0].descripcion, body.categoria_id);
        }
      }

      if (body.companero_id !== undefined) {
        let companeroId: string | null = null;
        let porcentaje = 100;
        if (body.companero_id !== null) {
          const comp = await buscarCompanero(client, usuarioId, { id: body.companero_id });
          if (!comp) throw Object.assign(new Error("COMPANERO_NO_ENCONTRADO"), { status: 404 });
          companeroId = comp.id;
          porcentaje = body.porcentaje_propio ?? PORCENTAJE_PROPIO_DEFECTO;
        }
        // Solo los gastos se dividen. Cambiar la división reabre la deuda (saldada_en = NULL).
        const upd = await client.query<{ descripcion: string | null }>(
          `UPDATE transacciones t
              SET companero_id = $3, porcentaje_propio = $4, saldada_en = NULL
             FROM cuentas_bancarias cu
            WHERE t.id = $1 AND cu.id = t.cuenta_id AND cu.usuario_id = $2
              AND ($3::uuid IS NULL OR t.tipo = 'egreso')
            RETURNING t.descripcion`,
          [id, usuarioId, companeroId, porcentaje.toFixed(2)],
        );
        if (upd.rowCount === 0) return null;
        encontrada = true;
        const desc = upd.rows[0].descripcion;
        if (desc && body.recordar_division) {
          if (companeroId) await recordarDivision(client, usuarioId, desc, companeroId, porcentaje);
          else await olvidarDivision(client, usuarioId, desc);
        }
      }
      return encontrada ? { ok: true } : null;
    });
    if (!actualizada) {
      return NextResponse.json({ ok: false, mensaje: "Transacción, categoría o compañero no encontrado, o el tipo no coincide" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, transaccion_id: id, categoria_id: body.categoria_id ?? null, recordado: body.categoria_id ? body.recordar : false, companero_id: body.companero_id ?? null });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return NextResponse.json({ ok: false, mensaje: "Compañero no encontrado" }, { status: 404 });
    console.error("[PATCH transaccion]", err);
    return NextResponse.json({ ok: false, mensaje: "Error al guardar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ ok: false, mensaje: "ID inválido" }, { status: 400 });
  const usuarioId = await usuarioIdActual();
  if (!usuarioId) return NextResponse.json({ ok: false, codigo: "NO_AUTORIZADO" }, { status: 401 });
  try {
    const borrada = await withTransaction((client) => eliminarTransaccion(client, usuarioId, id));
    if (!borrada) return NextResponse.json({ ok: false, mensaje: "Movimiento no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, transaccion_id: id });
  } catch (err) {
    console.error("[DELETE transaccion]", err);
    return NextResponse.json({ ok: false, mensaje: "Error al eliminar" }, { status: 500 });
  }
}
