// src/components/MovimientoItem.tsx — fila de un movimiento; al tocarla se abre una ventana grande
// con el detalle completo y botones grandes para editar, cambiar categoría, dividir o eliminar.
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Movimiento } from "@/lib/tipos";

interface Categoria { id: string; nombre: string; tipo: "ingreso" | "egreso" }
interface Companero { id: string; nombre: string }

const PORCENTAJES = [75, 70, 60, 50, 40, 30, 25];

function dinero(v: number | null, moneda: string): string {
  if (v === null) return "—";
  try {
    return new Intl.NumberFormat("es", { style: "currency", currency: moneda, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${v.toFixed(2)} ${moneda}`;
  }
}

function fechaLarga(fechaLocal: string): string {
  const t = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${fechaLocal}T00:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function fechaCorta(fechaLocal: string): string {
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${fechaLocal}T00:00:00Z`));
}

const ORIGEN: Record<string, string> = { Manual_Web: "Manual", Webhook_iOS: "iPhone", Importacion: "Importado" };

export function MovimientoItem({
  m, companeros, categorias, monedaPrincipal, mostrarFecha = false,
}: {
  m: Movimiento;
  companeros: Companero[];
  categorias: Categoria[];
  monedaPrincipal: string;
  mostrarFecha?: boolean; // en el inicio se muestra la fecha corta en lugar del origen
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [porcentaje, setPorcentaje] = useState(m.companeroId ? m.porcentajePropio : 50);
  const [recordar, setRecordar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    setConfirmarBorrado(false);
    setError("");
  }

  async function llamar(metodo: "PATCH" | "DELETE", body?: Record<string, unknown>) {
    setOcupado(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/transactions/${m.id}`, {
        method: metodo,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.mensaje ?? `Error ${res.status}`);
      cerrar();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción");
    } finally {
      setOcupado(false);
    }
  }

  const esEgreso = m.tipo === "egreso";
  const signo = esEgreso ? "−" : "+";
  const color = esEgreso ? "text-red-600" : "text-emerald-600";
  const opcionesCategoria = categorias.filter((c) => c.tipo === m.tipo);
  const bloqueado = ocupado || pending;
  const chip = "min-h-12 rounded-full px-5 text-base font-medium transition active:scale-[0.98] disabled:opacity-60";

  return (
    <li>
      {/* Fila: toda la fila es un botón grande */}
      <button type="button" onClick={() => setAbierto(true)} aria-haspopup="dialog"
        className="flex w-full items-center justify-between gap-3 rounded-xl py-3 text-left text-sm active:bg-slate-50">
        <div className="min-w-0">
          <p className="truncate font-medium">{m.descripcion || "Sin descripción"}</p>
          <p className="truncate text-xs text-slate-500">
            {m.esPorClasificar || !m.categoria ? <span className="font-medium text-amber-700">Por clasificar</span> : m.categoria}
            {" · "}{mostrarFecha ? fechaCorta(m.fechaLocal) : (ORIGEN[m.origen] ?? m.origen)}
            {m.companero ? <span className="text-sky-700"> · ÷ {m.companero}</span> : null}
          </p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className={color}>{signo}{dinero(m.montoPrincipal, monedaPrincipal)}</p>
          {m.companero && <p className="text-xs text-sky-700">tu parte {dinero(m.montoPropio, monedaPrincipal)}</p>}
          {m.moneda !== monedaPrincipal && <p className="text-xs text-slate-400">{dinero(m.monto, m.moneda)}</p>}
        </div>
      </button>

      {/* Ventana de detalle y acciones */}
      <dialog ref={dialogo} onClose={cerrar} onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }} aria-labelledby={`mov-${m.id}`}
        className="mx-auto mb-0 mt-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/60 md:my-auto md:rounded-3xl">
        {abierto && (
          <div className="space-y-5 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{esEgreso ? "Gasto" : "Ingreso"}</p>
                <h2 id={`mov-${m.id}`} className="break-words text-xl font-semibold leading-tight">{m.descripcion || "Sin descripción"}</h2>
              </div>
              <button type="button" onClick={cerrar} aria-label="Cerrar" className="grid size-12 shrink-0 place-items-center rounded-full bg-slate-100 text-lg text-slate-600 active:bg-slate-200">✕</button>
            </header>

            {/* Importe */}
            <section className="rounded-2xl bg-slate-50 p-4">
              <p className={`text-4xl font-semibold tabular-nums ${color}`}>{signo}{dinero(m.montoPrincipal, monedaPrincipal)}</p>
              {m.moneda !== monedaPrincipal && <p className="mt-1 text-sm tabular-nums text-slate-500">Pagado: {dinero(m.monto, m.moneda)}</p>}
              {m.companero && (
                <p className="mt-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
                  Dividido con <strong>{m.companero}</strong>: tu parte es <strong className="tabular-nums">{dinero(m.montoPropio, monedaPrincipal)}</strong> ({m.porcentajePropio} %)
                  {m.saldada ? " · ya saldado" : " · pendiente de saldar"}.
                </p>
              )}
            </section>

            {/* Detalle */}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">Categoría</dt>
              <dd className="text-right font-medium">{m.esPorClasificar || !m.categoria ? "Por clasificar" : m.categoria}</dd>
              <dt className="text-slate-500">Fecha</dt>
              <dd className="text-right font-medium">{fechaLarga(m.fechaLocal)}</dd>
              <dt className="text-slate-500">Hora</dt>
              <dd className="text-right font-medium tabular-nums">{m.horaLocal}</dd>
              <dt className="text-slate-500">Cuenta</dt>
              <dd className="text-right font-medium">{m.cuenta}</dd>
              <dt className="text-slate-500">Registrado desde</dt>
              <dd className="text-right font-medium">{ORIGEN[m.origen] ?? m.origen}</dd>
            </dl>

            {/* Acciones principales */}
            <section className="grid grid-cols-2 gap-3">
              <Link href={`/editar/${m.id}`} className="grid min-h-14 place-items-center rounded-2xl bg-slate-900 text-base font-medium text-white active:bg-slate-700">✎ Editar</Link>
              {!confirmarBorrado ? (
                <button type="button" onClick={() => setConfirmarBorrado(true)} disabled={bloqueado}
                  className="min-h-14 rounded-2xl border-2 border-red-200 text-base font-medium text-red-700 active:bg-red-50 disabled:opacity-60">Eliminar</button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => llamar("DELETE")} disabled={bloqueado} className="min-h-14 rounded-2xl bg-red-600 text-sm font-semibold text-white active:bg-red-700 disabled:opacity-60">{bloqueado ? "…" : "Sí, borrar"}</button>
                  <button type="button" onClick={() => setConfirmarBorrado(false)} className="min-h-14 rounded-2xl border border-slate-300 text-sm font-medium text-slate-700 active:bg-slate-100">No</button>
                </div>
              )}
            </section>

            {/* Categoría */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Cambiar categoría</h3>
              {opcionesCategoria.length === 0 ? (
                <p className="text-sm text-slate-500">No hay categorías disponibles para este tipo.</p>
              ) : (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Categoría">
                  {opcionesCategoria.map((c) => (
                    <button key={c.id} type="button" disabled={bloqueado} onClick={() => llamar("PATCH", { categoria_id: c.id })}
                      className={`${chip} ${m.categoriaId === c.id && !m.esPorClasificar ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800 active:bg-slate-200"}`}>
                      {c.nombre}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">Recordaré este comercio para clasificarlo solo la próxima vez.</p>
            </section>

            {/* Dividir (solo gastos) */}
            {esEgreso && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Dividir con…</h3>
                {companeros.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Guarda a alguien en <Link href="/ajustes" className="font-medium text-slate-900 underline underline-offset-4">Ajustes</Link> para dividir gastos con un toque.</p>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                      <label className="flex items-center gap-2">
                        Tu parte
                        <select value={porcentaje} onChange={(e) => setPorcentaje(Number(e.target.value))} className="h-11 rounded-lg border border-slate-300 bg-white px-2 text-base">
                          {[...new Set([porcentaje, ...PORCENTAJES])].sort((a, b) => b - a).map((p) => <option key={p} value={p}>{p} %</option>)}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} className="size-5" />
                        Siempre dividir este comercio
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Dividir con">
                      {companeros.map((c) => (
                        <button key={c.id} type="button" disabled={bloqueado}
                          onClick={() => llamar("PATCH", { companero_id: c.id, porcentaje_propio: porcentaje, recordar_division: recordar })}
                          className={`${chip} ${m.companeroId === c.id ? "bg-sky-700 text-white" : "bg-sky-50 text-sky-900 active:bg-sky-100"}`}>
                          Con {c.nombre}
                        </button>
                      ))}
                      {m.companeroId && (
                        <button type="button" disabled={bloqueado} onClick={() => llamar("PATCH", { companero_id: null, recordar_division: recordar })}
                          className={`${chip} border border-slate-300 text-slate-700 active:bg-slate-100`}>
                          Solo yo
                        </button>
                      )}
                    </div>
                  </>
                )}
              </section>
            )}

            <p className="min-h-5 text-center text-sm text-red-600" aria-live="polite">{error}</p>
          </div>
        )}
      </dialog>
    </li>
  );
}
