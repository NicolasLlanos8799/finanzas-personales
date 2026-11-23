// src/app/(app)/ajustes/page.tsx
import Link from "next/link";
import { obtenerAjustes, obtenerPresupuestos } from "@/lib/queries";
import { requerirUsuarioId } from "@/lib/usuario";
import { FormAjustes } from "@/components/FormAjustes";
import { FormPresupuestos } from "@/components/FormPresupuestos";
import { FormClave } from "@/components/FormClave";
import { FormCompaneros } from "@/components/FormCompaneros";
import { listarCompaneros } from "@/lib/companeros";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Ajustes() {
  const usuarioId = await requerirUsuarioId();
  const [a, presupuestos, companeros] = await Promise.all([obtenerAjustes(usuarioId), obtenerPresupuestos(usuarioId), listarCompaneros(pool, usuarioId)]);
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Ajustes</h1>
        <p className="text-sm text-slate-500">Hola, {a.nombre}.</p>
      </header>

      <Link href="/conectar" className="flex items-center justify-between rounded-2xl bg-slate-900 p-4 text-white shadow-sm active:bg-slate-700">
        <span>
          <span className="block text-sm font-semibold">Conectar tu iPhone</span>
          <span className="block text-xs text-slate-300">Clave, atajo y automatización</span>
        </span>
        <span aria-hidden>→</span>
      </Link>

      <FormAjustes monedaPrincipal={a.moneda_principal} zonaHoraria={a.zona_horaria} cuentas={a.cuentas} />
      <FormCompaneros companeros={companeros} />
      <FormPresupuestos filas={presupuestos} moneda={a.moneda_principal} />
      <FormClave />

      <form method="post" action="/api/logout">
        <button type="submit" className="h-12 w-full rounded-xl border border-slate-300 bg-white text-base font-medium text-slate-700 active:bg-slate-100">Cerrar sesión</button>
      </form>
      <p className="text-xs text-slate-500">
        Cotizaciones: open.er-api.com, base USD, una vez al día. Última actualización: {a.ultimaCotizacion ?? "todavía ninguna"}.
        Cada movimiento se guarda en su moneda original y se convierte al mostrarlo.
      </p>
    </div>
  );
}
