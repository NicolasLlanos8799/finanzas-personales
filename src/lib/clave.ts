// src/lib/clave.ts — hash de contraseñas con scrypt (incluido en Node, sin dependencias)
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

type Scrypt = (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;
const scrypt = promisify(scryptCb) as unknown as Scrypt;

const N = 16384, R = 8, P = 1, LEN = 64;
const SAL_FALSA = Buffer.alloc(16, 7);

export async function hashClave(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const h = await scrypt(clave, sal, LEN, { N, r: R, p: P });
  return `scrypt:${N}:${R}:${P}:${sal.toString("hex")}:${h.toString("hex")}`;
}

/** Con un hash inexistente hace el mismo trabajo igualmente: no delata qué correos están registrados. */
export async function verificarClave(clave: string, almacenado: string | null | undefined): Promise<boolean> {
  if (!almacenado) {
    await scrypt(clave, SAL_FALSA, LEN, { N, r: R, p: P });
    return false;
  }
  const [alg, n, r, p, salHex, hashHex] = almacenado.split(":");
  if (alg !== "scrypt" || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const calculado = await scrypt(clave, Buffer.from(salHex, "hex"), esperado.length, { N: Number(n), r: Number(r), p: Number(p) });
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}
