// src/app/api/v1/conexion/route.ts — estado del último aviso recibido del iPhone (lo consulta la página Conectar)
import { NextResponse } from "next/server";
import { obtenerConexion } from "@/lib/queries";
import { usuarioIdActual } from "@/lib/usuario";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const usuarioId = await usuarioIdActual();
  if (!usuarioId) return NextResponse.json({ ok: false, codigo: "NO_AUTORIZADO" }, { status: 401 });
  const c = await obtenerConexion(usuarioId);
  return NextResponse.json({ ultimoWebhook: c.ultimoWebhook, resultado: c.ultimoResultado }, { headers: { "Cache-Control": "no-store" } });
}
