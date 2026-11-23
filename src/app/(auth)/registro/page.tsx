// src/app/(auth)/registro/page.tsx
import Link from "next/link";
import { Marco } from "@/components/auth/Marco";
import { FormRegistro } from "@/components/auth/FormRegistro";
import { registroPermitido } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Registro({ searchParams }: { searchParams: Promise<{ k?: string; error?: string; nombre?: string }> }) {
  const { k, error, nombre } = await searchParams;

  if (!registroPermitido(k)) {
    return (
      <Marco titulo="Solo por invitación" subtitulo="Pide el enlace de registro a quien administra la app.">
        <Link href="/login" className="revelar inline-block font-medium text-tinta underline decoration-laton decoration-2 underline-offset-4" style={{ "--i": 2 } as React.CSSProperties}>
          Volver a entrar
        </Link>
      </Marco>
    );
  }

  return (
    <Marco titulo="Crea tu cuenta" subtitulo="Solo necesitas un nombre y una contraseña.">
      <FormRegistro k={k} error={error} nombre={nombre} />
      <p className="revelar mt-7 text-center text-sm text-tinta/60" style={{ "--i": 6 } as React.CSSProperties}>
        ¿Ya tienes cuenta? <Link href="/login" className="font-medium text-tinta underline decoration-laton decoration-2 underline-offset-4">Entrar</Link>
      </p>
    </Marco>
  );
}
