import { readFileSync } from "node:fs";
import pg from "pg";
if (!process.env.CONFIRMO_TOCAR_DATOS_REALES) {
  console.error("Este script escribe en la cuenta de nico y puede borrar movimientos reales. Usa una rama de pruebas de Neon y ejecuta con CONFIRMO_TOCAR_DATOS_REALES=1.");
  process.exit(1);
}

const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")];}));
const base = process.argv[2] ?? "http://localhost:3456";
const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
await client.connect();
const { rows:[{ api_key_celular: key }] } = await client.query("SELECT api_key_celular FROM usuarios LIMIT 1");
async function post(body, auth = `Bearer ${key}`) {
  const res = await fetch(`${base}/api/v1/transactions/auto`, { method:"POST", headers:{ "Content-Type":"application/json", ...(auth?{Authorization:auth}:{}) }, body: JSON.stringify(body) });
  const j = await res.json().catch(()=>({}));
  console.log(res.status, JSON.stringify(j));
  return { status: res.status, j };
}
const stamp = Date.now();
console.log("1) Oxxo 45.00 ->");        await post({ monto:45.00, comercio:"Oxxo", cuenta:"DEBITO_PRINCIPAL", texto_original:`Compra autorizada por $45.00 en Oxxo ${stamp}` });
console.log("2) misma notif (dup) ->"); await post({ monto:45.00, comercio:"Oxxo", cuenta:"DEBITO_PRINCIPAL", texto_original:`Compra autorizada por $45.00 en Oxxo ${stamp}` });
console.log("3) Uber 89 ->");           await post({ monto:89, comercio:"UBER *TRIP", texto_original:`Cargo de $89.00 en UBER *TRIP ${stamp}` });
console.log("4) Papeleria (sin cat) ->");await post({ monto:120.5, comercio:"PAPELERIA LUMEN", texto_original:`Compra autorizada por $120.50 en PAPELERIA LUMEN ${stamp}` });
console.log("5) ingreso nomina ->");    await post({ monto:15000, comercio:"NOMINA EMPRESA", tipo:"ingreso", texto_original:`Depósito de nómina $15,000.00 ${stamp}` });
console.log("6) key mala (412) ->");    await post({ monto:1, comercio:"x" }, "Bearer " + "a".repeat(64));
console.log("7) sin header (401) ->");  await post({ monto:1, comercio:"x" }, null);
console.log("8) cuenta inexistente (404, rollback) ->"); await post({ monto:10, comercio:"Prueba", cuenta:"NO_EXISTE", texto_original:`x ${stamp}` });
console.log("9) monto negativo (400) ->"); await post({ monto:-5, comercio:"x" });
const chk = await client.query(`SELECT c.nombre_cuenta, c.saldo_actual,
  COALESCE(SUM(CASE WHEN t.tipo='ingreso' THEN t.monto ELSE -t.monto END),0) AS calculado, COUNT(t.id) AS n
  FROM cuentas_bancarias c LEFT JOIN transacciones t ON t.cuenta_id=c.id GROUP BY c.id`);
console.log("Integridad saldo:", JSON.stringify(chk.rows));
const tx = await client.query(`SELECT t.monto, t.tipo, t.descripcion, ca.nombre_categoria FROM transacciones t LEFT JOIN categorias ca ON ca.id=t.categoria_id ORDER BY t.fecha_hora`);
console.table(tx.rows);
await client.end();
