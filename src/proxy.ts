// src/proxy.ts — protege la web con sesión por cookie (90 días, renovable).
// El webhook del iPhone (/api/v1/transactions/auto) queda fuera: usa su propio Bearer.
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, crearToken, opcionesCookie, usuarioDeToken } from "@/lib/sesion";

const PUBLICAS = new Set(["/login", "/registro", "/api/login", "/api/registro", "/api/logout"]);

export function proxy(req: NextRequest) {
  const secreto = process.env.SESSION_SECRET;
  const desarrollo = process.env.NODE_ENV !== "production";
  if (!secreto) {
    if (desarrollo) return NextResponse.next();
    return new NextResponse("SESSION_SECRET no configurada", { status: 503 });
  }

  const { pathname, search } = req.nextUrl;
  const publica = PUBLICAS.has(pathname);
  const usuarioId = usuarioDeToken(req.cookies.get(COOKIE)?.value, secreto);

  if (usuarioId) {
    // Con sesión, el formulario de acceso no tiene sentido: al inicio
    if (pathname === "/login" || pathname === "/registro") return NextResponse.redirect(new URL("/", req.nextUrl));
    if (publica) return NextResponse.next();
    const res = NextResponse.next();
    res.cookies.set(COOKIE, crearToken(usuarioId, secreto), opcionesCookie()); // renueva 90 días
    return res;
  }

  if (publica) return NextResponse.next();
  if (desarrollo && process.env.APP_USUARIO_ID) return NextResponse.next(); // comodidad local

  if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, codigo: "NO_AUTORIZADO" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api/v1/transactions/auto|atajos/|_next/static|_next/image|favicon.ico).*)"],
};
