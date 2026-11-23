-- =====================================================================
-- 006 · Acceso solo con nombre y contraseña (sin correo) · idempotente
-- =====================================================================
BEGIN;

ALTER TABLE usuarios ALTER COLUMN correo DROP NOT NULL;   -- el correo pasa a ser opcional
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_nombre_lower ON usuarios (lower(nombre));

COMMIT;
