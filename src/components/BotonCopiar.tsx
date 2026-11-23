// src/components/BotonCopiar.tsx
"use client";

import { useState } from "react";

export function BotonCopiar({ texto, etiqueta, primario = false }: { texto: string; etiqueta: string; primario?: boolean }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className={`h-11 rounded-xl px-4 text-sm font-medium transition active:scale-[0.98] ${primario ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
    >
      {copiado ? "Copiado ✓" : etiqueta}
    </button>
  );
}
