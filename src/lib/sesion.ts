// src/lib/sesion.ts — sesión por cookie firmada (HMAC-SHA256) que lleva el id del usuario.
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const COOKIE = "finanzas_sesion";
export const DURACION_SEG = 60 * 60 * 24 * 90; // 90 días, renovados en cada visita
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firmar(carga: string, secreto: string): string {
  return createHmac("sha256", secreto).update(`sesion.${carga}`).digest("hex");
}

export function crearToken(usuarioId: string, secreto: string, ahoraMs = Date.now()): string {
  const exp = Math.floor(ahoraMs / 1000) + DURACION_SEG;
  const carga = `${usuarioId}.${exp}`;
  return `${carga}.${firmar(carga, secreto)}`;
}

/** Devuelve el id del usuario si la cookie es auténtica y no ha caducado; si no, null. */
export function usuarioDeToken(token: string | undefined, secreto: string, ahoraMs = Date.now()): string | null {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [id, expTxt, firma] = partes;
  const exp = Number(expTxt);
  if (!UUID.test(id) || !Number.isInteger(exp) || exp * 1000 < ahoraMs) return null;
  const esperado = Buffer.from(firmar(`${id}.${exp}`, secreto));
  const recibido = Buffer.from(firma);
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido) ? id : null;
}

/** Comparación en tiempo constante, sin filtrar la longitud. */
export function igualesSeguros(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

export function opcionesCookie() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: DURACION_SEG,
  };
}

/** Solo rutas internas: evita redirecciones abiertas hacia otros sitios. */
export function destinoSeguro(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") && !next.startsWith("/registro") && !next.startsWith("/api/") ? next : "/";
}

/** ¿Está el registro abierto para este enlace? Con REGISTRO_TOKEN definido, hace falta el enlace privado. */
export function registroPermitido(k: string | null | undefined): boolean {
  const token = process.env.REGISTRO_TOKEN;
  return !token || (!!k && igualesSeguros(k, token));
}
