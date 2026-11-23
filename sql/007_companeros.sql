-- 007_companeros.sql — dividir gastos con otras personas (pareja, compañeros de piso…)
--
-- Modelo:
--   · cada usuario guarda sus propios "compañeros" (p. ej. Mar);
--   · una transacción puede llevar companero_id + porcentaje_propio (tu parte, 50 por defecto);
--   · el saldo de la cuenta NO cambia: el banco cobró el total. Lo que cambia es lo que cuenta
--     como TU gasto (resúmenes, presupuestos, categorías) -> monto_propio_principal;
--   · lo que el compañero te debe = total - tu parte, mientras la transacción no esté saldada;
--   · se puede recordar "este comercio se divide siempre con X" (divisiones_conocidas).
BEGIN;

CREATE TABLE IF NOT EXISTS companeros (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre     VARCHAR(40) NOT NULL,
  activo     BOOLEAN     NOT NULL DEFAULT TRUE,   -- "quitar" archiva: el historial de gastos se conserva
  creado_en  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_companero_nombre CHECK (char_length(trim(nombre)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_companeros_usuario_nombre ON companeros (usuario_id, lower(nombre));

ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS companero_id      UUID REFERENCES companeros(id);
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS porcentaje_propio NUMERIC(5,2) NOT NULL DEFAULT 100;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS saldada_en        TIMESTAMP;

ALTER TABLE transacciones DROP CONSTRAINT IF EXISTS chk_transaccion_porcentaje;
ALTER TABLE transacciones ADD CONSTRAINT chk_transaccion_porcentaje
  CHECK (porcentaje_propio > 0 AND porcentaje_propio <= 100 AND (companero_id IS NOT NULL OR porcentaje_propio = 100));

CREATE INDEX IF NOT EXISTS idx_transacciones_companero_pendiente
  ON transacciones (companero_id) WHERE companero_id IS NOT NULL AND saldada_en IS NULL;

CREATE TABLE IF NOT EXISTS divisiones_conocidas (
  usuario_id           UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  comercio_normalizado VARCHAR(200) NOT NULL,
  companero_id         UUID         NOT NULL REFERENCES companeros(id) ON DELETE CASCADE,
  porcentaje_propio    NUMERIC(5,2) NOT NULL CHECK (porcentaje_propio > 0 AND porcentaje_propio < 100),
  actualizado_en       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, comercio_normalizado)
);

-- Las vistas dependen de transacciones.* (columnas nuevas): se recrean, igual que en 004.
DROP VIEW IF EXISTS v_resumen_mensual;
DROP VIEW IF EXISTS v_transacciones_principal;

CREATE VIEW v_transacciones_principal AS
SELECT t.*,
       cu.usuario_id,
       cu.nombre_cuenta,
       u.moneda_principal,
       u.zona_horaria,
       ((t.fecha_hora AT TIME ZONE 'UTC') AT TIME ZONE u.zona_horaria)::date          AS fecha_local,
       date_trunc('month', (t.fecha_hora AT TIME ZONE 'UTC') AT TIME ZONE u.zona_horaria)::date AS mes,
       convertir(t.monto, t.moneda, u.moneda_principal, t.fecha_hora::date)             AS monto_principal,
       ca.nombre_categoria,
       ca.es_por_clasificar,
       -- lo que de verdad es MI gasto (igual a monto_principal si no se divide)
       ROUND(convertir(t.monto, t.moneda, u.moneda_principal, t.fecha_hora::date) * t.porcentaje_propio / 100, 2) AS monto_propio_principal,
       co.nombre                                                                       AS companero_nombre
FROM transacciones t
JOIN cuentas_bancarias cu ON cu.id = t.cuenta_id
JOIN usuarios u ON u.id = cu.usuario_id
LEFT JOIN categorias ca ON ca.id = t.categoria_id
LEFT JOIN companeros co ON co.id = t.companero_id;

CREATE VIEW v_resumen_mensual AS
SELECT usuario_id,
       mes,
       moneda_principal,
       COALESCE(SUM(monto_propio_principal) FILTER (WHERE tipo = 'ingreso'), 0) AS ingresos,
       COALESCE(SUM(monto_propio_principal) FILTER (WHERE tipo = 'egreso'),  0) AS egresos,
       COALESCE(SUM(monto_propio_principal) FILTER (WHERE tipo = 'ingreso'), 0)
     - COALESCE(SUM(monto_propio_principal) FILTER (WHERE tipo = 'egreso'),  0) AS balance,
       COUNT(*) AS movimientos,
       COUNT(*) FILTER (WHERE categoria_id IS NULL OR es_por_clasificar) AS sin_clasificar
FROM v_transacciones_principal
GROUP BY usuario_id, mes, moneda_principal;

-- Lo que cada compañero te debe (en tu moneda principal) mientras no se salde.
CREATE VIEW v_deuda_companeros AS
SELECT t.usuario_id,
       t.companero_id,
       t.companero_nombre,
       t.moneda_principal,
       SUM(t.monto_principal - t.monto_propio_principal) AS pendiente,
       COUNT(*)                                          AS movimientos
FROM v_transacciones_principal t
WHERE t.companero_id IS NOT NULL AND t.tipo = 'egreso' AND t.saldada_en IS NULL
GROUP BY t.usuario_id, t.companero_id, t.companero_nombre, t.moneda_principal;

COMMIT;
