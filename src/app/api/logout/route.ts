// src/app/api/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { COOKIE } from "@/lib/sesion";

export const runtime = "nodejs";

export function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.nextUrl), 303);
  res.cookies.delete(COOKIE);
  return res;
}
