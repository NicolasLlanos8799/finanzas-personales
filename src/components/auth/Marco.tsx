// src/components/auth/Marco.tsx — cabecera de marca y hoja de papel para acceso y registro
import type { CSSProperties, ReactNode } from "react";

const retraso = (i: number) => ({ "--i": i }) as CSSProperties;

const APUNTES = [
  ["Netto", "−199,00 DKK"],
  ["Mercadona", "−12,50 EUR"],
  ["Coop Pronto", "−8,90 CHF"],
];

export function Marco({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: ReactNode }) {
  return (
    <>
      <header className="relative px-6 pt-[max(2.25rem,env(safe-area-inset-top))] md:mx-auto md:w-full md:max-w-md">
        <div className="revelar flex items-center gap-3" style={retraso(0)}>
          <span aria-hidden className="grid size-10 place-items-center rounded-full border border-laton/70 font-display text-xl italic text-laton-claro">f</span>
          <span className="font-display text-3xl italic tracking-tight">finanzas</span>
        </div>

        <p className="revelar mt-5 max-w-[15rem] font-display text-[2.1rem] font-light leading-[1.04]" style={retraso(1)}>
          Cada pago, <em className="text-laton-claro">en su lugar.</em>
        </p>

        <div className="revelar mt-6 hidden rounded-2xl border border-papel/10 bg-papel/[0.06] px-4 py-3 backdrop-blur-sm [@media(min-height:780px)]:block" style={retraso(2)}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-papel/45">Hoy</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {APUNTES.map(([comercio, importe]) => (
              <li key={comercio} className="flex items-baseline">
                <span>{comercio}</span>
                <span aria-hidden className="mx-2 flex-1 -translate-y-[3px] border-b border-dotted border-papel/25" />
                <span className="font-display tabular-nums">{importe}</span>
              </li>
            ))}
          </ul>
        </div>
      </header>

      <section className="relative z-10 mt-8 flex-1 rounded-t-[2rem] bg-papel px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-7 text-tinta shadow-[0_-24px_60px_-24px_rgba(0,0,0,0.65)] md:mx-auto md:mb-10 md:mt-10 md:w-full md:max-w-md md:flex-none md:rounded-[2rem]">
        <span aria-hidden className="mx-auto mb-6 block h-1 w-10 rounded-full bg-tinta/15" />
        <h1 className="font-display text-[1.85rem] leading-tight">{titulo}</h1>
        <p className="mt-1 text-sm text-tinta/60">{subtitulo}</p>
        <div className="mt-6">{children}</div>
      </section>
    </>
  );
}
