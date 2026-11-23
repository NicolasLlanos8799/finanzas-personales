// src/lib/db.ts
import { Pool, type PoolClient } from "pg";

// sslmode=verify-full explícito: es lo que pg ya hacía con "require" y evita su aviso de cambio futuro
const connectionString = process.env.DATABASE_URL?.replace("sslmode=require", "sslmode=verify-full");
if (!connectionString) {
  throw new Error("DATABASE_URL no está definida. Revisa .env.local o `vercel env pull`.");
}

declare global {
  // Evita crear varios pools en hot-reload de desarrollo
  var __pgPool: Pool | undefined;
}

export const pool: Pool =
  global.__pgPool ??
  new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true },
  });

if (process.env.NODE_ENV !== "production") global.__pgPool = pool;

/**
 * Ejecuta `fn` dentro de una transacción explícita.
 * COMMIT si `fn` resuelve; ROLLBACK si lanza. Siempre libera el cliente.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Si el ROLLBACK falla la conexión ya está rota; pg la descarta al liberar.
    }
    throw err;
  } finally {
    client.release();
  }
}
