// src/components/BotonDividir.tsx — divide (o deja de dividir) un gasto ya registrado con un toque
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Companero { id: string; nombre: string }

const PORCENTAJES = [50, 60, 70, 40, 30, 25, 75];

export function BotonDividir({
  id, companeros, actual,
}: {
  id: string;
  companeros: Companero[];
  actual: { companeroId: string | null; nombre: string | null; porcentajePropio: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [porcentaje, setPorcentaje] = useState(actual.companeroId ? actual.porcentajePropio : 50);
  const [recordar, setRecordar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(false);

  async function aplicar(companeroId: string | null) {
    setOcupado(true);
    setError(false);
    try {
      const res = await fetch(`/api/v1/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companero_id: companeroId, porcentaje_propio: companeroId ? porcentaje : undefined, recordar_division: recordar }),
      });
      if (!res.ok) throw new Error();
      setAbierto(false);
      startTransition(() => router.refresh());
    } catch {
      setError(true);
    } finally {
      setOcupado(false);
    }
  }

  // Sin compañeros guardados no hay con quién dividir: el botón lleva a Ajustes
  if (companeros.length === 0 && !actual.companeroId) {
    return <a href="/ajustes" className="rounded-lg px-2 py-1 text-xs text-slate-400 active:bg-slate-100" aria-label="Guardar un compañero para dividir gastos">÷</a>;
  }

  const etiqueta = actual.companeroId ? `÷ ${actual.nombre ?? "—"} ${actual.porcentajePropio}%` : "÷ Dividir";

  return (
    <div className="relative">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
        className={`rounded-lg px-2 py-1 text-xs active:bg-slate-100 ${actual.companeroId ? "bg-sky-50 font-medium text-sky-800" : "text-slate-500"}`}>
        {etiqueta}
      </button>

      {abierto && (
        <div className="absolute right-0 z-20 mt-1 w-64 space-y-3 rounded-2xl bg-white p-3 text-sm shadow-lg ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`pct-${id}`} className="text-xs text-slate-600">Tu parte</label>
            <select id={`pct-${id}`} value={porcentaje} onChange={(e) => setPorcentaje(Number(e.target.value))} className="h-10 rounded-lg border border-slate-300 bg-slate-50 px-2 text-sm">
              {[...new Set([porcentaje, ...PORCENTAJES])].sort((a, b) => b - a).map((p) => <option key={p} value={p}>{p} %</option>)}
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} className="size-4" />
            Recordar para este comercio
          </label>

          <div className="flex flex-wrap gap-2">
            {companeros.map((c) => (
              <button key={c.id} type="button" disabled={ocupado || pending} onClick={() => aplicar(c.id)}
                className={`h-10 rounded-full px-4 text-sm font-medium disabled:opacity-60 ${actual.companeroId === c.id ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-800 active:bg-slate-200"}`}>
                Con {c.nombre}
              </button>
            ))}
            {actual.companeroId && (
              <button type="button" disabled={ocupado || pending} onClick={() => aplicar(null)} className="h-10 rounded-full border border-slate-300 px-4 text-sm text-slate-700 active:bg-slate-100 disabled:opacity-60">Solo yo</button>
            )}
          </div>
          {error && <p className="text-xs text-red-600">No se pudo guardar</p>}
        </div>
      )}
    </div>
  );
}
