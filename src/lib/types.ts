export type UserRole = "motorista" | "empilhador" | "administrador";

/** Papéis legados no banco — tratados como empilhador no app */
export type LegacyStaffRole = "operador" | "supervisor";

export function toAppRole(role: string): UserRole {
  if (role === "administrador") return "administrador";
  if (role === "empilhador" || role === "operador" || role === "supervisor") return "empilhador";
  return "motorista";
}

export type QueueStatus =
  | "aguardando_descarregamento"
  | "ausente"
  | "finalizado";

export type TipoVeiculo = "convencional" | "bitrem";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  cpf: string | null;
  telefone: string | null;
  checkin_liberado: boolean;
  device_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface GeofenceConfig {
  lat: number;
  lng: number;
  radius_meters: number;
  name: string;
}

export interface OperacionalConfig {
  checkin_cooldown_dias: number;
  mensagem_fora_patio: string;
}

export interface QueueEntry {
  id: string;
  token: string;
  driver_user_id: string | null;
  minuta: string | null;
  nome: string;
  cpf: string | null;
  telefone: string;
  placa: string;
  placa_cavalo: string | null;
  placa_carreta: string | null;
  placa_segunda_carreta: string | null;
  tipo_veiculo: TipoVeiculo | null;
  transportadora: string;
  empresa: string;
  tipo_carga: string;
  retorno_racks_vazios: boolean | null;
  observacoes: string | null;
  status: QueueStatus;
  prioridade?: boolean;
  doca: string | null;
  previsao_descarregamento: string | null;
  posicao_fila: number | null;
  checkin_lat: number | null;
  checkin_lng: number | null;
  device_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  called_at: string | null;
  started_unload_at: string | null;
  finished_at: string | null;
  closed_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** Metadados importados (Excel) — preenchidos em runtime */
  volume_motos?: number | null;
  menor_vencimento?: string | null;
  prioridade_automatica?: boolean;
  /** Admin dispensou prioridade automática (NF vence amanhã) — volta à ordem de check-in. */
  prioridade_automatica_dispensada?: boolean;
  previsao_automatica?: boolean;
  ultrapassa_capacidade?: boolean;
  empurrada_por_capacidade?: boolean;
  motos_com_espaco?: number;
  capacidade_aviso?: string | null;
}

export interface QueueHistory {
  id: string;
  queue_entry_id: string;
  old_status: QueueStatus | null;
  new_status: QueueStatus;
  changed_by: string | null;
  changed_by_name: string | null;
  notes: string | null;
  doca: string | null;
  previsao_descarregamento: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface CheckInFormData {
  minuta: string;
  nome: string;
  telefone: string;
  transportadora: string;
  tipo_veiculo: TipoVeiculo;
  placa_cavalo: string;
  placa_carreta: string;
  placa_segunda_carreta?: string;
  retorno_racks_vazios: boolean;
  empresa: string;
  tipo_carga: string;
  observacoes?: string;
  checkin_lat: number;
  checkin_lng: number;
  device_id: string;
  user_agent: string;
}

export interface DashboardStats {
  veiculosHoje: number;
  tempoMedioEsperaMin: number;
  tempoMedioDescargaMin: number;
  veiculosFinalizados: number;
  veiculosAusentes: number;
  veiculosAguardando: number;
  veiculosEmDescarga: number;
  retornoRacksSim: number;
  rankingTransportadoras: { transportadora: string; total: number }[];
}

export interface QueueEntryWithAhead extends QueueEntry {
  veiculosAFrente: number;
}
