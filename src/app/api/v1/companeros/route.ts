// src/app/api/v1/companeros/route.ts — compañeros con los que dividir gastos (GET lista, POST agrega)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { usuarioIdActual } from "@/lib/usuario";
import { agregarCompanero, listarCompaneros } from "@/lib/companeros";

export const runtime = "nodejs";

const MAX_COMPANEROS = 8;
const Schema = z.object({
  nombre: z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N} .'-]+$/u, "Solo letras, números y espacios"),
});

export async function GET() {
  const usuarioId = await usuarioIdActual();
  if (!usuarioId) return NextResponse.json({ ok: false, codigo: "NO_AUTORIZADO" }, { status: 401 });
  return NextResponse.json({ ok: true, companeros: await listarCompaneros(pool, usuarioId) });
}

export async function POST(req: NextRequest) {
  const usuarioId = await usuarioIdActual();
  if (!usuarioId) return NextResponse.json({ ok: false, codigo: "NO_AUTORIZADO" }, { status: 401 });

  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, mensaje: "Escribe un nombre (letras y números, hasta 40 caracteres)" }, { status: 400 });
  }

  try {
    const actuales = await listarCompaneros(pool, usuarioId);
    const yaEsta = actuales.some((c) => c.nombre.toLowerCase() === body.nombre.toLowerCase());
    if (!yaEsta && actuales.length >= MAX_COMPANEROS) {
      return NextResponse.json({ ok: false, mensaje: `Puedes guardar hasta ${MAX_COMPANEROS} compañeros` }, { status: 422 });
    }
    const companero = await agregarCompanero(pool, usuarioId, body.nombre);
    return NextResponse.json({ ok: true, companero }, { status: yaEsta ? 200 : 201 });
  } catch (err) {
    console.error("[POST companeros]", err);
    return NextResponse.json({ ok: false, mensaje: "No se pudo guardar" }, { status: 500 });
  }
}
