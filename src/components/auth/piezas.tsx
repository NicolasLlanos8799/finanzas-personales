// src/components/auth/piezas.tsx — piezas visuales de las pantallas de acceso
"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

export const INPUT =
  "w-full border-0 border-b-2 border-tinta/20 bg-transparent py-3 text-xl text-tinta outline-none transition-colors placeholder:text-tinta/30 focus:border-laton";

const retraso = (i: number) => ({ "--i": i }) as CSSProperties;

export function Campo({ etiqueta, indice = 0, ayuda, children }: { etiqueta: string; indice?: number; ayuda?: string; children: ReactNode }) {
  return (
    <label className="revelar block" style={retraso(indice + 2)}>
      <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-[0.16em] text-tinta/55">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1.5 block text-xs text-tinta/50">{ayuda}</span>}
    </label>
  );
}

export function CampoClave({ name, autoComplete, minLength }: { name: string; autoComplete: string; minLength?: number }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <input name={name} type={ver ? "text" : "password"} required minLength={minLength} autoComplete={autoComplete} className={`${INPUT} pr-16`} />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute right-0 top-1/2 -translate-y-1/2 px-1 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-tinta/55 active:text-tinta"
      >
        {ver ? "Ocultar" : "Ver"}
      </button>
    </div>
  );
}

export function Aviso({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="revelar rounded-xl bg-coral/10 px-4 py-3 text-sm text-coral ring-1 ring-coral/20" style={retraso(1)}>
      {children}
    </p>
  );
}

export function Boton({ enviando, indice = 5, children }: { enviando: boolean; indice?: number; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={enviando}
      className="revelar group flex h-14 w-full items-center justify-between rounded-2xl bg-tinta px-6 text-base font-medium text-papel shadow-[0_10px_30px_-12px_rgba(15,42,34,0.7)] transition active:scale-[0.985] disabled:opacity-70"
      style={retraso(indice)}
    >
      <span>{enviando ? "Un momento…" : children}</span>
      <span aria-hidden className="grid size-8 place-items-center rounded-full bg-laton text-tinta transition group-hover:translate-x-0.5">→</span>
    </button>
  );
}
