// src/app/(app)/editar/[id]/page.tsx — editar un movimiento
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { obtenerAjustes, obtenerCategorias, obtenerCuentas, obtenerTransaccion } from "@/lib/queries";
import { requerirUsuarioId } from "@/lib/usuario";
import { listarCompaneros } from "@/lib/companeros";
import { pool } from "@/lib/db";
import { FormEditar } from "@/components/FormEditar";

export const dynamic = "force-dynamic";

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const usuarioId = await requerirUsuarioId();
  const [t, categorias, cuentas, ajustes, companeros] = await Promise.all([
    obtenerTransaccion(usuarioId, id), obtenerCategorias(usuarioId), obtenerCuentas(usuarioId), obtenerAjustes(usuarioId), listarCompaneros(pool, usuarioId),
  ]);
  if (!t) notFound();
  const hoy = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: ajustes.zona_horaria }).format(new Date());

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <Link href={`/meses/${t.fechaLocal.slice(0, 7)}`} aria-label="Volver" className="rounded-full bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">←</Link>
        <div>
          <h1 className="text-xl font-semibold">Editar movimiento</h1>
          <p className="text-sm text-slate-500">Cambia lo que necesites; el saldo se ajusta solo.</p>
        </div>
      </header>
      <FormEditar t={t} categorias={categorias} cuentas={cuentas} companeros={companeros} hoy={hoy} />
    </div>
  );
}
