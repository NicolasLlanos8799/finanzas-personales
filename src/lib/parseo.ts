// src/lib/parseo.ts
// Extracción de importe, moneda, comercio y tipo desde el texto de una notificación bancaria.
// Sin IA: expresiones regulares para danés, español, alemán, francés, inglés e italiano.

export type TipoTransaccion = "ingreso" | "egreso";

export const MONEDAS_SOPORTADAS = [
  "DKK", "EUR", "CHF", "ARS", "USD", "MXN", "GBP", "SEK", "NOK", "COP", "CLP", "PEN", "BRL", "UYU", "CAD", "AUD", "JPY", "PLN", "CZK", "HUF",
] as const;
export type Moneda = (typeof MONEDAS_SOPORTADAS)[number];

/** Convierte "1.250,50", "1,250.50", "199,00", "45.00", "1250" o un número a Number. */
export function parsearMonto(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? Math.round(raw * 100) / 100 : null;
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // ambos: el último es el decimal
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const dec = s.length - lastComma - 1;
    s = dec === 2 || dec === 1 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const dec = s.length - lastDot - 1;
    // "1.250" -> miles; "45.00" / "45.5" -> decimal
    if (dec === 3 && (s.match(/\./g) ?? []).length === 1 && s.length > 4) s = s.replace(".", "");
    else if (dec === 3) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// Códigos pegados al número ("USD9.99", "DKK65.24") son habituales en Revolut: se usan
// lookarounds en lugar de \b, que no separa una letra de un dígito.
const cod = (c: string) => `(?<![a-z])(?:${c})(?![a-z])`;
const SIMBOLOS: Array<[RegExp, Moneda]> = [
  [new RegExp(`${cod("dkk")}|(?<![a-z])kr\\.?(?![a-z])|${cod("kroner")}`, "i"), "DKK"],
  [new RegExp(`€|${cod("eur|euros?")}`, "i"), "EUR"],
  [new RegExp(`${cod("chf|s?fr\\.?|franken|francs?")}`, "i"), "CHF"],
  [new RegExp(`${cod("ars")}|ar\\$|${cod("pesos? argentinos?")}`, "i"), "ARS"],
  [new RegExp(`${cod("mxn")}|mx\\$|${cod("pesos? mexicanos?")}`, "i"), "MXN"],
  [new RegExp(`${cod("cop")}|${cod("pesos? colombianos?")}`, "i"), "COP"],
  [new RegExp(`${cod("clp")}|${cod("pesos? chilenos?")}`, "i"), "CLP"],
  [new RegExp(`${cod("pen")}|s\\/\\.?|${cod("soles?")}`, "i"), "PEN"],
  [new RegExp(`${cod("brl")}|r\\$|${cod("reais")}`, "i"), "BRL"],
  [new RegExp(`${cod("uyu")}|${cod("pesos? uruguayos?")}`, "i"), "UYU"],
  [new RegExp(`${cod("sek|kronor")}`, "i"), "SEK"],
  [new RegExp(`${cod("nok")}`, "i"), "NOK"],
  [new RegExp(`£|${cod("gbp|pounds?")}`, "i"), "GBP"],
  [new RegExp(`${cod("usd")}|us\\$|u\\$s|${cod("d[oó]lares|dollars?")}`, "i"), "USD"],
  [new RegExp(`${cod("cad")}|c\\$`, "i"), "CAD"],
  [new RegExp(`${cod("aud")}|a\\$`, "i"), "AUD"],
  [new RegExp(`¥|${cod("jpy|yen")}`, "i"), "JPY"],
  [new RegExp(`${cod("pln")}|zł|${cod("zl")}`, "i"), "PLN"],
  [new RegExp(`${cod("czk")}|kč`, "i"), "CZK"],
  [new RegExp(`${cod("huf")}|${cod("ft")}`, "i"), "HUF"],
];

/** Moneda de un símbolo o código suelto ("USD", "€", "kr."); null si es ambiguo como "$". */
function monedaDeToken(tok: string): Moneda | null {
  for (const [re, m] of SIMBOLOS) if (re.test(tok)) return m;
  return null;
}

/** Detecta la moneda mencionada en el texto. "$" solo se resuelve con la moneda de la cuenta. */
export function detectarMoneda(texto: string, monedaCuenta: string): Moneda {
  for (const [re, m] of SIMBOLOS) if (re.test(texto)) return m;
  return (MONEDAS_SOPORTADAS as readonly string[]).includes(monedaCuenta) ? (monedaCuenta as Moneda) : "USD";
}

/** Número con miles y decimales en cualquier convención. */
const NUM = String.raw`\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const MONEDA_TXT = String.raw`(?:(?<![a-z])(?:dkk|eur|chf|ars|usd|mxn|cop|clp|pen|brl|uyu|sek|nok|gbp|cad|aud|jpy|pln|czk|huf|kroner|euros?|francs?|franken|pesos|soles|d[oó]lares)(?![a-z])|(?<![a-z])kr\.?|€|£|¥|ar\$|mx\$|us\$|u\$s|r\$|s\/\.?|\$|s?fr\.?)`;
const RE_IMPORTE = new RegExp(`(?<t1>${MONEDA_TXT})\\s?(?<n1>${NUM})|(?<n2>${NUM})\\s?(?<t2>${MONEDA_TXT})`, "gi");
const RE_SALDO = /(saldo|balance|disponible|available|kontostand|guthaben|restante)[^\d\n]{0,25}$/i;

export interface Importe { monto: number; moneda: Moneda }

/**
 * Importe cobrado. Reglas:
 * - se ignoran los importes que siguen a "Saldo", "Balance", "Disponible"…
 * - si hay un importe original y otro entre paréntesis en la moneda de la cuenta
 *   ("USD9.99 (DKK65.24)"), se usa el de la cuenta: es lo que el banco descontó de verdad.
 * - en otro caso, el primero.
 */
export function extraerImporte(texto: string, monedaCuenta: string): Importe | null {
  const candidatos: Array<Importe & { entreParentesis: boolean }> = [];
  for (const m of texto.matchAll(RE_IMPORTE)) {
    const g = m.groups!;
    const tok = g.t1 ?? g.t2 ?? "";
    const monto = parsearMonto(g.n1 ?? g.n2 ?? "");
    if (!monto) continue;
    const inicio = m.index ?? 0;
    if (RE_SALDO.test(texto.slice(Math.max(0, inicio - 40), inicio))) continue;
    const moneda = monedaDeToken(tok) ?? ((MONEDAS_SOPORTADAS as readonly string[]).includes(monedaCuenta) ? (monedaCuenta as Moneda) : "USD");
    candidatos.push({ monto, moneda, entreParentesis: /\(\s*$/.test(texto.slice(Math.max(0, inicio - 3), inicio)) });
  }
  if (candidatos.length === 0) {
    const n = /\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2}\b/.exec(texto);
    const monto = n ? parsearMonto(n[0]) : null;
    return monto ? { monto, moneda: detectarMoneda(texto, monedaCuenta) } : null;
  }
  const primero = candidatos[0];
  const enCuenta = candidatos.find((c) => c.entreParentesis && c.moneda === monedaCuenta && c.moneda !== primero.moneda);
  const elegido = enCuenta ?? primero;
  return { monto: elegido.monto, moneda: elegido.moneda };
}

export function extraerMonto(texto: string): number | null {
  return extraerImporte(texto, "USD")?.monto ?? null;
}

/** Palabras de cierre habituales tras el nombre del comercio, en varios idiomas. */
const CIERRE = String.raw`(?=\s*(?:$|[^A-Za-zÀ-ÿØøÆæÅå0-9 .&'\-*/+]|\bcon\b|\bcard\b|\btarjeta\b|\bkort\b|\bkarte\b|\bden\b|\bd\.|\bel\b|\bam\b|\bon\b|\bpor\b|\bsaldo\b|\bbalance\b|\bfolio\b|\bref\b|\bterminaci[oó]n\b|\bending\b|\bmed\b|\bmit\b|\bvia\b|\bvía\b|\bfra\b|\bfrom\b|\bvon\b|\bde tu\b|\bde su\b|\bde la\b|\bdel\b|\*{2,}|\d{4}\b|\bkl\.?\b|\bat\s+\d|\ba las\b|\bum\s+\d|-\s*\d))`;
const NOMBRE = String.raw`([A-Za-zÀ-ÿØøÆæÅå0-9][A-Za-zÀ-ÿØøÆæÅå0-9 .&'\-*/+]{1,60}?)`;
const KW_FUERTES = String.raw`(?:hos|til|bei|chez|at|en|in|presso|from|fra|von|an|to|comercio:?|merchant:?|betaling til|payment to|zahlung an)`;
const KW_DEBILES = String.raw`(?:a|de|con)`;
const RE_COMERCIO_FUERTE = new RegExp(String.raw`\b${KW_FUERTES}\s+${NOMBRE}${CIERRE}`, "gi");
const RE_COMERCIO_DEBIL = new RegExp(String.raw`\b${KW_DEBILES}\s+${NOMBRE}${CIERRE}`, "gi");
const STOPWORDS = /^(tu|su|la|el|los|las|un|una|din|dit|dine|your|dein|deine|ihr|ihre|the|a|an|my|mi|mis|kl|las?\s+\d|the\s+\d)\b/i;

function limpiarNombre(raw: string): string | null {
  const nombre = raw.replace(/\s+/g, " ").replace(/[\s.,;:*-]+$/g, "").trim();
  if (nombre.length < 2) return null;
  if (STOPWORDS.test(nombre)) return null;
  if (!/[a-zA-ZÀ-ÿØøÆæÅå]/.test(nombre)) return null;          // solo dígitos: no es un comercio
  if (/^\d+[.,]\d+$/.test(nombre)) return null;
  if ((MONEDAS_SOPORTADAS as readonly string[]).includes(nombre.toUpperCase())) return null; // "Saldo en DKK:"
  if (/^(saldo|balance|disponible|available)\b/i.test(nombre)) return null;
  return nombre;
}

export function extraerComercio(texto: string): string | null {
  for (const re of [RE_COMERCIO_FUERTE, RE_COMERCIO_DEBIL]) {
    re.lastIndex = 0;
    for (const m of texto.matchAll(re)) {
      const n = limpiarNombre(m[1]);
      if (n) return n;
    }
  }
  return null;
}

const RE_INGRESO = /\b(dep[oó]sito|abono|recibiste|recibido|ingreso|transferencia recibida|has recibido|te enviaron|te envi[oó]|n[oó]mina|sueldo|salario|indbetaling|modtaget|du har modtaget|overf[oø]rsel modtaget|l[oø]n|udbetaling|gutschrift|eingang|zahlungseingang|gehalt|lohn|erhalten|received|deposit|payment received|you received|credited|salary|accredit|acreditaci[oó]n|acreditado)\b/i;
const RE_EGRESO = /\b(compra|pago|cargo|retiro|d[eé]bito|consumo|k[oø]b|betaling|du har brugt|brugt|h[æa]vet|zahlung|abbuchung|kauf|belastung|ausgabe|purchase|payment|paid|spent|charge|withdrawal|debit|achat|paiement|acquisto|pagamento)\b/i;

export function detectarTipo(texto: string): TipoTransaccion {
  if (RE_INGRESO.test(texto) && !RE_EGRESO.test(texto)) return "ingreso";
  if (RE_INGRESO.test(texto) && RE_EGRESO.test(texto)) {
    // ambas: gana la que aparezca antes
    const i = texto.search(RE_INGRESO);
    const e = texto.search(RE_EGRESO);
    return i < e ? "ingreso" : "egreso";
  }
  return "egreso";
}

export interface DatosNotificacion {
  monto: number | null;
  moneda: Moneda;
  comercio: string | null;
  tipo: TipoTransaccion;
}

export function extraerDatosNotificacion(texto: string, monedaCuenta: string): DatosNotificacion {
  const importe = extraerImporte(texto, monedaCuenta);
  return {
    monto: importe?.monto ?? null,
    moneda: importe?.moneda ?? detectarMoneda(texto, monedaCuenta),
    comercio: extraerComercio(texto),
    tipo: detectarTipo(texto),
  };
}
