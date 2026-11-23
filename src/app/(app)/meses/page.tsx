// src/app/meses/page.tsx — historial mensual
import Link from "next/link";
import { obtenerMeses, formatoMoneda } from "@/lib/queries";
import { requerirUsuarioId } from "@/lib/usuario";

export const dynamic = "force-dynamic";

export default async function Meses() {
  const { moneda, meses } = await obtenerMeses(await requerirUsuarioId());
  const fmt = (v: number) => formatoMoneda(v, moneda);
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Meses</h1>
        <p className="text-sm text-slate-500">Cada mes empieza solo el día 1 en tu zona horaria. Toca uno para ver el detalle.</p>
      </header>
      <ul className="space-y-2">
        {meses.map((m) => (
          <li key={m.mes}>
            <Link href={`/meses/${m.mes}`} className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 active:bg-slate-50">
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">{m.etiqueta}</h2>
                <span className={`text-lg font-semibold tabular-nums ${m.balance < 0 ? "text-red-600" : "text-emerald-600"}`}>{m.balance >= 0 ? "+" : "−"}{fmt(Math.abs(m.balance))}</span>
              </div>
              <div className="mt-1 flex justify-between text-xs text-slate-500">
                <span>Ingresos <span className="tabular-nums text-emerald-700">{fmt(m.ingresos)}</span></span>
                <span>Gastos <span className="tabular-nums text-red-700">{fmt(m.egresos)}</span></span>
                <span>{m.movimientos} mov.{m.sinClasificar > 0 ? ` · ${m.sinClasificar} sin clasificar` : ""}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
