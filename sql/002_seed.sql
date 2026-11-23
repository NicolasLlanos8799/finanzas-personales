BEGIN;

INSERT INTO usuarios (nombre, correo, moneda_principal, api_key_celular)
VALUES ('Nicolas', 'nicollanos8799@gmail.com', 'MXN', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (correo) DO NOTHING;

INSERT INTO cuentas_bancarias (usuario_id, nombre_cuenta, identificador_notificacion, saldo_actual)
SELECT id, 'Débito principal', 'DEBITO_PRINCIPAL', 0.00
FROM usuarios WHERE correo = 'nicollanos8799@gmail.com'
ON CONFLICT (usuario_id, identificador_notificacion) DO NOTHING;

INSERT INTO categorias (usuario_id, nombre_categoria, tipo, presupuesto_mensual, es_por_clasificar)
SELECT u.id, v.nombre, 'egreso', v.presupuesto, v.comodin
FROM usuarios u
CROSS JOIN (VALUES
  ('Transporte',      3000.00, FALSE),
  ('Alimentación',    6000.00, FALSE),
  ('Supermercado',    5000.00, FALSE),
  ('Servicios',       2500.00, FALSE),
  ('Entretenimiento', 2000.00, FALSE),
  ('Salud',           1500.00, FALSE),
  ('Compras',         3000.00, FALSE),
  ('Gastos fijos',       0.00, FALSE),
  ('Por Clasificar',     0.00, TRUE)
) AS v(nombre, presupuesto, comodin)
WHERE u.correo = 'nicollanos8799@gmail.com'
ON CONFLICT (usuario_id, nombre_categoria, tipo) DO NOTHING;

INSERT INTO categorias (usuario_id, nombre_categoria, tipo, presupuesto_mensual)
SELECT u.id, v.nombre, 'ingreso', 0
FROM usuarios u
CROSS JOIN (VALUES ('Nómina'), ('Freelance'), ('Otros ingresos')) AS v(nombre)
WHERE u.correo = 'nicollanos8799@gmail.com'
ON CONFLICT (usuario_id, nombre_categoria, tipo) DO NOTHING;

COMMIT;
