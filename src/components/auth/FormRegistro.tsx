// src/components/auth/FormRegistro.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Aviso, Boton, Campo, CampoClave, INPUT } from "@/components/auth/piezas";
import { monedaDeZona } from "@/lib/zonas";

const MENSAJES: Record<string, string> = {
  nombre: "Elige un nombre de 2 a 40 caracteres: letras, números y espacios.",
  clave: "La contraseña necesita al menos 6 caracteres.",
  nombre_usado: "Ese nombre ya está en uso. Prueba con otro.",
  error: "No se pudo crear la cuenta. Inténtalo de nuevo.",
};

export function FormRegistro({ k, error, nombre }: { k?: string; error?: string; nombre?: string }) {
  const [enviando, setEnviando] = useState(false);
  const zonaRef = useRef<HTMLInputElement>(null);
  const monedaRef = useRef<HTMLInputElement>(null);

  // La zona horaria y la moneda se deducen del navegador; se pueden cambiar luego en Ajustes.
  useEffect(() => {
    try {
      const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zona && zonaRef.current && monedaRef.current) {
        zonaRef.current.value = zona;
        monedaRef.current.value = monedaDeZona(zona);
      }
    } catch {
      /* se queda con los valores por defecto */
    }
  }, []);

  return (
    <form method="post" action="/api/registro" onSubmit={() => setEnviando(true)} className="space-y-6">
      <input type="hidden" name="k" value={k ?? ""} />
      <input ref={zonaRef} type="hidden" name="zona" defaultValue="UTC" />
      <input ref={monedaRef} type="hidden" name="moneda" defaultValue="EUR" />
      {/* Campo trampa: las personas no lo ven; los bots suelen rellenarlo */}
      <input type="text" name="web" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      {error && MENSAJES[error] && <Aviso>{MENSAJES[error]}</Aviso>}
      <Campo etiqueta="Tu nombre" indice={0} ayuda="Es también tu usuario para entrar.">
        <input name="nombre" defaultValue={nombre} required minLength={2} maxLength={40} autoFocus autoComplete="username" autoCapitalize="words" spellCheck={false} className={INPUT} />
      </Campo>
      <Campo etiqueta="Contraseña" indice={1} ayuda="Mínimo 6 caracteres.">
        <CampoClave name="password" autoComplete="new-password" minLength={6} />
      </Campo>
      <Boton enviando={enviando} indice={4}>Crear mi cuenta</Boton>
    </form>
  );
}
