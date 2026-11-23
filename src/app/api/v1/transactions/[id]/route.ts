// src/app/api/v1/transactions/[id]/route.ts — PATCH categoría + aprendizaje del comercio
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { usuarioIdActual } from "@/lib/usuario";
import { recordarComercio } from "@/lib/categorizar";
import { eliminarTransaccion } from "@/lib/registrar";

export const runtime = "nodejs";

const Schema = z.object({ categoria_id: z.uuid(), recordar: z.boolean().default(true) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ ok: false, mensaje: "ID inválido" }, { status: 400 });

  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, mensaje: "categoria_id inválido" }, { status: 400 });
  }

  const usuarioId = await usuarioIdActual();
  if (!usuarioId) return NextResponse.json({ ok: false, codigo: "NO_AUTORIZADO" }, { status: 401 });
  try {
    const actualizada = await withTransaction(async (client) => {
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
      if (body.recordar && upd.rows[0].descripcion) {
        await recordarComercio(client, usuarioId, upd.rows[0].descripcion, body.categoria_id);
      }
      return upd.rows[0];
    });
    if (!actualizada) {
      return NextResponse.json({ ok: false, mensaje: "Transacción o categoría no encontrada, o el tipo no coincide" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, transaccion_id: id, categoria_id: body.categoria_id, recordado: body.recordar });
  } catch (err) {
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
