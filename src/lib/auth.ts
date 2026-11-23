// src/lib/auth.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export interface UsuarioAutenticado {
  id: string;
  nombre: string;
  moneda_principal: string;
}

const BEARER_RE = /^Bearer\s+(.+)$/i;
// Las claves que genera el servidor son siempre 64 caracteres hexadecimales en minúscula
// (randomBytes(32).toString("hex")), sin guiones ni espacios. Atajos, al pegar un texto largo
// sin espacios en un campo estrecho, a veces lo parte visualmente con un guion o un salto de
// línea; ese carácter no forma parte de la clave real. Se ignora cualquier cosa que no sea
// hexadecimal antes de comparar, en vez de exigir un pegado perfecto.
const NO_HEX = /[^0-9a-f]/gi;

/** Extrae la clave del header, tolerando guiones o espacios de line-wrap. Null si no hay nada aprovechable. */
export function extraerApiKey(headers: Headers): string | null {
  const raw = headers.get("authorization") ?? "";
  const match = BEARER_RE.exec(raw.trim());
  if (!match) return null;
  const limpia = match[1].replace(NO_HEX, "").toLowerCase();
  return limpia.length >= 32 && limpia.length <= 64 ? limpia : null;
}

/** Busca el usuario dueño de la clave. Usa el índice UNIQUE de api_key_celular. */
export async function buscarUsuarioPorApiKey(apiKey: string): Promise<UsuarioAutenticado | null> {
  const { rows } = await pool.query<UsuarioAutenticado>(
    `SELECT id, nombre, moneda_principal
       FROM usuarios
      WHERE api_key_celular = $1
      LIMIT 1`,
    [apiKey],
  );
  return rows[0] ?? null;
}

/**
 * Autentica la petición. Devuelve el usuario o una NextResponse de error lista para retornar.
 * 401 -> header ausente o mal formado. 412 -> clave con formato correcto pero desconocida.
 */
export async function autenticarPorApiKey(
  headers: Headers,
): Promise<{ usuario: UsuarioAutenticado } | { error: NextResponse }> {
  const apiKey = extraerApiKey(headers);
  if (!apiKey) {
    return {
      error: NextResponse.json(
        { ok: false, codigo: "AUTH_HEADER_INVALIDO", mensaje: "Falta Authorization: Bearer <api_key>" },
        { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="finanzas"' } },
      ),
    };
  }

  const usuario = await buscarUsuarioPorApiKey(apiKey);
  if (!usuario) {
    return {
      error: NextResponse.json(
        { ok: false, codigo: "API_KEY_DESCONOCIDA", mensaje: "La API key no coincide con ningún usuario" },
        { status: 412 },
      ),
    };
  }

  return { usuario };
}

/** Guarda cuándo llegó el último aviso del iPhone y cómo terminó; la página Conectar lo muestra. */
export async function anotarWebhook(usuarioId: string, resultado: string): Promise<void> {
  try {
    await pool.query(`UPDATE usuarios SET ultimo_webhook = now(), ultimo_webhook_resultado = $2 WHERE id = $1`, [usuarioId, resultado.slice(0, 60)]);
  } catch {
    // no debe romper el registro del movimiento
  }
}
