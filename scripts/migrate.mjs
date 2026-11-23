import { readFileSync } from "node:fs";
import pg from "pg";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")];}));
const client = new pg.Client({ connectionString: env.DATABASE_URL_UNPOOLED, ssl: { rejectUnauthorized: true } });
await client.connect();
const archivos = process.argv.slice(2).length ? process.argv.slice(2) : ["sql/001_init.sql","sql/002_seed.sql"];
for (const f of archivos) {
  await client.query(readFileSync(f,"utf8"));
  console.log("OK", f);
}
const u = await client.query("SELECT id, nombre, correo, moneda_principal, length(api_key_celular) AS key_len FROM usuarios");
console.log(JSON.stringify(u.rows));
const t = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1");
console.log(t.rows.map(r=>r.table_name).join(", "));
const c = await client.query("SELECT nombre_categoria, tipo, presupuesto_mensual, es_por_clasificar FROM categorias ORDER BY tipo, nombre_categoria");
console.table(c.rows);
await client.end();
