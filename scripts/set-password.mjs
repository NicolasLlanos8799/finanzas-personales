// Uso: node scripts/set-password.mjs nombre "contraseña"
import { readFileSync } from "node:fs";
import pg from "pg";
import { hashClave } from "../src/lib/clave.ts";
const [nombre, clave] = process.argv.slice(2);
if (!nombre || !clave) { console.error("Uso: node scripts/set-password.mjs nombre contraseña"); process.exit(1); }
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")];}));
const c = new pg.Client({ connectionString: env.DATABASE_URL_UNPOOLED, ssl: { rejectUnauthorized: true } });
await c.connect();
const r = await c.query("UPDATE usuarios SET password_hash = $1 WHERE lower(nombre) = lower($2) RETURNING id, nombre", [await hashClave(clave), nombre]);
console.log(r.rowCount ? `contraseña guardada para ${r.rows[0].nombre}` : "no existe ese nombre");
await c.end();
