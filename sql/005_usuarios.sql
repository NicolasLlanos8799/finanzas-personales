-- =====================================================================
-- 005 · Multiusuario: contraseña, último acceso y estado del webhook · idempotente
-- =====================================================================
BEGIN;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash             TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso             TIMESTAMP;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_webhook            TIMESTAMP;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_webhook_resultado  VARCHAR(60);

-- El correo es único sin distinguir mayúsculas
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_correo_lower ON usuarios (lower(correo));

COMMIT;
