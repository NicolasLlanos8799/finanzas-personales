// src/app/clasificar/page.tsx
import { obtenerCategorias, obtenerPendientes, formatoMoneda } from "@/lib/queries";
import { requerirUsuarioId } from "@/lib/usuario";
import { FilaClasificar } from "@/components/FilaClasificar";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Clasificar() {
  const usuarioId = await requerirUsuarioId();
  const [pendientes, categorias, monedaRes] = await Promise.all([
    obtenerPendientes(usuarioId),
    obtenerCategorias(usuarioId),
    pool.query<{ moneda_principal: string }>(`SELECT moneda_principal FROM usuarios WHERE id = $1`, [usuarioId]),
  ]);
  const moneda = monedaRes.rows[0]?.moneda_principal ?? "MXN";

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Por clasificar</h1>
        <p className="text-sm text-slate-500">{pendientes.length} movimiento{pendientes.length === 1 ? "" : "s"} sin categoría</p>
      </header>

      {pendientes.length === 0 ? (
        <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">Todo clasificado. Nada pendiente.</p>
      ) : (
        <ul className="space-y-2">
          {pendientes.map((t) => (
            <FilaClasificar
              key={t.id}
              transaccion={{ ...t, montoTexto: formatoMoneda(t.monto, t.moneda), montoPrincipalTexto: t.moneda !== moneda ? formatoMoneda(t.montoPrincipal, moneda) : null }}
              categorias={categorias.filter((c) => c.tipo === t.tipo)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
