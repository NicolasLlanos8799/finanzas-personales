// src/lib/altas.ts — alta de un usuario nuevo con su cuenta y categorías iniciales
import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

const EGRESOS = ["Alimentación", "Supermercado", "Transporte", "Servicios", "Gastos fijos", "Entretenimiento", "Salud", "Compras"];
const INGRESOS = ["Nómina", "Freelance", "Otros ingresos"];

export function nuevaApiKey(): string {
  return randomBytes(32).toString("hex");
}

export async function crearUsuario(
  client: PoolClient,
  d: { nombre: string; passwordHash: string; moneda: string; zona: string },
): Promise<string> {
  const u = await client.query<{ id: string }>(
    `INSERT INTO usuarios (nombre, correo, moneda_principal, api_key_celular, password_hash, zona_horaria)
     VALUES ($1, NULL, $2, $3, $4, $5) RETURNING id`,
    [d.nombre, d.moneda, nuevaApiKey(), d.passwordHash, d.zona],
  );
  const id = u.rows[0].id;
  await client.query(
    `INSERT INTO cuentas_bancarias (usuario_id, nombre_cuenta, identificador_notificacion, saldo_actual, moneda)
     VALUES ($1, 'Cuenta principal', 'CUENTA_PRINCIPAL', 0, $2)`,
    [id, d.moneda],
  );
  await client.query(
    `INSERT INTO categorias (usuario_id, nombre_categoria, tipo, presupuesto_mensual, es_por_clasificar)
     SELECT $1, n, 'egreso'::tipo_transaccion, 0, FALSE FROM unnest($2::text[]) AS n`,
    [id, EGRESOS],
  );
  await client.query(
    `INSERT INTO categorias (usuario_id, nombre_categoria, tipo, presupuesto_mensual, es_por_clasificar)
     VALUES ($1, 'Por Clasificar', 'egreso', 0, TRUE)`,
    [id],
  );
  await client.query(
    `INSERT INTO categorias (usuario_id, nombre_categoria, tipo, presupuesto_mensual, es_por_clasificar)
     SELECT $1, n, 'ingreso'::tipo_transaccion, 0, FALSE FROM unnest($2::text[]) AS n`,
    [id, INGRESOS],
  );
  return id;
}
