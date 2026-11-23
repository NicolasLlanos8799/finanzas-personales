// src/components/BotonEliminar.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function BotonEliminar({ id, descripcion }: { id: string; descripcion: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function eliminar() {
    setOcupado(true);
    try {
      const res = await fetch(`/api/v1/transactions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      setOcupado(false);
      setConfirmar(false);
    }
  }

  if (!confirmar) {
    return <button type="button" onClick={() => setConfirmar(true)} aria-label={`Eliminar ${descripcion}`} className="rounded-lg px-2 py-1 text-xs text-slate-400 active:bg-slate-100">✕</button>;
  }
  return (
    <span className="flex items-center gap-1">
      <button type="button" onClick={eliminar} disabled={ocupado || pending} className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-60">{ocupado ? "…" : "Borrar"}</button>
      <button type="button" onClick={() => setConfirmar(false)} className="rounded-lg px-2 py-1 text-xs text-slate-500">No</button>
    </span>
  );
}
