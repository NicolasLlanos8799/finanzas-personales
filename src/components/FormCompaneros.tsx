// src/components/FormCompaneros.tsx — con quién divides gastos (Ajustes)
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Companero { id: string; nombre: string }

export function FormCompaneros({ companeros }: { companeros: Companero[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nombre, setNombre] = useState("");
  const [estado, setEstado] = useState<"idle" | "guardando" | "error">("idle");
  const [error, setError] = useState("");

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setEstado("guardando");
    setError("");
    try {
      const res = await fetch("/api/v1/companeros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.mensaje ?? `Error ${res.status}`);
      setNombre("");
      setEstado("idle");
      startTransition(() => router.refresh());
    } catch (err) {
      setEstado("error");
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  async function quitar(id: string) {
    setEstado("guardando");
    try {
      const res = await fetch(`/api/v1/companeros/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setEstado("idle");
      startTransition(() => router.refresh());
    } catch {
      setEstado("error");
      setError("No se pudo quitar");
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold">Dividir gastos con…</h2>
      <p className="mb-3 text-xs text-slate-500">Guarda a las personas con las que sueles compartir gastos. Después, al registrar o revisar un gasto, lo divides con un toque.</p>

      {companeros.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {companeros.map((c) => (
            <li key={c.id} className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm">
              <span>{c.nombre}</span>
              <button type="button" onClick={() => quitar(c.id)} disabled={estado === "guardando" || pending} aria-label={`Quitar a ${c.nombre}`} className="grid size-7 place-items-center rounded-full text-slate-500 active:bg-slate-200 disabled:opacity-60">✕</button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={agregar} className="flex gap-2">
        <label htmlFor="nuevo-companero" className="sr-only">Nombre</label>
        <input id="nuevo-companero" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} placeholder="Nombre (p. ej. Mar)" className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 text-base focus:border-slate-900 focus:outline-none" />
        <button type="submit" disabled={estado === "guardando" || pending || !nombre.trim()} className="h-12 shrink-0 rounded-xl bg-slate-900 px-4 text-base font-medium text-white active:bg-slate-700 disabled:opacity-60">Agregar</button>
      </form>
      <p className="mt-2 min-h-4 text-xs text-red-600" aria-live="polite">{estado === "error" ? error : ""}</p>
    </section>
  );
}
