-- =====================================================================
-- 003 · Multi-moneda + memoria de comercios · idempotente
-- =====================================================================
BEGIN;

-- Moneda por cuenta y por transacción (código ISO 4217)
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS moneda CHAR(3) NOT NULL DEFAULT 'DKK';
ALTER TABLE transacciones     ADD COLUMN IF NOT EXISTS moneda CHAR(3) NOT NULL DEFAULT 'DKK';
ALTER TABLE cuentas_bancarias DROP CONSTRAINT IF EXISTS chk_cuenta_moneda;
ALTER TABLE cuentas_bancarias ADD CONSTRAINT chk_cuenta_moneda CHECK (moneda ~ '^[A-Z]{3}$');
ALTER TABLE transacciones     DROP CONSTRAINT IF EXISTS chk_transaccion_moneda;
ALTER TABLE transacciones     ADD CONSTRAINT chk_transaccion_moneda CHECK (moneda ~ '^[A-Z]{3}$');

-- Cache diario de cotizaciones, base USD
CREATE TABLE IF NOT EXISTS tipos_cambio (
  fecha        DATE           NOT NULL,
  moneda       CHAR(3)        NOT NULL,
  tasa_por_usd NUMERIC(18,8)  NOT NULL CHECK (tasa_por_usd > 0),
  fuente       VARCHAR(50)    NOT NULL DEFAULT 'open.er-api.com',
  creado_en    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fecha, moneda)
);
CREATE INDEX IF NOT EXISTS idx_tipos_cambio_moneda_fecha ON tipos_cambio (moneda, fecha DESC);

-- Tasa de una moneda en una fecha: la más reciente <= fecha; si no hay, la más antigua posterior
CREATE OR REPLACE FUNCTION tasa_por_usd(p_moneda CHAR(3), p_fecha DATE)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_moneda = 'USD' THEN 1::numeric
  ELSE COALESCE(
    (SELECT tasa_por_usd FROM tipos_cambio WHERE moneda = p_moneda AND fecha <= p_fecha ORDER BY fecha DESC LIMIT 1),
    (SELECT tasa_por_usd FROM tipos_cambio WHERE moneda = p_moneda AND fecha >  p_fecha ORDER BY fecha ASC  LIMIT 1)
  ) END;
$$;

-- Conversión entre dos monedas en una fecha (NULL si falta alguna tasa)
CREATE OR REPLACE FUNCTION convertir(p_monto NUMERIC, p_de CHAR(3), p_a CHAR(3), p_fecha DATE)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_de = p_a THEN p_monto
  ELSE ROUND(p_monto / tasa_por_usd(p_de, p_fecha) * tasa_por_usd(p_a, p_fecha), 2) END;
$$;

-- Memoria de comercios: lo que el usuario corrige en la bandeja se recuerda para siempre
CREATE TABLE IF NOT EXISTS comercios_conocidos (
  usuario_id           UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  comercio_normalizado VARCHAR(200) NOT NULL,
  categoria_id         UUID         NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  origen               VARCHAR(20)  NOT NULL DEFAULT 'usuario' CHECK (origen IN ('usuario', 'diccionario')),
  actualizado_en       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, comercio_normalizado)
);

-- Vistas que ahora dependen de la moneda principal del usuario
DROP VIEW IF EXISTS v_gasto_mensual_por_categoria;
DROP VIEW IF EXISTS v_saldo_consolidado;

CREATE OR REPLACE VIEW v_saldo_consolidado AS
SELECT c.usuario_id,
       u.moneda_principal,
       SUM(convertir(c.saldo_actual, c.moneda, u.moneda_principal, CURRENT_DATE)) AS saldo_total
FROM cuentas_bancarias c
JOIN usuarios u ON u.id = c.usuario_id
GROUP BY c.usuario_id, u.moneda_principal;

CREATE OR REPLACE VIEW v_transacciones_principal AS
SELECT t.*,
       cu.usuario_id,
       u.moneda_principal,
       convertir(t.monto, t.moneda, u.moneda_principal, t.fecha_hora::date) AS monto_principal
FROM transacciones t
JOIN cuentas_bancarias cu ON cu.id = t.cuenta_id
JOIN usuarios u ON u.id = cu.usuario_id;

COMMIT;
