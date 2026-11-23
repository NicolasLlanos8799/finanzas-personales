// src/app/(app)/layout.tsx — marco de la aplicación (con la barra inferior)
import type { ReactNode } from "react";
import { NavInferior } from "@/components/NavInferior";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md px-4 pb-32 pt-[max(1rem,env(safe-area-inset-top))]">{children}</main>
      <NavInferior />
    </>
  );
}
