// src/components/FormEditar.tsx — edita un movimiento ya registrado (importe, fecha, hora, concepto…)
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MONEDAS_SOPORTADAS } from "@/lib/parseo";

interface Categoria { id: string; nombre: string; tipo: "ingreso" | "egreso" }
interface Cuenta { id: string; nombre: string; moneda: string }
interface Companero { id: string; nombre: string }
interface Transaccion {
  id: string; tipo: "ingreso" | "egreso"; monto: number; moneda: string; descripcion: string;
  categoriaId: string | null; esPorClasificar: boolean; cuentaId: string; fechaLocal: string; horaLocal: string;
  companeroId: string | null; porcentajePropio: number;
}

export function FormEditar({ t, categorias, cuentas, companeros, hoy }: { t: Transaccion; categorias: Categoria[]; cuentas: Cuenta[]; companeros: Companero[]; hoy: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const montoInicial = String(t.monto).replace(".", ",");
  const [tipo, setTipo] = useState(t.tipo);
  const [monto, setMonto] = useState(montoInicial);
  const [moneda, setMoneda] = useState(t.moneda);
  const [comercio, setComercio] = useState(t.descripcion);
  const [categoriaId, setCategoriaId] = useState(""); // "" = sin cambiar
  const [fecha, setFecha] = useState(t.fechaLocal);
  const [hora, setHora] = useState(t.horaLocal);
  const [cuentaId, setCuentaId] = useState(t.cuentaId);
  const [companeroId, setCompaneroId] = useState(t.companeroId ?? "");
  const [porcentaje, setPorcentaje] = useState(t.companeroId ? t.porcentajePropio : 50);
  const [estado, setEstado] = useState<"idle" | "guardando" | "error" | "sin-cambios">("idle");
  const [mensaje, setMensaje] = useState("");

  const opciones = categorias.filter((c) => c.tipo === tipo);
  const categoriaActual = t.esPorClasificar || !t.categoriaId ? "Por clasificar" : (categorias.find((c) => c.id === t.categoriaId)?.nombre ?? "—");

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    // Solo se envía lo que cambió
    const cambios: Record<string, unknown> = {};
    if (monto.trim() !== montoInicial) cambios.monto = monto.trim();
    if (moneda !== t.moneda) cambios.moneda = moneda;
    if (comercio.trim() !== t.descripcion) cambios.comercio = comercio.trim();
    if (tipo !== t.tipo) cambios.tipo = tipo;
    if (cuentaId !== t.cuentaId) cambios.cuenta_id = cuentaId;
    if (fecha !== t.fechaLocal) cambios.fecha = fecha;
    if (hora !== t.horaLocal) cambios.hora = hora;
    if (categoriaId) cambios.categoria_id = categoriaId;
    if (tipo === "egreso" && (companeroId !== (t.companeroId ?? "") || (companeroId && porcentaje !== t.porcentajePropio))) {
      cambios.companero_id = companeroId || null;
      if (companeroId) cambios.porcentaje_propio = porcentaje;
    }
    if (Object.keys(cambios).length === 0) {
      setEstado("sin-cambios");
      setMensaje("No hay cambios que guardar");
      return;
    }

    setEstado("guardando");
    setMensaje("");
    try {
      const res = await fetch(`/api/v1/transactions/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambios) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.mensaje ?? `Error ${res.status}`);
      startTransition(() => {
        router.push(`/meses/${fecha.slice(0, 7)}`);
        router.refresh();
      });
    } catch (err) {
      setEstado("error");
      setMensaje(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  const input = "h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-base focus:border-slate-900 focus:outline-none";
  const label = "mb-1 block text-xs font-medium text-slate-600";
  const ocupado = estado === "guardando" || pending;

  return (
    <form onSubmit={guardar} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Tipo">
        {(["egreso", "ingreso"] as const).map((x) => (
          <button key={x} type="button" role="radio" aria-checked={tipo === x} onClick={() => { setTipo(x); setCategoriaId(""); if (x === "ingreso") setCompaneroId(""); }}
            className={`h-11 rounded-lg text-sm font-medium transition ${tipo === x ? (x === "egreso" ? "bg-red-600 text-white" : "bg-emerald-600 text-white") : "text-slate-600"}`}>
            {x === "egreso" ? "Gasto" : "Ingreso"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <div>
          <label className={label} htmlFor="e-monto">Importe</label>
          <input id="e-monto" inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} className={`${input} text-2xl font-semibold tabular-nums`} />
        </div>
        <div>
          <label className={label} htmlFor="e-moneda">Moneda</label>
          <select id="e-moneda" value={moneda} onChange={(e) => setMoneda(e.target.value)} className={input}>
            {MONEDAS_SOPORTADAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={label} htmlFor="e-comercio">{tipo === "egreso" ? "Comercio o concepto" : "Origen o concepto"}</label>
        <input id="e-comercio" required maxLength={200} value={comercio} onChange={(e) => setComercio(e.target.value)} className={input} />
      </div>

      <div>
        <label className={label} htmlFor="e-categoria">Categoría <span className="font-normal text-slate-400">(ahora: {tipo === t.tipo ? categoriaActual : "se elegirá sola"})</span></label>
        <select id="e-categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={input}>
          <option value="">{tipo === t.tipo ? "Sin cambiar" : "Automática (según el comercio)"}</option>
          {opciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label} htmlFor="e-fecha">Fecha</label>
          <input id="e-fecha" type="date" required value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="e-hora">Hora</label>
          <input id="e-hora" type="time" required value={hora} onChange={(e) => setHora(e.target.value)} className={input} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="e-cuenta">Cuenta</label>
        <select id="e-cuenta" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className={input}>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.moneda}</option>)}
        </select>
        {(cuentaId !== t.cuentaId || moneda !== t.moneda || tipo !== t.tipo || monto.trim() !== montoInicial || fecha !== t.fechaLocal) && (
          <p className="mt-1 text-xs text-slate-500">El saldo de las cuentas se recalcula solo con estos cambios.</p>
        )}
      </div>

      {tipo === "egreso" && companeros.length > 0 && (
        <div>
          <span className={label} id="e-dividir-lbl">Dividir con</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="e-dividir-lbl">
            {[{ id: "", nombre: "Solo yo" }, ...companeros].map((c) => (
              <button key={c.id || "yo"} type="button" role="radio" aria-checked={companeroId === c.id} onClick={() => setCompaneroId(c.id)}
                className={`h-11 rounded-full px-4 text-sm font-medium transition ${companeroId === c.id ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-800 active:bg-slate-200"}`}>
                {c.id ? `Con ${c.nombre}` : c.nombre}
              </button>
            ))}
          </div>
          {companeroId && (
            <label className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-sky-50 p-3 text-sm">
              Tu parte
              <select value={porcentaje} onChange={(e) => setPorcentaje(Number(e.target.value))} className="h-10 rounded-lg border border-slate-300 bg-white px-2">
                {[...new Set([porcentaje, 75, 70, 60, 50, 40, 30, 25])].sort((a, b) => b - a).map((p) => <option key={p} value={p}>{p} %</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button type="submit" disabled={ocupado} className="h-12 rounded-xl bg-slate-900 text-base font-medium text-white active:bg-slate-700 disabled:opacity-60">
          {ocupado ? "Guardando…" : "Guardar cambios"}
        </button>
        <Link href={`/meses/${t.fechaLocal.slice(0, 7)}`} className="grid h-12 place-items-center rounded-xl border border-slate-300 bg-white px-5 text-base font-medium text-slate-700 active:bg-slate-100">Cancelar</Link>
      </div>

      <p className="min-h-5 text-center text-sm" aria-live="polite">
        {estado === "error" && <span className="text-red-600">{mensaje}</span>}
        {estado === "sin-cambios" && <span className="text-slate-500">{mensaje}</span>}
      </p>
    </form>
  );
}
