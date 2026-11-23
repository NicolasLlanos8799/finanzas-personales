// src/lib/companeros.ts — compañeros con los que se dividen gastos (pareja, piso compartido…)
import type { PoolClient } from "pg";
import { normalizarComercio } from "@/lib/categorizar";

export const PORCENTAJE_PROPIO_DEFECTO = 50;

export interface Companero { id: string; nombre: string }

type Db = Pick<PoolClient, "query">;

export async function listarCompaneros(db: Db, usuarioId: string): Promise<Companero[]> {
  const { rows } = await db.query<Companero>(
    `SELECT id, nombre FROM companeros WHERE usuario_id = $1 AND activo ORDER BY creado_en, nombre`,
    [usuarioId],
  );
  return rows;
}

/** Crea el compañero; si ya existía (incluso archivado) lo reactiva. */
export async function agregarCompanero(db: Db, usuarioId: string, nombre: string): Promise<Companero> {
  const limpio = nombre.replace(/\s+/g, " ").trim();
  const { rows } = await db.query<Companero>(
    `INSERT INTO companeros (usuario_id, nombre) VALUES ($1, $2)
     ON CONFLICT (usuario_id, lower(nombre)) DO UPDATE SET activo = TRUE
     RETURNING id, nombre`,
    [usuarioId, limpio],
  );
  return rows[0];
}

/** Archiva: deja de ofrecerse, pero los gastos ya divididos conservan su historial. */
export async function archivarCompanero(db: Db, usuarioId: string, id: string): Promise<boolean> {
  const r = await db.query(`UPDATE companeros SET activo = FALSE WHERE id = $1 AND usuario_id = $2`, [id, usuarioId]);
  if (!r.rowCount) return false;
  await db.query(`DELETE FROM divisiones_conocidas WHERE companero_id = $1 AND usuario_id = $2`, [id, usuarioId]);
  return true;
}

/** Compañero activo del usuario por id o por nombre (sin distinguir mayúsculas). */
export async function buscarCompanero(db: Db, usuarioId: string, ref: { id?: string; nombre?: string }): Promise<Companero | null> {
  const { rows } = await db.query<Companero>(
    `SELECT id, nombre FROM companeros
      WHERE usuario_id = $1 AND activo
        AND ($2::uuid IS NULL OR id = $2)
        AND ($3::text IS NULL OR lower(nombre) = lower($3))
      LIMIT 1`,
    [usuarioId, ref.id ?? null, ref.nombre?.trim() || null],
  );
  return rows[0] ?? null;
}

export interface DivisionConocida { companeroId: string; nombre: string; porcentajePropio: number }

/** ¿El usuario pidió dividir siempre este comercio con alguien? */
export async function divisionConocida(db: Db, usuarioId: string, comercio: string): Promise<DivisionConocida | null> {
  const norm = normalizarComercio(comercio);
  if (!norm) return null;
  const { rows } = await db.query<{ companero_id: string; nombre: string; porcentaje_propio: string }>(
    `SELECT d.companero_id, c.nombre, d.porcentaje_propio
       FROM divisiones_conocidas d JOIN companeros c ON c.id = d.companero_id AND c.activo
      WHERE d.usuario_id = $1 AND d.comercio_normalizado = $2`,
    [usuarioId, norm],
  );
  const r = rows[0];
  return r ? { companeroId: r.companero_id, nombre: r.nombre, porcentajePropio: Number(r.porcentaje_propio) } : null;
}

export async function recordarDivision(db: Db, usuarioId: string, comercio: string, companeroId: string, porcentajePropio: number): Promise<void> {
  const norm = normalizarComercio(comercio);
  if (!norm || !(porcentajePropio > 0 && porcentajePropio < 100)) return;
  await db.query(
    `INSERT INTO divisiones_conocidas (usuario_id, comercio_normalizado, companero_id, porcentaje_propio)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (usuario_id, comercio_normalizado)
     DO UPDATE SET companero_id = EXCLUDED.companero_id, porcentaje_propio = EXCLUDED.porcentaje_propio, actualizado_en = CURRENT_TIMESTAMP`,
    [usuarioId, norm, companeroId, porcentajePropio.toFixed(2)],
  );
}

export async function olvidarDivision(db: Db, usuarioId: string, comercio: string): Promise<void> {
  const norm = normalizarComercio(comercio);
  if (!norm) return;
  await db.query(`DELETE FROM divisiones_conocidas WHERE usuario_id = $1 AND comercio_normalizado = $2`, [usuarioId, norm]);
}

export interface Deuda { companeroId: string; nombre: string; pendiente: number; movimientos: number }

export async function obtenerDeudas(db: Db, usuarioId: string): Promise<Deuda[]> {
  const { rows } = await db.query<{ companero_id: string; companero_nombre: string; pendiente: string; movimientos: string }>(
    `SELECT companero_id, companero_nombre, pendiente, movimientos FROM v_deuda_companeros WHERE usuario_id = $1 ORDER BY pendiente DESC`,
    [usuarioId],
  );
  return rows.map((r) => ({ companeroId: r.companero_id, nombre: r.companero_nombre, pendiente: Number(r.pendiente), movimientos: Number(r.movimientos) }));
}

/** Marca como saldados todos los gastos pendientes con ese compañero. Devuelve cuántos. */
export async function saldarCon(db: Db, usuarioId: string, companeroId: string): Promise<number> {
  const r = await db.query(
    `UPDATE transacciones t SET saldada_en = CURRENT_TIMESTAMP
       FROM cuentas_bancarias cu
      WHERE cu.id = t.cuenta_id AND cu.usuario_id = $1
        AND t.companero_id = $2 AND t.saldada_en IS NULL`,
    [usuarioId, companeroId],
  );
  return r.rowCount ?? 0;
}
