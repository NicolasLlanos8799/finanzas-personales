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
const stamp = Date.now();
let fallos = 0;
async function post(nombre, body, esperado) {
  const res = await fetch(`${base}/api/v1/transactions/auto`, { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${key}` }, body: JSON.stringify(body) });
  const j = await res.json().catch(()=>({}));
  const got = { status: res.status, monto: j.monto, moneda: j.moneda, comercio: j.comercio, categoria: j.categoria, tipo: j.tipo, origen: j.categoria_origen };
  const ok = Object.entries(esperado).every(([k,v]) => got[k] === v);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}\n   got: ${JSON.stringify(got)}${ok ? "" : "\n   exp: " + JSON.stringify(esperado)}\n   msg: ${j.mensaje_notificacion ?? j.codigo}`);
  return j;
}
const T = (t) => ({ texto_original: `${t} [${stamp}]` });
await post("DK Netto",            T("Du har brugt 199,00 kr. hos Netto"),                          { status:201, monto:199, moneda:"DKK", comercio:"Netto", categoria:"Supermercado", tipo:"egreso" });
await post("DK 7-Eleven",         T("Betaling på 45,50 kr. til 7-Eleven den 17.09.2026"),          { status:201, monto:45.5, moneda:"DKK", comercio:"7-Eleven", categoria:"Supermercado" });
await post("ES Mercadona EUR",    T("Compra de 12,50 € en MERCADONA con tu tarjeta *1234"),        { status:201, monto:12.5, moneda:"EUR", comercio:"MERCADONA", categoria:"Supermercado" });
await post("CH Coop Pronto CHF",  T("Zahlung CHF 8.90 bei Coop Pronto am 17.09."),                 { status:201, monto:8.9, moneda:"CHF", comercio:"Coop Pronto", categoria:"Supermercado" });
await post("AR Coto ARS explícito", { ...T("Compra por $1.250,00 en COTO"), moneda:"ARS" },        { status:201, monto:1250, moneda:"ARS", comercio:"COTO", categoria:"Supermercado" });
await post("EN Revolut Uber Eats", T("Paid 120,00 kr. to Uber Eats"),                              { status:201, monto:120, moneda:"DKK", comercio:"Uber Eats", categoria:"Alimentación" });
await post("EN Uber",             T("Paid 95,00 kr. to Uber"),                                     { status:201, monto:95, comercio:"Uber", categoria:"Transporte" });
await post("DK Apotek (giro)",    T("Du har brugt 150,00 kr. hos Apoteket Svanen"),                { status:201, monto:150, comercio:"Apoteket Svanen", categoria:"Salud" });
await post("DK Bageri (giro)",    T("Betaling 89,00 kr. til Bageriet Brød & Co"),                  { status:201, monto:89, comercio:"Bageriet Brød & Co", categoria:"Alimentación" });
await post("DK Løn ingreso",      T("Du har modtaget 25.000,00 kr. fra Firma ApS Løn september"),  { status:201, monto:25000, tipo:"ingreso", categoria:"Nómina" });
await post("MX campos explícitos", { monto:"45.00", comercio:"Oxxo", moneda:"MXN", texto_original:`x ${stamp}` }, { status:201, monto:45, moneda:"MXN", comercio:"Oxxo", categoria:"Supermercado" });
await post("DE dm Drogerie",      T("Kartenzahlung 23,45 EUR bei dm-drogerie markt"),              { status:201, monto:23.45, moneda:"EUR", comercio:"dm-drogerie markt", categoria:"Supermercado" });
await post("Duplicado",           T("Du har brugt 199,00 kr. hos Netto"),                          { status:200 });
await post("Sin monto (422)",     T("Din saldo er opdateret"),                                     { status:422 });
const desconocido = await post("DK desconocido -> comodín", T("Du har brugt 300,00 kr. hos Bogholderiet Hansen"), { status:201, comercio:"Bogholderiet Hansen", categoria:"Por Clasificar", origen:"comodin" });
// aprender: PATCH a Servicios
const { rows:[serv] } = await client.query("SELECT id FROM categorias WHERE nombre_categoria='Servicios' AND tipo='egreso'");
const pr = await fetch(`${base}/api/v1/transactions/${desconocido.transaccion_id}`, { method:"PATCH", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ categoria_id: serv.id }) });
console.log("PATCH aprender ->", pr.status, await pr.text());
await post("DK mismo comercio -> memoria", T("Du har brugt 450,00 kr. hos Bogholderiet Hansen"), { status:201, categoria:"Servicios", origen:"memoria" });

const chk = await client.query(`SELECT c.moneda, c.saldo_actual,
   ROUND(COALESCE(SUM(CASE WHEN t.tipo='ingreso' THEN convertir(t.monto,t.moneda,c.moneda,t.fecha_hora::date) ELSE -convertir(t.monto,t.moneda,c.moneda,t.fecha_hora::date) END),0),2) AS calculado,
   COUNT(t.id) AS n FROM cuentas_bancarias c LEFT JOIN transacciones t ON t.cuenta_id=c.id GROUP BY c.id`);
console.log("Integridad saldo (DKK):", JSON.stringify(chk.rows));
const tasas = await client.query("SELECT fecha, COUNT(*) AS n, MAX(CASE WHEN moneda='DKK' THEN tasa_por_usd END) AS dkk_por_usd, MAX(CASE WHEN moneda='EUR' THEN tasa_por_usd END) AS eur_por_usd, MAX(CASE WHEN moneda='ARS' THEN tasa_por_usd END) AS ars_por_usd FROM tipos_cambio GROUP BY fecha");
console.log("Cotizaciones:", JSON.stringify(tasas.rows));
const mem = await client.query("SELECT comercio_normalizado, origen FROM comercios_conocidos");
console.log("Memoria:", JSON.stringify(mem.rows));
console.log(fallos === 0 ? "TODO OK" : `FALLOS: ${fallos}`);
await client.end();
