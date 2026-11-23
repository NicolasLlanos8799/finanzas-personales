// src/components/FormClave.tsx — cambio de contraseña
"use client";

import { useState } from "react";

export function FormClave() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok" | "error">("idle");
  const [mensaje, setMensaje] = useState("");

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("guardando");
    try {
      const res = await fetch("/api/v1/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave: { actual, nueva } }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.mensaje ?? "No se pudo cambiar");
      setEstado("ok");
      setMensaje("Contraseña cambiada");
      setActual("");
      setNueva("");
    } catch (err) {
      setEstado("error");
      setMensaje(err instanceof Error ? err.message : "No se pudo cambiar");
    }
  }

  const input = "h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-base focus:border-slate-900 focus:outline-none";
  return (
    <form onSubmit={guardar} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold">Cambiar contraseña</h2>
      <div className="mt-3 space-y-2">
        <input type="password" required autoComplete="current-password" placeholder="Contraseña actual" value={actual} onChange={(e) => setActual(e.target.value)} className={input} />
        <input type="password" required minLength={6} autoComplete="new-password" placeholder="Contraseña nueva (mínimo 6)" value={nueva} onChange={(e) => setNueva(e.target.value)} className={input} />
      </div>
      <button type="submit" disabled={estado === "guardando"} className="mt-3 h-12 w-full rounded-xl border border-slate-300 bg-white text-base font-medium text-slate-700 active:bg-slate-100 disabled:opacity-60">
        {estado === "guardando" ? "Guardando…" : "Cambiar contraseña"}
      </button>
      <p className="mt-2 min-h-4 text-center text-xs" aria-live="polite">
        {estado === "ok" && <span className="text-emerald-600">{mensaje}</span>}
        {estado === "error" && <span className="text-red-600">{mensaje}</span>}
      </p>
    </form>
  );
}
