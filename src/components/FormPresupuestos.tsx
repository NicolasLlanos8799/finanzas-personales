// src/components/FormPresupuestos.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Fila { id: string; nombre: string; monto: number }

export function FormPresupuestos({ filas, moneda }: { filas: Fila[]; moneda: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [valores, setValores] = useState<Record<string, string>>(Object.fromEntries(filas.map((f) => [f.id, f.monto ? String(f.monto) : ""])));
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok" | "error">("idle");

  async function guardar() {
    setEstado("guardando");
    try {
      const presupuestos = filas.map((f) => ({ id: f.id, monto: Number((valores[f.id] ?? "").replace(",", ".")) || 0 }));
      const res = await fetch("/api/v1/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ presupuestos }) });
      if (!res.ok) throw new Error();
      setEstado("ok");
      startTransition(() => router.refresh());
    } catch {
      setEstado("error");
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold">Presupuesto mensual por categoría</h2>
      <p className="mb-3 text-xs text-slate-500">En {moneda}. Déjalo vacío si no quieres presupuesto en esa categoría.</p>
      <ul className="space-y-2">
        {filas.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-3">
            <label htmlFor={`p-${f.id}`} className="text-sm">{f.nombre}</label>
            <input
              id={`p-${f.id}`}
              inputMode="decimal"
              placeholder="0"
              value={valores[f.id] ?? ""}
              onChange={(e) => setValores((v) => ({ ...v, [f.id]: e.target.value }))}
              className="h-11 w-32 rounded-xl border border-slate-300 bg-slate-50 px-3 text-right text-base tabular-nums focus:border-slate-900 focus:outline-none"
            />
          </li>
        ))}
      </ul>
      <button type="button" onClick={guardar} disabled={estado === "guardando" || pending} className="mt-4 h-12 w-full rounded-xl bg-slate-900 text-base font-medium text-white active:bg-slate-700 disabled:opacity-60">
        {estado === "guardando" ? "Guardando…" : "Guardar presupuestos"}
      </button>
      <p className="mt-2 h-4 text-center text-xs" aria-live="polite">
        {estado === "ok" && <span className="text-emerald-600">Guardado</span>}
        {estado === "error" && <span className="text-red-600">No se pudo guardar</span>}
      </p>
    </section>
  );
}
