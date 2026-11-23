// src/components/BotonSaldar.tsx — marca como saldada la deuda con un compañero
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function BotonSaldar({ companeroId, nombre }: { companeroId: string; nombre: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function saldar() {
    setOcupado(true);
    try {
      const res = await fetch(`/api/v1/companeros/${companeroId}/saldar`, { method: "POST" });
      if (!res.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      setOcupado(false);
      setConfirmar(false);
    }
  }

  if (!confirmar) {
    return <button type="button" onClick={() => setConfirmar(true)} className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-sky-900 ring-1 ring-sky-300 active:bg-sky-100">Saldar</button>;
  }
  return (
    <span className="flex items-center gap-1">
      <button type="button" onClick={saldar} disabled={ocupado || pending} aria-label={`Confirmar que ${nombre} ya te pagó`} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">{ocupado ? "…" : "Ya pagó"}</button>
      <button type="button" onClick={() => setConfirmar(false)} className="rounded-lg px-2 py-2 text-xs text-slate-500">No</button>
    </span>
  );
}
