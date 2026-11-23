// src/components/ClaveConexion.tsx — muestra la clave oculta y permite copiarla o regenerarla
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BotonCopiar } from "@/components/BotonCopiar";

export function ClaveConexion({ clave }: { clave: string }) {
  const router = useRouter();
  const [ver, setVer] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [pending, startTransition] = useTransition();

  async function regenerar() {
    setOcupado(true);
    try {
      const res = await fetch("/api/v1/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regenerar_api_key: true }) });
      if (!res.ok) throw new Error();
      setConfirmar(false);
      startTransition(() => router.refresh());
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="break-all rounded-xl bg-slate-100 px-3 py-3 font-mono text-xs leading-relaxed text-slate-700">
        {ver ? clave : `${"•".repeat(24)}${clave.slice(-6)}`}
      </p>
      <div className="flex flex-wrap gap-2">
        <BotonCopiar texto={clave} etiqueta="Copiar clave" primario />
        <button type="button" onClick={() => setVer((v) => !v)} className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700">
          {ver ? "Ocultar" : "Ver"}
        </button>
      </div>
      {!confirmar ? (
        <button type="button" onClick={() => setConfirmar(true)} className="text-xs text-slate-500 underline underline-offset-4">Generar una clave nueva</button>
      ) : (
        <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
          <p>La clave actual dejará de funcionar y tendrás que cambiarla en el atajo del iPhone.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={regenerar} disabled={ocupado || pending} className="rounded-lg bg-amber-700 px-3 py-2 font-medium text-white disabled:opacity-60">{ocupado ? "…" : "Sí, generar"}</button>
            <button type="button" onClick={() => setConfirmar(false)} className="rounded-lg px-3 py-2 font-medium text-amber-900">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
