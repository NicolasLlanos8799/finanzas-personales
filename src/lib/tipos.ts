// src/lib/tipos.ts — tipos compartidos entre servidor y componentes de cliente (sin dependencias de servidor)

/** Un movimiento tal como lo necesita la ventana de detalle y acciones. */
export interface Movimiento {
  id: string;
  descripcion: string;
  tipo: "ingreso" | "egreso";
  categoria: string | null;
  categoriaId: string | null;
  esPorClasificar: boolean;
  monto: number;                  // en su moneda original
  moneda: string;
  montoPrincipal: number | null;  // total convertido a la moneda principal
  montoPropio: number | null;     // tu parte convertida (igual al total si no se divide)
  companero: string | null;
  companeroId: string | null;
  porcentajePropio: number;
  saldada: boolean;
  fechaLocal: string;             // YYYY-MM-DD en la zona del usuario
  horaLocal: string;              // HH:MM en la zona del usuario
  cuenta: string;
  origen: string;                 // Webhook_iOS | Manual_Web | Importacion
}
