// src/app/api/v1/companeros/[id]/route.ts — DELETE archiva al compañero (el historial se conserva)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { usuarioIdActual } from "@/lib/usuario";
import { archivarCompanero } from "@/lib/companeros";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ ok: false, mensaje: "ID inválido" }, { status: 400 });
  const usuarioId = await usuarioIdActual();
  if (!usuarioId) return NextResponse.json({ ok: false, codigo: "NO_AUTORIZADO" }, { status: 401 });
  try {
    const ok = await withTransaction((client) => archivarCompanero(client, usuarioId, id));
    if (!ok) return NextResponse.json({ ok: false, mensaje: "Compañero no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE companero]", err);
    return NextResponse.json({ ok: false, mensaje: "No se pudo quitar" }, { status: 500 });
  }
}
