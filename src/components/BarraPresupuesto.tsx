// src/components/BarraPresupuesto.tsx
import { formatoMoneda } from "@/lib/queries";

interface Props { nombre: string; gastado: number; presupuesto: number; moneda: string }

export function BarraPresupuesto({ nombre, gastado, presupuesto, moneda }: Props) {
  const pct = presupuesto > 0 ? (gastado / presupuesto) * 100 : 0;
  const ancho = Math.min(pct, 100);
  const color = pct >= 100 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <li>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{nombre}</span>
        <span className="tabular-nums text-slate-600">
          {formatoMoneda(gastado, moneda)} <span className="text-slate-400">/ {formatoMoneda(presupuesto, moneda)}</span>
        </span>
      </div>
      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${nombre}: ${Math.round(pct)} % del presupuesto`}>
        <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${ancho}%` }} />
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{Math.round(pct)} %{pct > 100 ? ` · excedido por ${formatoMoneda(gastado - presupuesto, moneda)}` : ""}</p>
    </li>
  );
}
