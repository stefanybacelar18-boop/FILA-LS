export type FuelLevel = '3/4' | '1/2' | '1/4' | 'C' | 'R'

export type ChecklistStatus = 'OK' | 'NG'

export type ChecklistItemState = {
  status?: ChecklistStatus
  qty?: number
  note?: string
}

export type ChecklistState = Record<string, ChecklistItemState>

export type ChecklistItemDef = {
  id: string
  label: string
  requiresQty?: boolean
}

export type FuelingEntry = {
  liters?: number
  odometerKm?: number
  valueReais?: number
}

export type LogbookSession = {
  prefilled: {
    tripId: string
    plate: string
    vehicleLabel: string
    driverName: string | null
    routeName: string | null
    routeDate: string
    departureAt: string
    expectedReturn: string
    returnedAt: string | null
    tripStatus: string
    destinations: { name: string; city: string; state: string }[]
    company: string
  }
  logbook: {
    id: string
    tripId: string
    driverMatricula: string | null
    helperName: string | null
    helperMatricula: string | null
    kmInitial: number | null
    kmFinal: number | null
    fuelDieselDeparture: string | null
    fuelOilDeparture: string | null
    fuelDieselReturn: string | null
    fuelOilReturn: string | null
    checklistDeparture: ChecklistState
    checklistReturn: ChecklistState
    fuelingDeparture: FuelingEntry[]
    fuelingReturn: FuelingEntry[]
    damageDescription: string | null
    maintenanceDescription: string | null
    departureComplete: boolean
    returnComplete: boolean
    coordinatorComplete: boolean
    departureSignedAt: string | null
    returnSignedAt: string | null
  }
  suggestedKmInitial: number | null
  checklistItems: ChecklistItemDef[]
  fuelLevels: FuelLevel[]
}

export type LogbookWorkflowStatus =
  | 'PENDENTE_SAIDA'
  | 'PENDENTE_RETORNO'
  | 'AGUARDANDO_COORDENADOR'
  | 'ARQUIVADO'

export type LogbookListItem = {
  id: string
  tripId: string
  plate: string
  driverName: string | null
  routeName: string | null
  departureAt: string
  departureComplete: boolean
  returnComplete: boolean
  coordinatorComplete: boolean
  coordinatorName: string | null
  status: LogbookWorkflowStatus
  statusLabel: string
  updatedAt: string
}

export type LogbookListResponse = {
  pendingCoordinator: number
  items: LogbookListItem[]
}

export type LogbookDetail = LogbookSession['logbook'] & {
  trip: {
    id: string
    driverName: string | null
    departureAt: string
    expectedReturn: string
    returnedAt: string | null
    status: string
    dealership: { name: string; city: string }
    route: { name: string; date: string } | null
  }
  plate: string
  vehicleLabel: string
  departureSignaturePng: string | null
  returnSignaturePng: string | null
  coordinatorSignaturePng: string | null
  coordinatorName: string | null
  departureSignedAt: string | null
  returnSignedAt: string | null
  coordinatorSignedAt: string | null
  formCode: string
  checklistItems: ChecklistItemDef[]
  checklistDeparture: ChecklistState
  checklistReturn: ChecklistState
  driverMatricula: string | null
  helperName: string | null
  helperMatricula: string | null
  fuelDieselDeparture: string | null
  fuelOilDeparture: string | null
  fuelDieselReturn: string | null
  fuelOilReturn: string | null
  departureComplete: boolean
  status: LogbookWorkflowStatus
  statusLabel: string
}
