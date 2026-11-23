// src/app/meses/[mes]/page.tsx — detalle de un mes
import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerDetalleMes, formatoMoneda } from "@/lib/queries";
import { requerirUsuarioId } from "@/lib/usuario";
import { BotonEliminar } from "@/components/BotonEliminar";
import { BotonDividir } from "@/components/BotonDividir";
import { listarCompaneros } from "@/lib/companeros";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DetalleMes({ params }: { params: Promise<{ mes: string }> }) {
  const { mes } = await params;
  const usuarioId = await requerirUsuarioId();
  const [d, companeros] = await Promise.all([obtenerDetalleMes(usuarioId, mes), listarCompaneros(pool, usuarioId)]);
  if (!d) notFound();
  const fmt = (v: number | null) => formatoMoneda(v, d.moneda);
  const egresos = d.porCategoria.filter((c) => c.tipo === "egreso");
  const ingresos = d.porCategoria.filter((c) => c.tipo === "ingreso");
  const maxEgreso = Math.max(1, ...egresos.map((c) => c.total));

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <Link href="/meses" aria-label="Volver a meses" className="rounded-full bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">←</Link>
        <div>
          <h1 className="text-xl font-semibold">{d.etiqueta}</h1>
          <p className="text-sm text-slate-500">{d.dias.reduce((a, x) => a + x.movimientos.length, 0)} movimientos</p>
        </div>
      </header>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between rounded-2xl bg-slate-900 p-4 text-white shadow-sm">
          <p className="text-sm text-slate-300">Balance del mes</p>
          <p className="text-2xl font-semibold tabular-nums">{d.balance >= 0 ? "+" : "−"}{fmt(Math.abs(d.balance))}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Ingresos</p><p className="text-sm font-semibold tabular-nums text-emerald-700">{fmt(d.ingresos)}</p></div>
          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200"><p className="text-xs text-slate-500">Gastos</p><p className="text-sm font-semibold tabular-nums text-red-700">{fmt(d.egresos)}</p></div>
        </div>
      </section>

      {egresos.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-sm font-semibold">Gastos por categoría</h2>
          <ul className="mt-3 space-y-3">
            {egresos.map((c) => {
              const pctMes = d.egresos > 0 ? Math.round((c.total / d.egresos) * 100) : 0;
              const sobre = c.presupuesto > 0 && c.total > c.presupuesto;
              return (
                <li key={c.id ?? "sin"}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{c.nombre} <span className="text-slate-400">· {c.movimientos}</span></span>
                    <span className="tabular-nums">{fmt(c.total)} <span className="text-slate-400">{pctMes} %</span></span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${sobre ? "bg-red-500" : "bg-slate-800"}`} style={{ width: `${Math.round((c.total / maxEgreso) * 100)}%` }} />
                  </div>
                  {c.presupuesto > 0 && <p className={`mt-0.5 text-xs ${sobre ? "text-red-600" : "text-slate-500"}`}>Presupuesto {fmt(c.presupuesto)}{sobre ? ` · excedido por ${fmt(c.total - c.presupuesto)}` : ""}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {ingresos.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-sm font-semibold">Ingresos por categoría</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {ingresos.map((c) => (
              <li key={c.id ?? "sin"} className="flex justify-between py-2 text-sm"><span>{c.nombre}</span><span className="tabular-nums text-emerald-700">{fmt(c.total)}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        {d.dias.length === 0 && <p className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">Sin movimientos este mes.</p>}
        {d.dias.map((dia) => (
          <div key={dia.fecha} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">{dia.etiqueta}</h3>
              <span className={`text-xs tabular-nums ${dia.total < 0 ? "text-red-600" : "text-emerald-600"}`}>{dia.total >= 0 ? "+" : "−"}{fmt(Math.abs(dia.total))}</span>
            </div>
            <ul className="mt-2 divide-y divide-slate-100">
              {dia.movimientos.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.descripcion || "Sin descripción"}</p>
                    <p className="text-xs text-slate-500">{t.categoria ?? "Por clasificar"} · {t.origen === "Manual_Web" ? "manual" : "iPhone"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right tabular-nums">
                      <p className={t.tipo === "egreso" ? "text-red-600" : "text-emerald-600"}>{t.tipo === "egreso" ? "−" : "+"}{fmt(t.montoPrincipal)}</p>
                      {t.companero && <p className="text-xs text-sky-700">tu parte {fmt(t.montoPropio)}{t.saldada ? " · saldado" : ""}</p>}
                      {t.moneda !== d.moneda && <p className="text-xs text-slate-400">{formatoMoneda(t.monto, t.moneda)}</p>}
                    </div>
                    {t.tipo === "egreso" && (
                      <BotonDividir id={t.id} companeros={companeros} actual={{ companeroId: t.companeroId, nombre: t.companero, porcentajePropio: t.porcentajePropio }} />
                    )}
                    <BotonEliminar id={t.id} descripcion={t.descripcion} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
