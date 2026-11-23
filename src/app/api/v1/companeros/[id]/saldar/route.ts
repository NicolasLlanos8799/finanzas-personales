// src/app/api/v1/companeros/[id]/saldar/route.ts — marca como saldados los gastos pendientes con ese compañero
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { usuarioIdActual } from "@/lib/usuario";
import { saldarCon } from "@/lib/companeros";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ ok: false, mensaje: "ID inválido" }, { status: 400 });
  const usuarioId = await usuarioIdActual();
  if (!usuarioId) return NextResponse.json({ ok: false, codigo: "NO_AUTORIZADO" }, { status: 401 });
  try {
    const saldados = await withTransaction((client) => saldarCon(client, usuarioId, id));
    return NextResponse.json({ ok: true, saldados });
  } catch (err) {
    console.error("[POST saldar]", err);
    return NextResponse.json({ ok: false, mensaje: "No se pudo saldar" }, { status: 500 });
  }
}
