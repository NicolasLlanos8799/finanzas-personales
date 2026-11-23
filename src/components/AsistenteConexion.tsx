// src/components/AsistenteConexion.tsx — instalar, probar y activar, con el estado en directo
"use client";

import { useEffect, useState } from "react";
import { BotonCopiar } from "@/components/BotonCopiar";

interface Estado { ultimoWebhook: string | null; resultado: string | null }

const NOMBRE_ATAJO = "Finanzas";
const OK = new Set(["OK", "DUPLICADO", "PRUEBA"]);

function hace(iso: string, ahora: number): string {
  const seg = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000));
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (seg < 60) return "hace unos segundos";
  if (seg < 3600) return rtf.format(-Math.round(seg / 60), "minute");
  if (seg < 86400) return rtf.format(-Math.round(seg / 3600), "hour");
  return rtf.format(-Math.round(seg / 86400), "day");
}

const esIPhone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const paso = "rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200";
const num = "mr-2 inline-grid size-6 place-items-center rounded-full bg-tinta text-xs font-semibold text-laton-claro";
const grande = "flex h-14 w-full items-center justify-center rounded-2xl bg-tinta text-base font-medium text-papel shadow-[0_10px_30px_-12px_rgba(15,42,34,0.7)] transition active:scale-[0.985]";

export function AsistenteConexion({ apiKey, inicial, urlDireccion, urlIcloud }: { apiKey: string; inicial: Estado; urlDireccion: string; urlIcloud: string | null }) {
  const [estado, setEstado] = useState<Estado>(inicial);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  // Consulta el estado cada 3 s mientras la página está a la vista, para ver el ✓ al volver del atajo
  useEffect(() => {
    let vivo = true;
    async function consultar() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/v1/conexion", { cache: "no-store" });
        if (r.ok && vivo) {
          setEstado(await r.json());
          setAhora(Date.now());
        }
      } catch {
        /* sin red: se reintenta */
      }
    }
    const id = setInterval(consultar, 3000);
    document.addEventListener("visibilitychange", consultar);
    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", consultar);
    };
  }, []);

  async function instalar() {
    if (!esIPhone()) {
      setAviso("Esto se instala desde tu iPhone. Abre esta misma página en el iPhone y vuelve a pulsar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(apiKey);
      setAviso("Clave copiada. Cuando el iPhone te la pida, mantén pulsado el campo y toca Pegar.");
    } catch {
      setAviso("No pude copiar la clave sola: usa «Copiar clave» de abajo antes de instalar.");
    }
    // Apple solo admite el enlace de iCloud para importar por dirección; si aún no hay, se abre el archivo
    if (urlIcloud) {
      location.href = urlIcloud;
    } else {
      setAviso("Clave copiada. Si Safari solo descarga el archivo, ábrelo desde la app Archivos, en Descargas, y toca «Finanzas».");
      // es un archivo, no una página de la app: se abre con un enlace normal
      const enlace = document.createElement("a");
      enlace.href = "/atajos/Finanzas.shortcut";
      enlace.click();
    }
  }

  function probar() {
    if (!esIPhone()) {
      setAviso("La prueba se lanza desde tu iPhone. Abre esta página allí y vuelve a pulsar.");
      return;
    }
    setAviso(null);
    location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(NOMBRE_ATAJO)}&input=text&text=${encodeURIComponent("[prueba-finanzas] Prueba de conexión")}`;
  }

  const conectado = !!estado.ultimoWebhook && !!estado.resultado && OK.has(estado.resultado);
  const ilegible = !!estado.ultimoWebhook && !conectado;

  return (
    <div className="space-y-4">
      <section className={`rounded-2xl p-4 ring-1 ${conectado ? "bg-emerald-50 ring-emerald-200" : ilegible ? "bg-amber-50 ring-amber-200" : "bg-slate-100 ring-slate-200"}`} aria-live="polite">
        {conectado && estado.ultimoWebhook ? (
          <>
            <p className="text-sm font-semibold text-emerald-800">✓ Conectado</p>
            <p suppressHydrationWarning className="mt-0.5 text-xs text-slate-600">Último aviso {hace(estado.ultimoWebhook, ahora)}. Tu iPhone ya habla con Finanzas.</p>
          </>
        ) : ilegible && estado.ultimoWebhook ? (
          <>
            <p className="text-sm font-semibold text-amber-900">Llegó un aviso, pero no se pudo leer</p>
            <p suppressHydrationWarning className="mt-0.5 text-xs text-slate-600">{hace(estado.ultimoWebhook, ahora)}: {estado.resultado === "MONTO_NO_RECONOCIDO" || estado.resultado === "COMERCIO_NO_RECONOCIDO" ? "no encontré el importe o el comercio en el texto." : `falló (${estado.resultado ?? "sin detalle"}).`}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-700">Todavía sin conexión</p>
            <p className="mt-0.5 text-xs text-slate-500">Sigue los pasos. Aquí verás el ✓ en cuanto tu iPhone responda.</p>
          </>
        )}
      </section>

      <section className={paso}>
        <h2 className="text-sm font-semibold"><span className={num}>1</span>Instalar el atajo</h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">Un toque. Copiamos tu clave por ti; cuando el iPhone la pida, pégala y pulsa Añadir atajo.</p>
        <button type="button" onClick={instalar} className={grande}>Instalar en mi iPhone</button>
      </section>

      <section className={paso}>
        <h2 className="text-sm font-semibold"><span className={num}>2</span>Probar la conexión</h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">No registra ningún gasto. La primera vez, iOS preguntará si el atajo puede conectarse a esta web: elige <strong>Permitir siempre</strong>.</p>
        <button type="button" onClick={probar} className={`${grande} ${conectado ? "!bg-emerald-700" : ""}`}>{conectado ? "✓ Probar otra vez" : "Probar ahora"}</button>
      </section>

      <section className={paso}>
        <h2 className="text-sm font-semibold"><span className={num}>3</span>Que se ejecute solo</h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">Este es el único paso que Apple no permite hacer desde una web. Se hace una vez y son cinco toques.</p>
        <div className="space-y-2">
          <details open className="rounded-xl bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-medium">Con los pagos hechos con el móvil</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
              <li>Abre Atajos, pestaña <em>Automatización</em>, botón +.</li>
              <li>Elige <em>Transacción</em> y deja marcadas tus tarjetas de Wallet.</li>
              <li>Marca <em>Ejecutar de inmediato</em> y desactiva <em>Notificar al ejecutar</em>.</li>
              <li>Elige el atajo <strong>{NOMBRE_ATAJO}</strong>.</li>
            </ol>
            <p className="mt-2 text-xs text-slate-500">Solo salta al pagar acercando el móvil, no en compras online.</p>
          </details>
          <details className="rounded-xl bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-medium">Con la notificación del banco</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
              <li>Abre Atajos, pestaña <em>Automatización</em>, botón +.</li>
              <li>Elige <em>Notificación</em> (si tu iOS la tiene) y tu app bancaria. Deja el filtro de texto vacío.</li>
              <li>Marca <em>Ejecutar inmediatamente</em> y desactiva <em>Notificar al ejecutar</em>.</li>
              <li>Elige el atajo <strong>{NOMBRE_ATAJO}</strong>.</li>
            </ol>
          </details>
        </div>
        <a href="shortcuts://" className="mt-3 flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 active:bg-slate-100">Abrir la app Atajos</a>
      </section>

      {aviso && <p role="status" className="rounded-xl bg-slate-900 px-4 py-3 text-sm text-white">{aviso}</p>}

      <details className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <summary className="cursor-pointer text-sm font-semibold">¿No funciona? Instalarlo a mano</summary>
        <p className="mb-3 mt-2 text-xs text-slate-500">En Atajos, crea un atajo con estas acciones: <strong>Texto</strong> (tu clave), <strong>Obtener contenido de URL</strong> (método POST, cabecera <code>Authorization</code> = <code>Bearer </code> + tu clave, cabecera <code>Content-Type</code> = <code>application/json</code>, cuerpo JSON con <code>texto_original</code> = Entrada de atajo), <strong>Obtener valor del diccionario</strong> (<code>mensaje_notificacion</code>) y <strong>Mostrar notificación</strong>.</p>
        <div className="flex flex-wrap gap-2">
          <BotonCopiar texto={urlDireccion} etiqueta="Copiar dirección" />
          <BotonCopiar texto={`Bearer ${apiKey}`} etiqueta="Copiar «Bearer» + clave" />
        </div>
      </details>
    </div>
  );
}
