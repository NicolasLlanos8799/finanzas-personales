// src/components/FilaClasificar.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Transaccion { id: string; montoTexto: string; montoPrincipalTexto: string | null; descripcion: string; fecha_hora: string; cuenta: string; tipo: "ingreso" | "egreso" }
interface Categoria { id: string; nombre: string }

export function FilaClasificar({ transaccion, categorias }: { transaccion: Transaccion; categorias: Categoria[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const fecha = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(transaccion.fecha_hora));

  async function guardar(categoriaId: string) {
    if (!categoriaId) return;
    setEstado("guardando");
    setError(null);
    try {
      const res = await fetch(`/api/v1/transactions/${transaccion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria_id: categoriaId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.mensaje ?? `Error ${res.status}`);
      }
      setEstado("ok");
      startTransition(() => router.refresh()); // la fila sale de la lista al re-renderizar el Server Component
    } catch (e) {
      setEstado("error");
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  const ocupado = estado === "guardando" || pending;

  return (
    <li className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition-opacity ${estado === "ok" ? "opacity-40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{transaccion.descripcion || "Sin descripción"}</p>
          <p className="text-xs text-slate-500">{fecha} · {transaccion.cuenta}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-lg font-semibold tabular-nums ${transaccion.tipo === "egreso" ? "text-red-600" : "text-emerald-600"}`}>
            {transaccion.tipo === "egreso" ? "−" : "+"}{transaccion.montoTexto}
          </p>
          {transaccion.montoPrincipalTexto ? <p className="text-xs tabular-nums text-slate-400">≈ {transaccion.montoPrincipalTexto}</p> : null}
        </div>
      </div>

      <p id={`rubro-${transaccion.id}`} className="mt-3 text-sm font-medium">¿A qué rubro pertenece?</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby={`rubro-${transaccion.id}`}>
        {categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={ocupado || estado === "ok"}
            onClick={() => guardar(c.id)}
            className="h-11 rounded-full bg-slate-100 px-4 text-sm font-medium text-slate-800 active:bg-slate-900 active:text-white disabled:opacity-60"
          >
            {c.nombre}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">Recordaré este comercio para clasificarlo solo la próxima vez.</p>

      <p className="mt-1 h-4 text-xs" aria-live="polite">
        {estado === "guardando" && <span className="text-slate-500">Guardando…</span>}
        {estado === "ok" && <span className="text-emerald-600">Guardado</span>}
        {estado === "error" && <span className="text-red-600">{error}</span>}
      </p>
    </li>
  );
}
