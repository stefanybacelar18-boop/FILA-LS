export type Role = 'ADMIN' | 'OPERACAO' | 'CONSULTA'

export type VehicleType = 'TRUCK' | 'CARRETA'

export type VehicleStatus =
  | 'DISPONIVEL'
  | 'EM_VIAGEM'
  | 'EM_CARREGAMENTO'
  | 'EM_MANUTENCAO'
  | 'BLOQUEADO'

export type AllowedVehicleType = 'TRUCK' | 'CARRETA' | 'AMBOS'

export type RouteStatus =
  | 'RASCUNHO'
  | 'AGUARDANDO_PLACAS'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDO'
  | 'CANCELADO'

export type TripStatus = 'EM_ANDAMENTO' | 'RETORNOU' | 'ATRASADO' | 'CANCELADO'

export type PlateColor = 'green' | 'yellow' | 'blue' | 'orange' | 'red' | 'black'

export type PriorityColor = 'green' | 'yellow' | 'orange' | 'red' | 'expired'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  active?: boolean
  createdAt?: string
}

export interface Vehicle {
  id: string
  plate: string
  type: VehicleType
  model: string
  brand: string
  year: number
  capacityMotos: number
  defaultDriver: string | null
  status: VehicleStatus
  notes: string | null
  createdAt: string
  updatedAt: string
  color: PlateColor
  expectedReturn: string | null
  activeTripId: string | null
}

export interface Driver {
  id: string
  name: string
  phone?: string | null
  active: boolean
  blocked?: boolean
  blockReason?: string | null
  blockedAt?: string | null
  notes?: string | null
  createdAt: string
  updatedAt?: string
}

export interface Dealership {
  id: string
  code: string | null
  name: string
  city: string
  state: string
  region: string
  phone: string | null
  distanceKm: number
  avgTravelDays: number
  allowedVehicle: AllowedVehicleType
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface PriorityProduct {
  id: string
  product: string
  code: string
  lot: string
  quantity: number
  expiryDate: string
  notes: string | null
  active: boolean
  createdAt: string
  updatedAt: string
  daysRemaining: number
  color: PriorityColor
  blinking: boolean
}

export interface RouteProduct {
  id: string
  routeId: string
  productId: string
  product: PriorityProduct
}

export interface RouteVehicle {
  id: string
  routeId: string
  vehicleId: string
  assignedAt: string
  vehicle: Vehicle
}

export interface RouteDealership {
  id: string
  order: number
  routeId: string
  dealershipId: string
  dealership: Dealership
}

export interface ReturnForecast {
  basis: 'PAD_DISTANCE'
  pad: { lat: number; lng: number }
  formula?: string
  farthestDealership: {
    id: string
    name: string
    city: string
    distanceKm: number
    avgTravelDays: number
    source: 'coords' | 'city' | 'stored'
  }
  stops?: {
    id: string
    name: string
    city: string
    distanceKm: number
    avgTravelDays: number
    source: 'coords' | 'city' | 'stored'
  }[]
  departureAt: string
  expectedReturn: string
}

export interface Route {
  id: string
  name: string
  date: string
  region: string | null
  notes: string | null
  status: RouteStatus
  hasPriority: boolean
  priorityNotes?: string | null
  priorityExpiryDate?: string | null
  plannedVehicleCount?: number | null
  createdAt: string
  updatedAt: string
  dealershipId: string | null
  dealership: Dealership | null
  dealerships?: RouteDealership[]
  createdById: string
  createdBy: { id: string; name: string }
  vehicles?: RouteVehicle[]
  trips?: Trip[]
  _count?: { trips: number }
  returnForecast?: ReturnForecast | null
}

export interface TripEvidence {
  id: string
  filename: string
  originalName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  uploadedBy?: { name: string }
}

export interface Trip {
  id: string
  driverName: string | null
  departureAt: string
  expectedReturn: string
  returnedAt: string | null
  status: TripStatus
  notes: string | null
  delayReason?: string | null
  delayReportedAt?: string | null
  delayReportedBy?: { id?: string; name: string } | null
  unavailableReason?: string | null
  unavailableAt?: string | null
  createdAt: string
  updatedAt: string
  vehicleId: string
  vehicle: Vehicle
  dealershipId: string
  dealership: Dealership
  routeId: string | null
  route: Route | null
  assignedById: string
  assignedBy: { id?: string; name: string }
  returnedById: string | null
  returnedBy: { id?: string; name: string } | null
  overdue?: boolean
  needsDelayReason?: boolean
  color?: PlateColor
  evidences?: TripEvidence[]
}

export interface VehicleHistory {
  id: string
  action: string
  fromStatus: string | null
  toStatus: string | null
  details: string | null
  createdAt: string
  vehicleId: string
  userId: string | null
  user: { name: string } | null
  tripId: string | null
}

export interface AuditLog {
  id: string
  action: string
  entity: string
  entityId: string | null
  details: string | null
  ip: string | null
  createdAt: string
  userId: string | null
  user: { name: string; email: string } | null
}

export interface DashboardData {
  fleet: {
    total: number
    trucksAvailable: number
    carretasAvailable: number
    emViagem: number
    emManutencao: number
    bloqueados?: number
    retornamHoje: number
    retornamAmanha: number
    atrasadas: number
    atrasadasSemJustificativa?: number
    deveriamEstarDisponiveis?: number
  }
  ops?: {
    awaitingPlates: number
    priorityRoutes: number
    justificativasPendentes: number
    atrasadasSemJustificativa: number
  }
  hojeCarregamento?: {
    id: string
    name: string
    date: string
    hasPriority: boolean
    status: string
    cities: string
    assignedPlates: number
    plannedPlates: number | null
    coverage: number | null
    justifications: number
  }[]
  topDealership: { dealershipId: string; name: string; city: string; trips: number } | null
  avgTravelDays: number
  tripsPerDay: { date: string; count: number }[]
  tripsPerDealership: { dealershipId: string; name: string; city: string; trips: number }[]
  ranking: { dealershipId: string; name: string; city: string; trips: number }[]
  priorityRoutes?: number
}

export interface ProductsPanel {
  in30: PriorityProduct[]
  in15: PriorityProduct[]
  in7: PriorityProduct[]
  today: PriorityProduct[]
  expired: PriorityProduct[]
  urgentTop: PriorityProduct[]
}

export interface ReturnsPanel {
  today: Trip[]
  tomorrow: Trip[]
  in2Days: Trip[]
  later: Trip[]
  overdue: Trip[]
}

export interface SearchResult {
  type: 'placa' | 'concessionaria' | 'produto' | 'motorista' | 'roteiro'
  id: string
  title: string
  subtitle: string
  href: string
}
