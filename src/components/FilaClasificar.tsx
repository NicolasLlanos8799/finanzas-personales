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

      <label className="mt-3 block">
        <span className="sr-only">Categoría</span>
        <select
          defaultValue=""
          disabled={ocupado || estado === "ok"}
          onChange={(e) => guardar(e.target.value)}
          className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-base focus:border-slate-900 focus:outline-none disabled:opacity-60"
        >
          <option value="" disabled>Elegir categoría…</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </label>

      <p className="mt-1 h-4 text-xs" aria-live="polite">
        {estado === "guardando" && <span className="text-slate-500">Guardando…</span>}
        {estado === "ok" && <span className="text-emerald-600">Guardado</span>}
        {estado === "error" && <span className="text-red-600">{error}</span>}
      </p>
    </li>
  );
}
