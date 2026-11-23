// src/components/FormAjustes.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MONEDAS_SOPORTADAS } from "@/lib/parseo";

const NOMBRES: Record<string, string> = {
  DKK: "Corona danesa", EUR: "Euro", CHF: "Franco suizo", ARS: "Peso argentino", USD: "Dólar estadounidense", MXN: "Peso mexicano",
  GBP: "Libra esterlina", SEK: "Corona sueca", NOK: "Corona noruega", COP: "Peso colombiano", CLP: "Peso chileno", PEN: "Sol peruano",
  BRL: "Real brasileño", UYU: "Peso uruguayo", CAD: "Dólar canadiense", AUD: "Dólar australiano", JPY: "Yen", PLN: "Zloty", CZK: "Corona checa", HUF: "Florín húngaro",
};

function Select({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-base focus:border-slate-900 focus:outline-none">
      {MONEDAS_SOPORTADAS.map((m) => (
        <option key={m} value={m}>{m} · {NOMBRES[m] ?? m}</option>
      ))}
    </select>
  );
}

interface Cuenta { id: string; nombre_cuenta: string; moneda: string; saldo_actual: number }

const ZONAS = ["Europe/Copenhagen", "Europe/Madrid", "Europe/Zurich", "America/Argentina/Buenos_Aires", "America/Mexico_City", "America/Bogota", "America/Santiago", "America/Lima", "America/New_York", "Europe/Berlin", "Europe/London", "UTC"];

export function FormAjustes({ monedaPrincipal, zonaHoraria, cuentas }: { monedaPrincipal: string; zonaHoraria: string; cuentas: Cuenta[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [principal, setPrincipal] = useState(monedaPrincipal);
  const [zona, setZona] = useState(zonaHoraria);
  const [monedas, setMonedas] = useState<Record<string, string>>(Object.fromEntries(cuentas.map((c) => [c.id, c.moneda])));
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok" | "error">("idle");

  async function guardar() {
    setEstado("guardando");
    try {
      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moneda_principal: principal, zona_horaria: zona, cuentas: cuentas.map((c) => ({ id: c.id, moneda: monedas[c.id] })) }),
      });
      if (!res.ok) throw new Error();
      setEstado("ok");
      startTransition(() => router.refresh());
    } catch {
      setEstado("error");
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <label className="block text-sm font-semibold">Moneda de visualización</label>
        <p className="mb-2 text-xs text-slate-500">Saldo total, gasto diario y presupuestos se muestran en esta moneda.</p>
        <Select value={principal} onChange={setPrincipal} />
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <label className="block text-sm font-semibold" htmlFor="zona">Zona horaria</label>
        <p className="mb-2 text-xs text-slate-500">Define qué día y qué mes le corresponde a cada movimiento.</p>
        <select id="zona" value={zona} onChange={(e) => setZona(e.target.value)} className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-base focus:border-slate-900 focus:outline-none">
          {[...new Set([zonaHoraria, ...ZONAS])].map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-semibold">Moneda de cada cuenta</h2>
        <p className="mb-2 text-xs text-slate-500">Es la moneda en la que el banco lleva el saldo. Si una notificación no menciona moneda, se asume esta.</p>
        <ul className="space-y-3">
          {cuentas.map((c) => (
            <li key={c.id}>
              <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{c.nombre_cuenta}</span><span className="tabular-nums text-slate-500">{c.saldo_actual.toFixed(2)} {monedas[c.id]}</span></div>
              <Select value={monedas[c.id]} onChange={(v) => setMonedas((m) => ({ ...m, [c.id]: v }))} />
            </li>
          ))}
        </ul>
      </section>

      <button onClick={guardar} disabled={estado === "guardando" || pending} className="h-12 w-full rounded-xl bg-slate-900 text-base font-medium text-white active:bg-slate-700 disabled:opacity-60">
        {estado === "guardando" ? "Guardando…" : "Guardar"}
      </button>
      <p className="h-4 text-center text-xs" aria-live="polite">
        {estado === "ok" && <span className="text-emerald-600">Guardado</span>}
        {estado === "error" && <span className="text-red-600">No se pudo guardar</span>}
      </p>
    </div>
  );
}
