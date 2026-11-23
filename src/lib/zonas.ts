// src/lib/zonas.ts — moneda más probable según la zona horaria del navegador (solo una sugerencia inicial)
export function monedaDeZona(zona: string): string {
  const z = zona.trim();
  const exactas: Record<string, string> = {
    "Europe/Copenhagen": "DKK", "Europe/Zurich": "CHF", "Europe/Vaduz": "CHF", "Europe/London": "GBP",
    "Europe/Stockholm": "SEK", "Europe/Oslo": "NOK", "Europe/Warsaw": "PLN", "Europe/Prague": "CZK", "Europe/Budapest": "HUF",
    "America/Mexico_City": "MXN", "America/Bogota": "COP", "America/Santiago": "CLP", "America/Lima": "PEN",
    "America/Sao_Paulo": "BRL", "America/Montevideo": "UYU", "America/Toronto": "CAD", "America/Vancouver": "CAD", "Asia/Tokyo": "JPY",
  };
  if (exactas[z]) return exactas[z];
  if (z.startsWith("America/Argentina") || z === "America/Buenos_Aires") return "ARS";
  if (z.startsWith("Australia/")) return "AUD";
  if (z.startsWith("America/")) return "USD";
  return "EUR";
}
