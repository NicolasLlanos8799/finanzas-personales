// Pruebas de multiusuario. Crea dos usuarios desechables (Prueba Ana y Prueba Beto) y los borra al final.
// nico solo se usa para iniciar sesión y leer; se comprueba que sus datos quedan idénticos.
import { readFileSync } from "node:fs";
import pg from "pg";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")];}));
const B = process.argv[2] ?? "http://localhost:3458";
const TOKEN = process.argv[3] ?? "tokenprueba123";
const NICO_CLAVE = process.env.NICO_CLAVE ?? "Zj41niqn!";
const db = new pg.Client({ connectionString: env.DATABASE_URL_UNPOOLED, ssl: { rejectUnauthorized: true } });
await db.connect();
let fallos = 0;
const ok = (c, m, x = "") => { console.log(`${c ? "✅" : "❌"} ${m} ${x}`); if (!c) fallos++; };
const cookieDe = (r) => (r.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).find(c => c.startsWith("finanzas_sesion=")) ?? null;
const post = (path, body, cookie) => fetch(B + path, { method: "POST", redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
const api = (method, path, body, cookie, extra = {}) => fetch(B + path, { method, redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json", ...extra }, body: body ? JSON.stringify(body) : undefined });
const loc = (r) => r.headers.get("location") ?? "";
const nMov = async (id) => Number((await db.query("SELECT COUNT(*) AS n FROM transacciones t JOIN cuentas_bancarias c ON c.id=t.cuenta_id WHERE c.usuario_id=$1", [id])).rows[0].n);

await db.query("DELETE FROM usuarios WHERE nombre IN ('Prueba Ana','Prueba Beto')");
const nicoId = (await db.query("SELECT id FROM usuarios WHERE nombre='nico'")).rows[0].id;
const fotoNico = async () => JSON.stringify((await db.query(
  "SELECT (SELECT COUNT(*) FROM transacciones t JOIN cuentas_bancarias c ON c.id=t.cuenta_id WHERE c.usuario_id=$1) AS t, (SELECT saldo_actual FROM cuentas_bancarias WHERE usuario_id=$1 ORDER BY creado_en LIMIT 1) AS s, (SELECT COUNT(*) FROM categorias WHERE usuario_id=$1) AS c, (SELECT COUNT(*) FROM comercios_conocidos WHERE usuario_id=$1) AS m", [nicoId])).rows[0]);
const nicoAntes = await fotoNico();

// 1. Páginas públicas y registro abierto (sin REGISTRO_TOKEN, cualquiera puede entrar a /registro)
ok((await fetch(B + "/login")).status === 200, "GET /login 200");
let t = await (await fetch(B + "/registro")).text();
ok(t.includes("Crea tu cuenta"), "registro abierto sin ningún enlace especial");
t = await (await fetch(B + "/registro?k=" + TOKEN)).text();
ok(t.includes("Crea tu cuenta"), "registro también abierto con un k cualquiera (ya no se usa)");
t = await (await fetch(B + "/login")).text();
ok(t.includes("Crear cuenta") && t.includes("href=\"/registro\""), "el login muestra el botón Crear cuenta que lleva a /registro");

// 2. Sin sesión
let r = await fetch(B + "/meses", { redirect: "manual" });
ok(r.status === 307 && loc(r).includes("/login"), "sin sesión: la página lleva a /login", `${r.status}`);
r = await api("POST", "/api/v1/transactions", { tipo: "egreso", monto: 1, comercio: "x" });
ok(r.status === 401, "sin sesión: la API responde 401", `${r.status}`);

// 3. Acceso de nico (solo lectura)
r = await post("/api/login", { nombre: "nico", password: "mala" });
ok(r.status === 303 && loc(r).includes("error=1"), "contraseña incorrecta rechazada");
r = await post("/api/login", { nombre: "NICO", password: NICO_CLAVE, next: "/meses" });
const cNico = cookieDe(r);
ok(r.status === 303 && !!cNico && loc(r).endsWith("/meses"), "nico entra (mayúsculas indiferentes) y va a /meses");
r = await fetch(B + "/ajustes", { headers: { Cookie: cNico } });
ok(r.status === 200 && /Hola, (<!-- -->)?nico/.test(await r.text()), "ajustes muestra el nombre nico");
r = await fetch(B + "/login", { headers: { Cookie: cNico }, redirect: "manual" });
ok(r.status === 307, "con sesión, /login lleva al inicio");

// 4. Reglas de registro (sin token: cualquiera pasa el primer filtro; las validaciones siguen)
r = await post("/api/registro", { nombre: "A", password: "secreto1" });
ok(loc(r).includes("error=nombre"), "nombre demasiado corto");
r = await post("/api/registro", { nombre: "Ana", password: "123" });
ok(loc(r).includes("error=clave"), "contraseña demasiado corta");
r = await post("/api/registro", { nombre: "NICO", password: "secreto1" });
ok(loc(r).includes("error=nombre_usado"), "nombre repetido (mayúsculas indiferentes)");
r = await post("/api/registro", { nombre: "Bot", password: "secreto1", web: "http://spam" });
ok(loc(r).endsWith("/login") && !cookieDe(r), "campo trampa: no crea cuenta");
ok((await db.query("SELECT 1 FROM usuarios WHERE lower(nombre)='bot'")).rowCount === 0, "el bot no quedó en la base");

// 5. Registro válido
r = await post("/api/registro", { k: TOKEN, nombre: "Prueba Ana", password: "secreto1", moneda: "CHF", zona: "Europe/Zurich" });
const cAna = cookieDe(r);
ok(r.status === 303 && loc(r).endsWith("/conectar") && !!cAna, "registro válido: sesión iniciada y va a /conectar");
const u = (await db.query("SELECT id, correo, moneda_principal, zona_horaria, api_key_celular, length(password_hash) AS lh FROM usuarios WHERE nombre='Prueba Ana'")).rows[0];
ok(u && u.correo === null && u.moneda_principal === "CHF" && u.zona_horaria === "Europe/Zurich" && u.api_key_celular.length === 64 && u.lh > 60, "usuario sin correo, con CHF, zona y clave de 64 caracteres");
const ctas = (await db.query("SELECT nombre_cuenta, moneda FROM cuentas_bancarias WHERE usuario_id=$1", [u.id])).rows;
const ncat = Number((await db.query("SELECT COUNT(*) AS n FROM categorias WHERE usuario_id=$1", [u.id])).rows[0].n);
ok(ctas.length === 1 && ctas[0].moneda === "CHF", "una cuenta principal en CHF");
ok(ncat === 12, "12 categorías iniciales", `(${ncat})`);
r = await fetch(B + "/conectar", { headers: { Cookie: cAna } });
t = await r.text();
ok(r.status === 200 && t.includes("Todavía sin conexión") && t.includes(u.api_key_celular.slice(-6)), "Conectar: sin conexión y muestra su clave");

// 6. Aislamiento entre cuentas (Beto es otro usuario desechable)
r = await post("/api/registro", { k: TOKEN, nombre: "Prueba Beto", password: "secreto2", moneda: "DKK", zona: "Europe/Copenhagen" });
const cBeto = cookieDe(r);
const uBeto = (await db.query("SELECT id, api_key_celular FROM usuarios WHERE nombre='Prueba Beto'")).rows[0];
ok(!!cBeto && !!uBeto, "segundo usuario (Beto) registrado");
r = await api("POST", "/api/v1/transactions", { tipo: "egreso", monto: "10,50", comercio: "Migros" }, cAna);
const jAna = await r.json();
ok(r.status === 201 && jAna.categoria === "Supermercado", "Ana registra un gasto manual", jAna.mensaje);
r = await api("POST", "/api/v1/transactions", { tipo: "egreso", monto: 99, moneda: "DKK", comercio: "Netto" }, cBeto);
const jBeto = await r.json();
ok(r.status === 201, "Beto registra el suyo", jBeto.mensaje);
ok((await nMov(u.id)) === 1 && (await nMov(uBeto.id)) === 1, "cada uno tiene solo su movimiento");
r = await api("DELETE", `/api/v1/transactions/${jAna.transaccion_id}`, null, cBeto);
ok(r.status === 404, "Beto no puede borrar el movimiento de Ana", `${r.status}`);
const catBeto = (await db.query("SELECT id FROM categorias WHERE usuario_id=$1 AND nombre_categoria='Compras'", [uBeto.id])).rows[0].id;
r = await api("PATCH", `/api/v1/transactions/${jAna.transaccion_id}`, { categoria_id: catBeto }, cAna);
ok(r.status === 404, "Ana no puede usar una categoría de Beto", `${r.status}`);
r = await fetch(B + "/meses", { headers: { Cookie: cAna } });
t = await r.text();
ok(r.status === 200 && t.includes("10,50") && !t.includes("Netto"), "el historial de Ana no contiene datos de Beto");

// 7. Webhook por usuario
const txt = (s) => `Du har brugt ${s} kr. hos Netto [${Date.now()}]`;
r = await api("POST", "/api/v1/transactions/auto", { texto_original: txt("33,00") }, null, { Authorization: "Bearer " + u.api_key_celular });
let j = await r.json();
ok(r.status === 201 && j.cuenta === "Cuenta principal", "el webhook con la clave de Ana registra en su cuenta", j.mensaje_notificacion);
ok((await nMov(u.id)) === 2 && (await nMov(uBeto.id)) === 1, "el aviso fue a la cuenta correcta");
r = await api("POST", "/api/v1/transactions/auto", { texto_original: "Sin importe" }, null, { Authorization: "Bearer " + uBeto.api_key_celular });
const est = (await db.query("SELECT ultimo_webhook_resultado AS r FROM usuarios WHERE id=$1", [uBeto.id])).rows[0].r;
ok(r.status === 422 && ["MONTO_NO_RECONOCIDO", "SOLO_COMERCIO_SIN_IMPORTE"].includes(est), "un aviso ilegible queda anotado para Beto", est);
r = await fetch(B + "/conectar", { headers: { Cookie: cAna } });
t = await r.text();
ok(t.includes("Conectado") && t.includes("hace unos segundos"), "Conectar de Ana pasa a «Conectado»");

// 8. Presupuestos y contraseña
const catAli = (await db.query("SELECT id FROM categorias WHERE usuario_id=$1 AND nombre_categoria='Alimentación'", [u.id])).rows[0].id;
r = await api("PATCH", "/api/v1/settings", { presupuestos: [{ id: catAli, monto: 500 }] }, cAna);
ok(r.status === 200 && Number((await db.query("SELECT presupuesto_mensual AS p FROM categorias WHERE id=$1", [catAli])).rows[0].p) === 500, "Ana fija su presupuesto");
await api("PATCH", "/api/v1/settings", { presupuestos: [{ id: catAli, monto: 1 }] }, cBeto);
ok(Number((await db.query("SELECT presupuesto_mensual AS p FROM categorias WHERE id=$1", [catAli])).rows[0].p) === 500, "Beto no puede tocar presupuestos de Ana");
r = await api("PATCH", "/api/v1/settings", { clave: { actual: "equivocada", nueva: "nuevaclave1" } }, cAna);
ok(r.status === 403, "cambio de contraseña con la actual incorrecta: 403");
r = await api("PATCH", "/api/v1/settings", { clave: { actual: "secreto1", nueva: "nuevaclave1" } }, cAna);
ok(r.status === 200, "cambio de contraseña correcto");
r = await post("/api/login", { nombre: "Prueba Ana", password: "secreto1" });
ok(loc(r).includes("error=1"), "la contraseña vieja ya no entra");
r = await post("/api/login", { nombre: "prueba ana", password: "nuevaclave1" });
ok(!!cookieDe(r) && !loc(r).includes("error"), "la contraseña nueva entra");

// 9. Regenerar la clave del iPhone
await api("PATCH", "/api/v1/settings", { regenerar_api_key: true }, cAna);
r = await api("POST", "/api/v1/transactions/auto", { texto_original: txt("5,00") }, null, { Authorization: "Bearer " + u.api_key_celular });
ok(r.status === 412, "la clave anterior deja de funcionar (412)", `${r.status}`);
const nueva = (await db.query("SELECT api_key_celular AS k FROM usuarios WHERE id=$1", [u.id])).rows[0].k;
r = await api("POST", "/api/v1/transactions/auto", { texto_original: txt("6,00") }, null, { Authorization: "Bearer " + nueva });
ok(r.status === 201, "la clave nueva funciona");

// 10. Cerrar sesión y cookies manipuladas
r = await fetch(B + "/api/logout", { method: "POST", redirect: "manual", headers: { Cookie: cAna } });
ok(r.status === 303 && (r.headers.getSetCookie?.() ?? []).some(c => c.startsWith("finanzas_sesion=;")), "cerrar sesión borra la cookie");
r = await fetch(B + "/meses", { headers: { Cookie: "finanzas_sesion=" + u.id + ".9999999999.deadbeef" }, redirect: "manual" });
ok(r.status === 307, "cookie manipulada rechazada");
r = await fetch(B + "/meses", { headers: { Cookie: cAna.replace(/.{4}$/, "0000") }, redirect: "manual" });
ok(r.status === 307, "cookie con la firma alterada rechazada");

// Limpieza: solo los dos usuarios de prueba (lo demás cae en cascada)
await db.query("DELETE FROM usuarios WHERE nombre IN ('Prueba Ana','Prueba Beto')");
ok(JSON.stringify(await fotoNico()) === JSON.stringify(nicoAntes), "los datos de nico quedaron exactamente igual", nicoAntes);
console.log("usuarios que quedan:", (await db.query("SELECT string_agg(nombre, ', ') AS n FROM usuarios")).rows[0].n);
console.log(fallos === 0 ? "TODO OK" : `FALLOS: ${fallos}`);
await db.end();
