-- =====================================================================
-- 004 · Zona horaria del usuario, fecha local y meses · idempotente
-- =====================================================================
BEGIN;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS zona_horaria VARCHAR(64) NOT NULL DEFAULT 'Europe/Copenhagen';

-- fecha_hora se guarda en UTC (CURRENT_TIMESTAMP en Neon). La fecha "local" depende de la zona del usuario.
DROP VIEW IF EXISTS v_transacciones_principal;
CREATE OR REPLACE VIEW v_transacciones_principal AS
SELECT t.*,
       cu.usuario_id,
       cu.nombre_cuenta,
       u.moneda_principal,
       u.zona_horaria,
       ((t.fecha_hora AT TIME ZONE 'UTC') AT TIME ZONE u.zona_horaria)::date          AS fecha_local,
       date_trunc('month', (t.fecha_hora AT TIME ZONE 'UTC') AT TIME ZONE u.zona_horaria)::date AS mes,
       convertir(t.monto, t.moneda, u.moneda_principal, t.fecha_hora::date)             AS monto_principal,
       ca.nombre_categoria,
       ca.es_por_clasificar
FROM transacciones t
JOIN cuentas_bancarias cu ON cu.id = t.cuenta_id
JOIN usuarios u ON u.id = cu.usuario_id
LEFT JOIN categorias ca ON ca.id = t.categoria_id;

-- Resumen por mes (ingresos, egresos, balance) en la moneda principal
CREATE OR REPLACE VIEW v_resumen_mensual AS
SELECT usuario_id,
       mes,
       moneda_principal,
       COALESCE(SUM(monto_principal) FILTER (WHERE tipo = 'ingreso'), 0) AS ingresos,
       COALESCE(SUM(monto_principal) FILTER (WHERE tipo = 'egreso'),  0) AS egresos,
       COALESCE(SUM(monto_principal) FILTER (WHERE tipo = 'ingreso'), 0)
     - COALESCE(SUM(monto_principal) FILTER (WHERE tipo = 'egreso'),  0) AS balance,
       COUNT(*) AS movimientos,
       COUNT(*) FILTER (WHERE categoria_id IS NULL OR es_por_clasificar) AS sin_clasificar
FROM v_transacciones_principal
GROUP BY usuario_id, mes, moneda_principal;

CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON transacciones (fecha_hora DESC);

COMMIT;
