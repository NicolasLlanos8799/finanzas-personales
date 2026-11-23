// src/app/api/login/route.ts — acceso con nombre y contraseña
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verificarClave } from "@/lib/clave";
import { COOKIE, crearToken, destinoSeguro, opcionesCookie } from "@/lib/sesion";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return NextResponse.json({ ok: false, codigo: "SESSION_SECRET_NO_CONFIGURADA" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const nombre = String(form?.get("nombre") ?? "").trim().replace(/\s+/g, " ");
  const clave = String(form?.get("password") ?? "");
  const destino = destinoSeguro(String(form?.get("next") ?? ""));

  const { rows } = await pool.query<{ id: string; password_hash: string | null }>(
    `SELECT id, password_hash FROM usuarios WHERE lower(nombre) = lower($1) LIMIT 1`,
    [nombre],
  );
  const usuario = rows[0];
  const ok = await verificarClave(clave, usuario?.password_hash); // mismo coste exista o no el usuario

  if (!usuario || !ok) {
    await new Promise((r) => setTimeout(r, 600)); // frena la fuerza bruta
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("error", "1");
    if (nombre) url.searchParams.set("nombre", nombre);
    if (destino !== "/") url.searchParams.set("next", destino);
    return NextResponse.redirect(url, 303);
  }

  pool.query(`UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1`, [usuario.id]).catch(() => {});
  const res = NextResponse.redirect(new URL(destino, req.nextUrl), 303);
  res.cookies.set(COOKIE, crearToken(usuario.id, secreto), opcionesCookie());
  return res;
}
