// src/app/(auth)/layout.tsx — marco de las pantallas de acceso y registro
import type { ReactNode } from "react";
import type { Viewport } from "next";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0f2a22" };

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lineas-libro relative isolate flex min-h-dvh flex-col overflow-hidden bg-tinta font-body text-papel">
      <div aria-hidden className="grano-capa" />
      <div aria-hidden className="respirar pointer-events-none absolute -right-28 -top-28 -z-10 size-[26rem] rounded-full bg-laton/25 blur-3xl [animation:respirar_8s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-28 -z-10 size-[26rem] rounded-full bg-[#1f5a45]/45 blur-3xl" />
      {children}
    </div>
  );
}
