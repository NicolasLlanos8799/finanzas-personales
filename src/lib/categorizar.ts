// src/lib/categorizar.ts
// Clasificación por diccionario (sin IA) en tres capas:
//   1) memoria de comercios del usuario (lo que corrigió en la bandeja)
//   2) marcas conocidas (diccionario.ts) — gana la coincidencia más larga
//   3) giros genéricos multilingües (diccionario.ts)
// Sin coincidencia -> categoría "Por Clasificar" del usuario.
import type { PoolClient } from "pg";
import { MARCAS_EGRESOS, GIROS_EGRESOS, MARCAS_INGRESOS } from "@/lib/diccionario";

export type TipoTransaccion = "ingreso" | "egreso";

export interface CategoriaResuelta {
  id: string;
  nombre_categoria: string;
  es_por_clasificar: boolean;
  origen: "memoria" | "marca" | "giro" | "comodin";
}

const NOMBRE_POR_CLASIFICAR = "Por Clasificar";

/** Minúsculas, sin acentos, sin ruido de terminal punto de venta. */
export function normalizarComercio(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ß/g, "ss")
    .replace(/\bs\.?a\.?(?:\s*de\s*c\.?v\.?)?\b/g, " ")
    .replace(/\b(gmbh|ag|a\/s|aps|ivs|s\.?l\.?|s\.?r\.?l\.?|ltd|inc|llc|sas|srl)\b\.?/g, " ")
    .replace(/[*#]\s*\d+/g, " ")
    .replace(/\b\d{2,}\b/g, " ")
    .replace(/[^a-z0-9&./+ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Regla { clave: string; categoria: string; prefijo: boolean }

function compilar(dic: Record<string, string[]>): Regla[] {
  const reglas: Regla[] = [];
  for (const [categoria, claves] of Object.entries(dic)) {
    for (const c of claves) {
      const k = normalizarComercio(c.replace(/\*$/, ""));
      if (!k) continue;
      reglas.push({ clave: k, categoria, prefijo: c.endsWith("*") });
    }
  }
  // más larga primero => más específica gana ("uber eats" antes que "uber", "oxxo gas" antes que "oxxo")
  reglas.sort((a, b) => b.clave.length - a.clave.length);
  return reglas;
}

const REGLAS_MARCAS_EGRESO = compilar(MARCAS_EGRESOS);
const REGLAS_GIROS_EGRESO = compilar(GIROS_EGRESOS);
const REGLAS_INGRESO = compilar(MARCAS_INGRESOS);

/** Coincidencia como palabra/frase completa; con prefijo=true, como inicio de palabra. */
function coincide(textoNormalizado: string, r: Regla): boolean {
  const t = ` ${textoNormalizado} `;
  const k = r.clave;
  let idx = t.indexOf(k);
  while (idx !== -1) {
    const antes = t[idx - 1];
    const despues = t[idx + k.length];
    const inicioOk = antes === " " || antes === undefined;
    const finOk = r.prefijo || despues === " " || despues === undefined || /[^a-z0-9]/.test(despues ?? " ");
    if (inicioOk && finOk) return true;
    idx = t.indexOf(k, idx + 1);
  }
  return false;
}

function buscar(reglas: Regla[], textos: string[]): string | null {
  for (const texto of textos) {
    for (const r of reglas) if (coincide(texto, r)) return r.categoria;
  }
  return null;
}

/** Nombre de categoría sugerido y por qué capa, o null. Sin acceso a DB (útil para tests). */
export function sugerirNombreCategoria(
  comercio: string,
  tipo: TipoTransaccion,
  textoOriginal?: string,
): { categoria: string; origen: "marca" | "giro" } | null {
  const textos = [normalizarComercio(comercio), textoOriginal ? normalizarComercio(textoOriginal) : ""].filter(Boolean);
  if (tipo === "ingreso") {
    const c = buscar(REGLAS_INGRESO, textos);
    return c ? { categoria: c, origen: "marca" } : null;
  }
  const marca = buscar(REGLAS_MARCAS_EGRESO, textos);
  if (marca) return { categoria: marca, origen: "marca" };
  const giro = buscar(REGLAS_GIROS_EGRESO, textos);
  if (giro) return { categoria: giro, origen: "giro" };
  return null;
}

type Fila = { id: string; nombre_categoria: string; es_por_clasificar: boolean };

export async function resolverCategoria(
  client: PoolClient,
  usuarioId: string,
  tipo: TipoTransaccion,
  comercio: string,
  textoOriginal?: string,
): Promise<CategoriaResuelta> {
  const norm = normalizarComercio(comercio);

  // 1) memoria del usuario
  if (norm) {
    const mem = await client.query<Fila>(
      `SELECT c.id, c.nombre_categoria, c.es_por_clasificar
         FROM comercios_conocidos k
         JOIN categorias c ON c.id = k.categoria_id
        WHERE k.usuario_id = $1 AND k.comercio_normalizado = $2 AND c.tipo = $3::tipo_transaccion
        LIMIT 1`,
      [usuarioId, norm, tipo],
    );
    if (mem.rows[0]) return { ...mem.rows[0], origen: "memoria" };
  }

  // 2) y 3) diccionario
  const sug = sugerirNombreCategoria(comercio, tipo, textoOriginal);
  if (sug) {
    const { rows } = await client.query<Fila>(
      `SELECT id, nombre_categoria, es_por_clasificar
         FROM categorias
        WHERE usuario_id = $1 AND tipo = $2::tipo_transaccion AND nombre_categoria = $3
        LIMIT 1`,
      [usuarioId, tipo, sug.categoria],
    );
    if (rows[0]) return { ...rows[0], origen: sug.origen };
  }

  // 4) comodín
  const comodin = await client.query<Fila>(
    `SELECT id, nombre_categoria, es_por_clasificar
       FROM categorias
      WHERE usuario_id = $1 AND tipo = $2::tipo_transaccion AND es_por_clasificar
      LIMIT 1`,
    [usuarioId, tipo],
  );
  if (comodin.rows[0]) return { ...comodin.rows[0], origen: "comodin" };

  const creada = await client.query<Fila>(
    `INSERT INTO categorias (usuario_id, nombre_categoria, tipo, presupuesto_mensual, es_por_clasificar)
     VALUES ($1, $2, $3::tipo_transaccion, 0, TRUE)
     ON CONFLICT (usuario_id, nombre_categoria, tipo) DO UPDATE SET es_por_clasificar = TRUE
     RETURNING id, nombre_categoria, es_por_clasificar`,
    [usuarioId, NOMBRE_POR_CLASIFICAR, tipo],
  );
  return { ...creada.rows[0], origen: "comodin" };
}

/** Guarda la elección del usuario para ese comercio (la bandeja llama a esto). */
export async function recordarComercio(
  db: Pick<PoolClient, "query">,
  usuarioId: string,
  comercio: string,
  categoriaId: string,
): Promise<void> {
  const norm = normalizarComercio(comercio);
  if (!norm) return;
  await db.query(
    `INSERT INTO comercios_conocidos (usuario_id, comercio_normalizado, categoria_id, origen)
     VALUES ($1, $2, $3, 'usuario')
     ON CONFLICT (usuario_id, comercio_normalizado)
     DO UPDATE SET categoria_id = EXCLUDED.categoria_id, origen = 'usuario', actualizado_en = CURRENT_TIMESTAMP`,
    [usuarioId, norm, categoriaId],
  );
}
