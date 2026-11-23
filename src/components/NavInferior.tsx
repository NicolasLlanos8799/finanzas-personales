// src/components/NavInferior.tsx — barra inferior flotante con iconos y sección activa
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const ico = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

const Inicio = () => (
  <svg {...ico}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M10 20v-5h4v5" /></svg>
);
const Meses = () => (
  <svg {...ico}><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
const Clasificar = () => (
  <svg {...ico}><path d="M3.5 12.2V5.5a2 2 0 0 1 2-2h6.7a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8l-6.7 6.7a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1-.6-1.4Z" /><circle cx="8.5" cy="8.5" r="1.3" /></svg>
);
const Ajustes = () => (
  <svg {...ico}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>
);
const Mas = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
);

function Item({ href, texto, activo, children }: { href: string; texto: string; activo: boolean; children: ReactNode }) {
  return (
    <Link href={href} aria-current={activo ? "page" : undefined} className="group flex flex-1 flex-col items-center gap-1 py-1.5">
      <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${activo ? "bg-tinta/10 text-tinta" : "text-slate-500 group-active:bg-slate-100"}`}>{children}</span>
      <span className={`text-[11px] leading-none ${activo ? "font-semibold text-tinta" : "font-medium text-slate-500"}`}>{texto}</span>
    </Link>
  );
}

export function NavInferior() {
  const pathname = usePathname();
  const en = (ruta: string) => (ruta === "/" ? pathname === "/" : pathname === ruta || pathname.startsWith(`${ruta}/`));

  return (
    <nav aria-label="Principal" className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto mx-auto flex max-w-md items-end rounded-[1.75rem] border border-slate-200/80 bg-white/90 px-2 pb-1.5 pt-1.5 shadow-[0_12px_40px_-12px_rgba(15,42,34,0.35)] backdrop-blur-xl">
        <Item href="/" texto="Inicio" activo={en("/")}><Inicio /></Item>
        <Item href="/meses" texto="Meses" activo={en("/meses")}><Meses /></Item>

        <Link href="/nuevo" aria-label="Nuevo movimiento" aria-current={en("/nuevo") ? "page" : undefined} className="group flex flex-1 flex-col items-center gap-1 pb-1.5">
          <span className="-mt-8 grid size-16 place-items-center rounded-full bg-tinta text-laton-claro shadow-[0_10px_24px_-8px_rgba(15,42,34,0.75)] ring-4 ring-slate-50 transition group-active:scale-95">
            <Mas />
          </span>
          <span className={`text-[11px] leading-none ${en("/nuevo") ? "font-semibold text-tinta" : "font-medium text-slate-500"}`}>Nuevo</span>
        </Link>

        <Item href="/clasificar" texto="Clasificar" activo={en("/clasificar")}><Clasificar /></Item>
        <Item href="/ajustes" texto="Ajustes" activo={en("/ajustes") || en("/conectar")}><Ajustes /></Item>
      </div>
    </nav>
  );
}
