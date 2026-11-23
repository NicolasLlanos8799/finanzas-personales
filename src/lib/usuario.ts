// src/lib/usuario.ts — usuario de la petición actual (solo servidor)
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, usuarioDeToken } from "@/lib/sesion";

export async function usuarioIdActual(): Promise<string | null> {
  const secreto = process.env.SESSION_SECRET;
  if (secreto) {
    const id = usuarioDeToken((await cookies()).get(COOKIE)?.value, secreto);
    if (id) return id;
  }
  // Comodidad en desarrollo local: sin sesión se usa el usuario de APP_USUARIO_ID. Nunca en producción.
  if (process.env.NODE_ENV !== "production" && process.env.APP_USUARIO_ID) return process.env.APP_USUARIO_ID;
  return null;
}

export async function requerirUsuarioId(): Promise<string> {
  const id = await usuarioIdActual();
  if (!id) redirect("/login");
  return id;
}
