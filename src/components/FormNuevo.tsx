// src/components/FormNuevo.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MONEDAS_SOPORTADAS } from "@/lib/parseo";

interface Categoria { id: string; nombre: string; tipo: "ingreso" | "egreso" }
interface Cuenta { id: string; nombre: string; moneda: string }
interface Companero { id: string; nombre: string }

export function FormNuevo({ categorias, cuentas, companeros, hoy }: { categorias: Categoria[]; cuentas: Cuenta[]; companeros: Companero[]; hoy: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tipo, setTipo] = useState<"egreso" | "ingreso">("egreso");
  const [monto, setMonto] = useState("");
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? "");
  const [moneda, setMoneda] = useState(cuentas[0]?.moneda ?? "EUR");
  const [comercio, setComercio] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [companeroId, setCompaneroId] = useState(""); // "" = solo yo
  const [porcentaje, setPorcentaje] = useState(50);   // tu parte
  const [recordarDivision, setRecordarDivision] = useState(false);
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok" | "error">("idle");
  const [mensaje, setMensaje] = useState("");

  const opciones = categorias.filter((c) => c.tipo === tipo);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("guardando");
    setMensaje("");
    try {
      const res = await fetch("/api/v1/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo, monto, moneda, comercio, categoria_id: categoriaId || null, cuenta_id: cuentaId || undefined, fecha,
          ...(tipo === "egreso" && companeroId ? { companero_id: companeroId, porcentaje_propio: porcentaje, recordar_division: recordarDivision } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.mensaje ?? `Error ${res.status}`);
      setEstado("ok");
      setMensaje(j.mensaje ?? "Guardado");
      setMonto(""); setComercio(""); setCategoriaId(""); setCompaneroId(""); setRecordarDivision(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setEstado("error");
      setMensaje(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  const input = "h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-base focus:border-slate-900 focus:outline-none";
  const label = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Tipo">
        {(["egreso", "ingreso"] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => { setTipo(t); setCategoriaId(""); setCompaneroId(""); }}
            className={`h-11 rounded-lg text-sm font-medium transition ${tipo === t ? (t === "egreso" ? "bg-red-600 text-white" : "bg-emerald-600 text-white") : "text-slate-600"}`}>
            {t === "egreso" ? "Gasto" : "Ingreso"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <div>
          <label className={label} htmlFor="monto">Importe</label>
          <input id="monto" inputMode="decimal" autoFocus required placeholder="0,00" value={monto} onChange={(e) => setMonto(e.target.value)} className={`${input} text-2xl font-semibold tabular-nums`} />
        </div>
        <div>
          <label className={label} htmlFor="moneda">Moneda</label>
          <select id="moneda" value={moneda} onChange={(e) => setMoneda(e.target.value)} className={input}>
            {MONEDAS_SOPORTADAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={label} htmlFor="comercio">{tipo === "egreso" ? "Comercio o concepto" : "Origen o concepto"}</label>
        <input id="comercio" required maxLength={200} placeholder={tipo === "egreso" ? "Netto, Uber, alquiler…" : "Nómina, venta, transferencia…"} value={comercio} onChange={(e) => setComercio(e.target.value)} className={input} />
      </div>

      <div>
        <label className={label} htmlFor="categoria">Categoría</label>
        <select id="categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={input}>
          <option value="">Automática (según el comercio)</option>
          {opciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {tipo === "egreso" && (
        <div>
          <span className={label} id="dividir-lbl">Dividir con</span>
          {companeros.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">¿Compartes gastos con alguien? Guárdalo en <a href="/ajustes" className="font-medium text-slate-900 underline underline-offset-4">Ajustes</a> y lo eliges aquí con un toque.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="dividir-lbl">
                {[{ id: "", nombre: "Solo yo" }, ...companeros].map((c) => (
                  <button key={c.id || "yo"} type="button" role="radio" aria-checked={companeroId === c.id} onClick={() => setCompaneroId(c.id)}
                    className={`h-11 rounded-full px-4 text-sm font-medium transition ${companeroId === c.id ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-800 active:bg-slate-200"}`}>
                    {c.id ? `Con ${c.nombre}` : c.nombre}
                  </button>
                ))}
              </div>
              {companeroId && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sky-50 p-3 text-sm">
                  <label className="flex items-center gap-2">
                    Tu parte
                    <select value={porcentaje} onChange={(e) => setPorcentaje(Number(e.target.value))} className="h-10 rounded-lg border border-slate-300 bg-white px-2">
                      {[75, 70, 60, 50, 40, 30, 25].map((p) => <option key={p} value={p}>{p} %</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={recordarDivision} onChange={(e) => setRecordarDivision(e.target.checked)} className="size-4" />
                    Siempre dividir este comercio
                  </label>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label} htmlFor="fecha">Fecha</label>
          <input id="fecha" type="date" required value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="cuenta">Cuenta</label>
          <select id="cuenta" value={cuentaId} onChange={(e) => { setCuentaId(e.target.value); const c = cuentas.find((x) => x.id === e.target.value); if (c) setMoneda(c.moneda); }} className={input}>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      <button type="submit" disabled={estado === "guardando" || pending} className={`h-12 w-full rounded-xl text-base font-medium text-white disabled:opacity-60 ${tipo === "egreso" ? "bg-red-600 active:bg-red-700" : "bg-emerald-600 active:bg-emerald-700"}`}>
        {estado === "guardando" ? "Guardando…" : tipo === "egreso" ? "Registrar gasto" : "Registrar ingreso"}
      </button>

      <p className="min-h-5 text-center text-sm" aria-live="polite">
        {estado === "ok" && <span className="text-emerald-700">{mensaje}</span>}
        {estado === "error" && <span className="text-red-600">{mensaje}</span>}
      </p>
    </form>
  );
}
