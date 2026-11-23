// src/app/api/v1/settings/route.ts — ajustes de la cuenta: monedas, zona, presupuestos, clave y API key
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { usuarioIdActual } from "@/lib/usuario";
import { MONEDAS_SOPORTADAS } from "@/lib/parseo";
import { hashClave, verificarClave } from "@/lib/clave";
import { nuevaApiKey } from "@/lib/altas";

export const runtime = "nodejs";

const Schema = z.object({
  moneda_principal: z.enum(MONEDAS_SOPORTADAS).optional(),
  zona_horaria: z.string().regex(/^[A-Za-z_]+(\/[A-Za-z_+-]+){0,2}$/).optional(),
  cuentas: z.array(z.object({ id: z.uuid(), moneda: z.enum(MONEDAS_SOPORTADAS) })).optional(),
  presupuestos: z.array(z.object({ id: z.uuid(), monto: z.number().min(0).max(1_000_000_000) })).optional(),
  regenerar_api_key: z.boolean().optional(),
  clave: z.object({ actual: z.string().max(200), nueva: z.string().min(6).max(200) }).optional(),
});

export async function PATCH(req: NextRequest) {
  const usuarioId = await usuarioIdActual();
  if (!usuarioId) return NextResponse.json({ ok: false, codigo: "NO_AUTORIZADO" }, { status: 401 });

  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: "Datos inválidos", detalle: err instanceof z.ZodError ? z.flattenError(err).fieldErrors : undefined }, { status: 400 });
  }

  try {
    await withTransaction(async (client) => {
      if (body.clave) {
        const r = await client.query<{ password_hash: string | null }>(`SELECT password_hash FROM usuarios WHERE id = $1`, [usuarioId]);
        if (!(await verificarClave(body.clave.actual, r.rows[0]?.password_hash))) {
          throw Object.assign(new Error("CLAVE_ACTUAL_INCORRECTA"), { status: 403 });
        }
        await client.query(`UPDATE usuarios SET password_hash = $1 WHERE id = $2`, [await hashClave(body.clave.nueva), usuarioId]);
      }
      if (body.moneda_principal) await client.query(`UPDATE usuarios SET moneda_principal = $1 WHERE id = $2`, [body.moneda_principal, usuarioId]);
      if (body.zona_horaria) {
        const ok = await client.query(`SELECT 1 FROM pg_timezone_names WHERE name = $1`, [body.zona_horaria]);
        if (!ok.rowCount) throw Object.assign(new Error("ZONA_INVALIDA"), { status: 400 });
        await client.query(`UPDATE usuarios SET zona_horaria = $1 WHERE id = $2`, [body.zona_horaria, usuarioId]);
      }
      for (const c of body.cuentas ?? []) {
        await client.query(`UPDATE cuentas_bancarias SET moneda = $1 WHERE id = $2 AND usuario_id = $3`, [c.moneda, c.id, usuarioId]);
      }
      for (const p of body.presupuestos ?? []) {
        await client.query(
          `UPDATE categorias SET presupuesto_mensual = $1 WHERE id = $2 AND usuario_id = $3 AND tipo = 'egreso' AND NOT es_por_clasificar`,
          [p.monto.toFixed(2), p.id, usuarioId],
        );
      }
      if (body.regenerar_api_key) {
        await client.query(`UPDATE usuarios SET api_key_celular = $1, ultimo_webhook = NULL, ultimo_webhook_resultado = NULL WHERE id = $2`, [nuevaApiKey(), usuarioId]);
      }
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const codigo = err instanceof Error ? err.message : "ERROR_INTERNO";
    return NextResponse.json({ ok: false, codigo, mensaje: codigo === "CLAVE_ACTUAL_INCORRECTA" ? "La contraseña actual no es correcta" : "No se pudo guardar" }, { status });
  }
}
