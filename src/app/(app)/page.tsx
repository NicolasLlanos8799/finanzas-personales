// src/app/page.tsx
import Link from "next/link";
import { obtenerResumen, formatoMoneda } from "@/lib/queries";
import { requerirUsuarioId } from "@/lib/usuario";
import { BarraPresupuesto } from "@/components/BarraPresupuesto";
import { BotonSaldar } from "@/components/BotonSaldar";

export const dynamic = "force-dynamic"; // siempre datos frescos desde Neon

export default async function Dashboard() {
  const usuarioId = await requerirUsuarioId();
  const r = await obtenerResumen(usuarioId);
  const fmt = (v: number | null) => formatoMoneda(v, r.moneda);

  return (
    <div className="space-y-5">
      {/* Saldo consolidado */}
      <section className="rounded-2xl bg-slate-900 p-5 text-white shadow-lg">
        <p className="text-xs uppercase tracking-wide text-slate-300">Saldo total</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums">{fmt(r.saldoTotal)}</p>
        <ul className="mt-4 space-y-1 text-sm text-slate-300">
          {r.cuentas.map((c) => (
            <li key={c.id} className="flex justify-between">
              <span>{c.nombre}{c.moneda !== r.moneda ? <span className="text-slate-400"> · {c.moneda}</span> : null}</span>
              <span className="tabular-nums text-white">
                {c.moneda !== r.moneda ? <span className="mr-2 text-slate-400">{formatoMoneda(c.saldo, c.moneda)} ≈</span> : null}
                {fmt(c.saldoPrincipal)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Este mes */}
      <Link href={`/meses/${r.esteMes.mes}`} className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 active:bg-slate-50">
        <div className="flex items-baseline justify-between">
          <p className="text-xs text-slate-500">Este mes</p>
          <p className={`text-sm font-semibold tabular-nums ${r.esteMes.balance < 0 ? "text-red-600" : "text-emerald-600"}`}>{r.esteMes.balance >= 0 ? "+" : "−"}{fmt(Math.abs(r.esteMes.balance))}</p>
        </div>
        <div className="mt-1 flex justify-between text-sm">
          <span>Ingresos <span className="tabular-nums text-emerald-700">{fmt(r.esteMes.ingresos)}</span></span>
          <span>Gastos <span className="tabular-nums text-red-700">{fmt(r.esteMes.egresos)}</span></span>
        </div>
      </Link>

      {/* Gasto de hoy + pendientes */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Gastado hoy</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(r.gastoHoy)}</p>
          <p className="text-xs text-slate-500">{r.movimientosHoy} movimiento{r.movimientosHoy === 1 ? "" : "s"}</p>
        </div>
        <Link href="/clasificar" className="rounded-2xl bg-amber-50 p-4 shadow-sm ring-1 ring-amber-200 active:bg-amber-100">
          <p className="text-xs text-amber-700">Por clasificar</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-900">{r.pendientes}</p>
          <p className="text-xs text-amber-700">Toca para ajustar</p>
        </Link>
      </section>

      {/* Lo que te deben los compañeros con los que dividiste gastos */}
      {r.deudas.length > 0 && (
        <section className="rounded-2xl bg-sky-50 p-4 shadow-sm ring-1 ring-sky-200">
          <h2 className="text-sm font-semibold text-sky-900">Gastos compartidos</h2>
          <ul className="mt-2 space-y-2">
            {r.deudas.map((dd) => (
              <li key={dd.companeroId} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-sky-950">{dd.nombre} te debe <span className="tabular-nums">{fmt(dd.pendiente)}</span></p>
                  <p className="text-xs text-sky-800">{dd.movimientos} gasto{dd.movimientos === 1 ? "" : "s"} sin saldar</p>
                </div>
                <BotonSaldar companeroId={dd.companeroId} nombre={dd.nombre} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Últimos movimientos */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-semibold">Últimos movimientos</h2>
        {r.ultimos.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Todavía no hay movimientos.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {r.ultimos.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.descripcion || "Sin descripción"}</p>
                  <p className="text-xs text-slate-500">{t.categoria ?? "Por clasificar"} · {new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(new Date(t.fecha_hora))}</p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className={t.tipo === "egreso" ? "text-red-600" : "text-emerald-600"}>{t.tipo === "egreso" ? "−" : "+"}{fmt(t.montoPrincipal)}</p>
                  {t.moneda !== r.moneda ? <p className="text-xs text-slate-400">{formatoMoneda(t.monto, t.moneda)}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Presupuestos */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-semibold">Presupuestos del mes</h2>
        {r.presupuestos.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Todavía no hay presupuestos. Puedes fijarlos en <Link href="/ajustes" className="font-medium text-slate-900 underline underline-offset-4">Ajustes</Link> para ver aquí el avance.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {r.presupuestos.map((p) => (
              <BarraPresupuesto key={p.id} nombre={p.nombre} gastado={p.gastado} presupuesto={p.presupuesto} moneda={r.moneda} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
