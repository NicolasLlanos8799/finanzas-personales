// src/app/(app)/conectar/page.tsx — conectar el iPhone en tres pasos
import { headers } from "next/headers";
import { obtenerConexion } from "@/lib/queries";
import { requerirUsuarioId } from "@/lib/usuario";
import { AsistenteConexion } from "@/components/AsistenteConexion";
import { ClaveConexion } from "@/components/ClaveConexion";

export const dynamic = "force-dynamic";

export default async function Conectar() {
  const c = await obtenerConexion(await requerirUsuarioId());
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const icloud = process.env.URL_ATAJO_ICLOUD ?? "";
  const urlIcloud = /^https:\/\/www\.icloud\.com\/shortcuts\/[A-Za-z0-9]+\/?$/.test(icloud) ? icloud : null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Conectar tu iPhone</h1>
        <p className="text-sm text-slate-500">Para que cada pago se anote solo. Tres pasos, unos minutos.</p>
      </header>

      <AsistenteConexion
        apiKey={c.apiKey}
        inicial={{ ultimoWebhook: c.ultimoWebhook, resultado: c.ultimoResultado }}
        urlDireccion={`${proto}://${host}/api/v1/transactions/auto`}
        urlIcloud={urlIcloud}
      />

      <details className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <summary className="cursor-pointer text-sm font-semibold">Mi clave personal</summary>
        <p className="mb-3 mt-2 text-xs text-slate-500">Identifica a tu iPhone. No la compartas: quien la tenga puede anotar movimientos en tu cuenta.</p>
        <ClaveConexion clave={c.apiKey} />
      </details>
    </div>
  );
}
