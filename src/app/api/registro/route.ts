// src/app/api/registro/route.ts — alta con nombre y contraseña, protegida por el enlace privado
import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { hashClave } from "@/lib/clave";
import { crearUsuario } from "@/lib/altas";
import { COOKIE, crearToken, opcionesCookie, registroPermitido } from "@/lib/sesion";
import { MONEDAS_SOPORTADAS } from "@/lib/parseo";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return NextResponse.json({ ok: false, codigo: "SESSION_SECRET_NO_CONFIGURADA" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const k = String(form?.get("k") ?? "");
  const nombre = String(form?.get("nombre") ?? "").trim().replace(/\s+/g, " ");
  const clave = String(form?.get("password") ?? "");

  const volver = (error: string) => {
    const url = new URL("/registro", req.nextUrl);
    url.searchParams.set("error", error);
    if (k) url.searchParams.set("k", k);
    if (nombre) url.searchParams.set("nombre", nombre);
    return NextResponse.redirect(url, 303);
  };

  if (!registroPermitido(k)) return NextResponse.redirect(new URL("/registro?error=cerrado", req.nextUrl), 303);
  if (form?.get("web")) return NextResponse.redirect(new URL("/login", req.nextUrl), 303); // trampa para bots
  if (nombre.length < 2 || nombre.length > 40 || !/^[\p{L}\p{N} ._-]+$/u.test(nombre)) return volver("nombre");
  if (clave.length < 6 || clave.length > 200) return volver("clave");

  const monedaForm = String(form?.get("moneda") ?? "");
  const moneda = (MONEDAS_SOPORTADAS as readonly string[]).includes(monedaForm) ? monedaForm : "EUR";
  const zonaForm = String(form?.get("zona") ?? "");
  const passwordHash = await hashClave(clave);

  try {
    const id = await withTransaction(async (client) => {
      let zona = "UTC";
      if (/^[A-Za-z_]+(\/[A-Za-z_+-]+){0,2}$/.test(zonaForm)) {
        const ok = await client.query(`SELECT 1 FROM pg_timezone_names WHERE name = $1`, [zonaForm]);
        if (ok.rowCount) zona = zonaForm;
      }
      return crearUsuario(client, { nombre, passwordHash, moneda, zona });
    });
    const res = NextResponse.redirect(new URL("/conectar", req.nextUrl), 303);
    res.cookies.set(COOKIE, crearToken(id, secreto), opcionesCookie());
    return res;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return volver("nombre_usado");
    console.error("[registro]", err);
    return volver("error");
  }
}
