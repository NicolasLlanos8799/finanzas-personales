// src/components/auth/FormLogin.tsx
"use client";

import { useState } from "react";
import { Aviso, Boton, Campo, CampoClave, INPUT } from "@/components/auth/piezas";

export function FormLogin({ next, error, nombre }: { next?: string; error?: boolean; nombre?: string }) {
  const [enviando, setEnviando] = useState(false);
  return (
    <form method="post" action="/api/login" onSubmit={() => setEnviando(true)} className="space-y-6">
      <input type="hidden" name="next" value={next ?? ""} />
      {error && <Aviso>El nombre o la contraseña no coinciden.</Aviso>}
      <Campo etiqueta="Nombre" indice={0}>
        <input name="nombre" defaultValue={nombre} required autoFocus={!nombre} autoComplete="username" autoCapitalize="words" spellCheck={false} className={INPUT} />
      </Campo>
      <Campo etiqueta="Contraseña" indice={1}>
        <CampoClave name="password" autoComplete="current-password" />
      </Campo>
      <Boton enviando={enviando} indice={4}>Entrar</Boton>
    </form>
  );
}
