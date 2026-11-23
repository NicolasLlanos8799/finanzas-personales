// src/lib/cambio.ts
// Cotizaciones diarias. Fuente: open.er-api.com (ExchangeRate-API, endpoint abierto, sin clave,
// ~160 monedas, actualización diaria). Se cachea en la tabla tipos_cambio (base USD) una vez al día.
import type { PoolClient, Pool } from "pg";

const FUENTE = "https://open.er-api.com/v6/latest/USD";

type Ejecutor = Pick<PoolClient, "query"> | Pick<Pool, "query">;

interface RespuestaApi {
  result: string;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
}

/** Garantiza que exista la cotización de hoy (UTC). Idempotente; si la API falla, no lanza: se usará la última cacheada. */
export async function asegurarTasasDelDia(db: Ejecutor): Promise<{ fecha: string; nuevas: number }> {
  const hoy = new Date().toISOString().slice(0, 10);
  const existe = await db.query<{ n: string }>(`SELECT COUNT(*)::int AS n FROM tipos_cambio WHERE fecha = $1`, [hoy]);
  if (Number(existe.rows[0].n) > 0) return { fecha: hoy, nuevas: 0 };

  try {
    const res = await fetch(FUENTE, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as RespuestaApi;
    if (json.result !== "success" || !json.rates) throw new Error("respuesta inválida");

    const monedas = Object.keys(json.rates);
    const valores = monedas.map((m) => json.rates![m]);
    await db.query(
      `INSERT INTO tipos_cambio (fecha, moneda, tasa_por_usd, fuente)
       SELECT $1::date, m, t, 'open.er-api.com'
         FROM unnest($2::text[], $3::numeric[]) AS x(m, t)
       ON CONFLICT (fecha, moneda) DO NOTHING`,
      [hoy, monedas, valores],
    );
    return { fecha: hoy, nuevas: monedas.length };
  } catch (err) {
    console.warn("[cambio] no se pudo actualizar la cotización de hoy:", err instanceof Error ? err.message : err);
    return { fecha: hoy, nuevas: 0 };
  }
}

/** Convierte en la app (misma lógica que la función SQL convertir()). */
export async function convertir(db: Ejecutor, monto: number, de: string, a: string, fecha?: string): Promise<number | null> {
  if (de === a) return monto;
  const { rows } = await db.query<{ v: string | null }>(`SELECT convertir($1, $2, $3, $4::date) AS v`, [monto, de, a, fecha ?? new Date().toISOString().slice(0, 10)]);
  return rows[0]?.v === null || rows[0]?.v === undefined ? null : Number(rows[0].v);
}
