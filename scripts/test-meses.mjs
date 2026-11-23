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
let fallos = 0;
const ok = (cond, msg, extra="") => { console.log(`${cond ? "✅" : "❌"} ${msg} ${extra}`); if (!cond) fallos++; };
const { rows: cats } = await client.query("SELECT id, nombre_categoria, tipo FROM categorias");
const cat = (n) => cats.find(c => c.nombre_categoria === n)?.id;

async function manual(body) {
  const r = await fetch(`${base}/api/v1/transactions`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(()=>({})) };
}

// 1. Gasto manual hoy, categoría automática
let r = await manual({ tipo:"egreso", monto:"149,95", comercio:"Føtex", moneda:"DKK" });
ok(r.status===201 && r.j.categoria==="Supermercado", "gasto manual hoy (Føtex -> Supermercado)", r.j.mensaje);
// 2. Ingreso manual con categoría explícita y fecha del mes pasado
r = await manual({ tipo:"ingreso", monto:25000, comercio:"Løn agosto", categoria_id: cat("Nómina"), fecha:"2026-08-28" });
ok(r.status===201 && r.j.categoria==="Nómina", "ingreso manual agosto (Nómina)", r.j.mensaje);
// 3. Gasto manual en EUR con fecha de agosto
r = await manual({ tipo:"egreso", monto:"1.200,00", moneda:"EUR", comercio:"Alquiler Madrid", categoria_id: cat("Servicios"), fecha:"2026-08-01" });
ok(r.status===201, "gasto manual agosto en EUR (1.200,00 -> 1200)", r.j.mensaje);
// 4. Gasto de madrugada del 1 de septiembre hora local (23:30 UTC del 31 ago) -> debe caer en septiembre
r = await manual({ tipo:"egreso", monto:"50", comercio:"Kiosk natten", fecha:"2026-09-01" });
ok(r.status===201, "gasto 1 sep (fecha local)", r.j.mensaje);
// 5. Categoría de tipo incorrecto -> 422
r = await manual({ tipo:"egreso", monto:10, comercio:"x", categoria_id: cat("Nómina") });
ok(r.status===422, "categoría de otro tipo rechazada (422)", r.j.codigo);
// 6. Importe inválido
r = await manual({ tipo:"egreso", monto:"abc", comercio:"x" });
ok(r.status===422, "importe inválido rechazado (422)", r.j.codigo);
// 7. Webhook sigue funcionando tras el refactor
const { rows:[{ api_key_celular: key }] } = await client.query("SELECT api_key_celular FROM usuarios LIMIT 1");
const w = await fetch(`${base}/api/v1/transactions/auto`, { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${key}` }, body: JSON.stringify({ texto_original: `Du har brugt 89,00 kr. hos Netto [${Date.now()}]` }) });
const wj = await w.json();
ok(w.status===201 && wj.categoria==="Supermercado", "webhook iPhone tras refactor", wj.mensaje_notificacion);

// 8. Vistas mensuales
const meses = await client.query("SELECT to_char(mes,'YYYY-MM') AS mes, ingresos, egresos, balance, movimientos FROM v_resumen_mensual ORDER BY mes");
console.table(meses.rows);
const ago = meses.rows.find(m=>m.mes==="2026-08"), sep = meses.rows.find(m=>m.mes==="2026-09");
ok(!!ago && Number(ago.movimientos)===2, "agosto tiene 2 movimientos");
ok(!!sep && Number(sep.movimientos)>=3, "septiembre tiene >=3 movimientos (incluye el del día 1)");
const dia1 = await client.query("SELECT to_char(fecha_local,'YYYY-MM-DD') AS f, to_char(fecha_hora,'YYYY-MM-DD HH24:MI') AS utc FROM v_transacciones_principal WHERE descripcion='Kiosk natten'");
ok(dia1.rows[0]?.f==="2026-09-01", "fecha local del 1 sep correcta", JSON.stringify(dia1.rows[0]));

// 9. Páginas HTML responden
for (const p of ["/", "/nuevo", "/meses", "/meses/2026-08", "/meses/2026-09", "/meses/1999-01", "/clasificar", "/ajustes"]) {
  const h = await fetch(`${base}${p}`);
  ok(h.status===200, `GET ${p} -> ${h.status}`);
}
const notFound = await fetch(`${base}/meses/abc`);
ok(notFound.status===404, "GET /meses/abc -> 404");

// 10. DELETE revierte saldo
const antes = Number((await client.query("SELECT saldo_actual FROM cuentas_bancarias LIMIT 1")).rows[0].saldo_actual);
const { rows:[fx] } = await client.query("SELECT id FROM transacciones WHERE descripcion='Føtex' ORDER BY fecha_hora DESC LIMIT 1");
const del = await fetch(`${base}/api/v1/transactions/${fx.id}`, { method:"DELETE" });
const despues = Number((await client.query("SELECT saldo_actual FROM cuentas_bancarias LIMIT 1")).rows[0].saldo_actual);
ok(del.status===200 && Math.abs((despues-antes)-149.95)<0.01, "DELETE revierte el saldo", `${antes} -> ${despues}`);
const chk = await client.query(`SELECT c.saldo_actual, ROUND(COALESCE(SUM(CASE WHEN t.tipo='ingreso' THEN convertir(t.monto,t.moneda,c.moneda,t.fecha_hora::date) ELSE -convertir(t.monto,t.moneda,c.moneda,t.fecha_hora::date) END),0),2) AS calculado FROM cuentas_bancarias c LEFT JOIN transacciones t ON t.cuenta_id=c.id GROUP BY c.id`);
ok(Number(chk.rows[0].saldo_actual)===Number(chk.rows[0].calculado), "integridad saldo", JSON.stringify(chk.rows[0]));
console.log(fallos===0 ? "TODO OK" : `FALLOS: ${fallos}`);
await client.end();
