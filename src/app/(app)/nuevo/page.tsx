// src/app/nuevo/page.tsx — alta manual de gasto o ingreso
import { obtenerAjustes, obtenerCategorias, obtenerCuentas } from "@/lib/queries";
import { requerirUsuarioId } from "@/lib/usuario";
import { FormNuevo } from "@/components/FormNuevo";

export const dynamic = "force-dynamic";

export default async function Nuevo() {
  const usuarioId = await requerirUsuarioId();
  const [categorias, cuentas, ajustes] = await Promise.all([obtenerCategorias(usuarioId), obtenerCuentas(usuarioId), obtenerAjustes(usuarioId)]);
  const hoy = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: ajustes.zona_horaria }).format(new Date());
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Nuevo movimiento</h1>
        <p className="text-sm text-slate-500">La fecha de hoy y la categoría se rellenan solas; cámbialas si hace falta.</p>
      </header>
      <FormNuevo categorias={categorias} cuentas={cuentas} hoy={hoy} />
    </div>
  );
}
