/** Intervalo de atualização dos painéis públicos (sem Supabase Realtime). */
export const PUBLIC_QUEUE_POLL_MS = 5_000;

/** TV — mesmo critério da fila pública. */
export const TV_QUEUE_POLL_MS = 5_000;

/** Motorista — backup quando Realtime desconectado. */
export const MOTORISTA_QUEUE_POLL_MS = 8_000;

/** Motorista — poll de segurança quando Realtime conectado. */
export const MOTORISTA_QUEUE_POLL_CONNECTED_MS = 60_000;

/** Debounce após evento Realtime antes de refetch. */
export const QUEUE_REALTIME_DEBOUNCE_MS = 500;
