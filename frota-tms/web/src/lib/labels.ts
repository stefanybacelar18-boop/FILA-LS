import type {
  AllowedVehicleType,
  PlateColor,
  PriorityColor,
  Role,
  RouteStatus,
  TripStatus,
  VehicleStatus,
  VehicleType,
} from '../types'

export const roleLabels: Record<Role, string> = {
  ADMIN: 'Administrador',
  OPERACAO: 'Operação',
  CONSULTA: 'Consulta',
}

export const vehicleTypeLabels: Record<VehicleType, string> = {
  TRUCK: 'Truck',
  CARRETA: 'Carreta',
}

export const allowedVehicleLabels: Record<AllowedVehicleType, string> = {
  TRUCK: 'Truck',
  CARRETA: 'Carreta',
  AMBOS: 'Ambos',
}

export const vehicleStatusLabels: Record<VehicleStatus, string> = {
  DISPONIVEL: 'Disponível',
  EM_VIAGEM: 'Em viagem',
  EM_CARREGAMENTO: 'Em carregamento',
  EM_MANUTENCAO: 'Em manutenção',
  BLOQUEADO: 'Bloqueado',
}

export const vehicleBlockCategoryLabels: Record<string, string> = {
  MANUTENCAO: 'Manutenção',
  OUTRO: 'Outro motivo',
}

export const routeStatusLabels: Record<RouteStatus, string> = {
  RASCUNHO: 'Montando',
  AGUARDANDO_PLACAS: 'Com Operação',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
}

export const tripStatusLabels: Record<TripStatus, string> = {
  EM_ANDAMENTO: 'Em andamento',
  RETORNOU: 'Retornou',
  ATRASADO: 'Atrasado',
  CANCELADO: 'Cancelado',
}

export const plateColorLabels: Record<PlateColor, string> = {
  green: 'Disponível',
  yellow: 'Carregamento',
  blue: 'Retorna hoje',
  orange: 'Retorna amanhã',
  red: 'Em viagem / atraso',
  black: 'Manutenção',
}

export const priorityColorLabels: Record<PriorityColor, string> = {
  green: 'OK',
  yellow: '≤ 30 dias',
  orange: '≤ 15 dias',
  red: '≤ 7 dias',
  expired: 'Vencido',
}

export const searchTypeLabels: Record<string, string> = {
  placa: 'Placa',
  concessionaria: 'Concessionária',
  produto: 'Produto',
  motorista: 'Motorista',
  roteiro: 'Roteiro',
}

/** Motivos comuns para a empresa terceira justificar atraso / indisponibilidade */
export const delayReasonPresets = [
  'Quebra mecânica / manutenção na estrada',
  'Acidente ou pane',
  'Estrada interditada / condições climáticas',
  'Atraso na descarga na concessionária',
  'Aguardando autorização / documentação',
  'Motorista indisponível',
  'Outro (descrever abaixo)',
] as const

