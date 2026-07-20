/** Shared domain constants (SQLite stores these as strings) */

export const Role = {
  ADMIN: 'ADMIN',
  OPERACAO: 'OPERACAO',
  CONSULTA: 'CONSULTA',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const VehicleType = {
  TRUCK: 'TRUCK',
  CARRETA: 'CARRETA',
} as const;
export type VehicleType = (typeof VehicleType)[keyof typeof VehicleType];

export const VehicleStatus = {
  DISPONIVEL: 'DISPONIVEL',
  EM_VIAGEM: 'EM_VIAGEM',
  EM_CARREGAMENTO: 'EM_CARREGAMENTO',
  EM_MANUTENCAO: 'EM_MANUTENCAO',
  BLOQUEADO: 'BLOQUEADO',
} as const;
export type VehicleStatus = (typeof VehicleStatus)[keyof typeof VehicleStatus];

export const AllowedVehicleType = {
  TRUCK: 'TRUCK',
  CARRETA: 'CARRETA',
  AMBOS: 'AMBOS',
} as const;
export type AllowedVehicleType = (typeof AllowedVehicleType)[keyof typeof AllowedVehicleType];

export const RouteStatus = {
  RASCUNHO: 'RASCUNHO',
  AGUARDANDO_PLACAS: 'AGUARDANDO_PLACAS',
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  CONCLUIDO: 'CONCLUIDO',
  CANCELADO: 'CANCELADO',
} as const;
export type RouteStatus = (typeof RouteStatus)[keyof typeof RouteStatus];

export const TripStatus = {
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  RETORNOU: 'RETORNOU',
  ATRASADO: 'ATRASADO',
  CANCELADO: 'CANCELADO',
} as const;
export type TripStatus = (typeof TripStatus)[keyof typeof TripStatus];
