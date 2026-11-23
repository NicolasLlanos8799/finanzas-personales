-- =====================================================================
-- finanzas-personales · DDL v1 · PostgreSQL 17 · ejecutar en Neon SQL Editor
-- =====================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_transaccion') THEN
    CREATE TYPE tipo_transaccion AS ENUM ('ingreso', 'egreso');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS usuarios (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           VARCHAR(100) NOT NULL,
  correo           VARCHAR(255) NOT NULL UNIQUE,
  moneda_principal VARCHAR(3)   NOT NULL DEFAULT 'MXN',
  api_key_celular  VARCHAR(64)  NOT NULL UNIQUE,
  creado_en        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_usuarios_correo  CHECK (correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT chk_usuarios_moneda  CHECK (moneda_principal ~ '^[A-Z]{3}$'),
  CONSTRAINT chk_usuarios_api_key CHECK (char_length(api_key_celular) >= 32)
);

CREATE TABLE IF NOT EXISTS cuentas_bancarias (
  id                         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id                 UUID          NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre_cuenta              VARCHAR(100)  NOT NULL,
  identificador_notificacion VARCHAR(100)  NOT NULL,
  saldo_actual               NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  creado_en                  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_cuenta_usuario_identificador UNIQUE (usuario_id, identificador_notificacion),
  CONSTRAINT chk_cuenta_nombre CHECK (char_length(trim(nombre_cuenta)) > 0)
);

CREATE TABLE IF NOT EXISTS categorias (
  id                 UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id         UUID             NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre_categoria   VARCHAR(100)     NOT NULL,
  tipo               tipo_transaccion NOT NULL,
  presupuesto_mensual NUMERIC(12,2)   NOT NULL DEFAULT 0.00,
  es_por_clasificar  BOOLEAN          NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_categoria_usuario_nombre_tipo UNIQUE (usuario_id, nombre_categoria, tipo),
  CONSTRAINT chk_categoria_presupuesto CHECK (presupuesto_mensual >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_categoria_por_clasificar
  ON categorias (usuario_id, tipo) WHERE es_por_clasificar;

CREATE TABLE IF NOT EXISTS transacciones (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id        UUID             NOT NULL REFERENCES cuentas_bancarias(id) ON DELETE CASCADE,
  categoria_id     UUID             REFERENCES categorias(id) ON DELETE SET NULL,
  tipo             tipo_transaccion NOT NULL,
  monto            NUMERIC(12,2)    NOT NULL,
  fecha_hora       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  descripcion      TEXT,
  origen_insercion VARCHAR(20)      NOT NULL DEFAULT 'Webhook_iOS',
  hash_dedup       CHAR(64),
  CONSTRAINT chk_transaccion_monto  CHECK (monto > 0),
  CONSTRAINT chk_transaccion_origen CHECK (origen_insercion IN ('Webhook_iOS', 'Manual_Web', 'Importacion'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transaccion_hash_dedup
  ON transacciones (hash_dedup) WHERE hash_dedup IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_api_key ON usuarios (api_key_celular);
CREATE INDEX IF NOT EXISTS idx_cuentas_usuario     ON cuentas_bancarias (usuario_id);
CREATE INDEX IF NOT EXISTS idx_categorias_usuario  ON categorias (usuario_id, tipo);
CREATE INDEX IF NOT EXISTS idx_transacciones_cuenta_fecha
  ON transacciones (cuenta_id, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_transacciones_categoria_fecha
  ON transacciones (categoria_id, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_transacciones_sin_clasificar
  ON transacciones (fecha_hora DESC)
  WHERE categoria_id IS NULL;

CREATE OR REPLACE VIEW v_saldo_consolidado AS
SELECT usuario_id, SUM(saldo_actual) AS saldo_total
FROM cuentas_bancarias
GROUP BY usuario_id;

CREATE OR REPLACE VIEW v_gasto_mensual_por_categoria AS
SELECT c.usuario_id,
       c.id                               AS categoria_id,
       c.nombre_categoria,
       c.presupuesto_mensual,
       date_trunc('month', t.fecha_hora)  AS mes,
       COALESCE(SUM(t.monto), 0)          AS gastado
FROM categorias c
LEFT JOIN transacciones t
       ON t.categoria_id = c.id AND t.tipo = 'egreso'
WHERE c.tipo = 'egreso'
GROUP BY c.usuario_id, c.id, c.nombre_categoria, c.presupuesto_mensual, date_trunc('month', t.fecha_hora);

COMMIT;
