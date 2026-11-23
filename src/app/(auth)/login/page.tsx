// src/app/(auth)/login/page.tsx
import Link from "next/link";
import type { CSSProperties } from "react";
import { Marco } from "@/components/auth/Marco";
import { FormLogin } from "@/components/auth/FormLogin";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; nombre?: string; k?: string }> }) {
  const { next, error, nombre, k } = await searchParams;
  // Si se llega con el enlace privado (/login?k=…), el botón lo lleva consigo hasta el registro
  const irARegistro = k ? `/registro?k=${encodeURIComponent(k)}` : "/registro";
  return (
    <Marco titulo="Bienvenido de vuelta" subtitulo="Entra con tu nombre y tu contraseña.">
      <FormLogin next={next} error={!!error} nombre={nombre} />

      <div className="revelar mt-8" style={{ "--i": 5 } as CSSProperties}>
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-tinta/45">
          <span className="h-px flex-1 bg-tinta/15" />
          ¿Primera vez?
          <span className="h-px flex-1 bg-tinta/15" />
        </div>
        <Link
          href={irARegistro}
          className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl border-2 border-tinta/80 text-base font-medium text-tinta transition active:scale-[0.985] active:bg-tinta/5"
        >
          Crear cuenta
        </Link>
      </div>
    </Marco>
  );
}
