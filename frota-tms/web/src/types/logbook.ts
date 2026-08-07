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

export type LogbookStopEntry = {
  order: number
  dealershipId?: string | null
  dealershipName: string
  city: string
  plannedMotoCount?: number | null
  kmArrival?: number | null
  arrivalTime?: string | null
  departureTime?: string | null
  boxQty?: number | null
  motoQty?: number | null
}

export type PernoiteEntry = {
  date?: string | null
  arrival?: string | null
  cityHotel?: string | null
  arrivalTime?: string | null
  departureTime?: string | null
}

export type MealEntry = {
  date?: string | null
  city?: string | null
  startTime?: string | null
  endTime?: string | null
}

export type TimedEntry = {
  local?: string | null
  date?: string | null
  start?: string | null
  end?: string | null
  total?: string | null
}

export type MaintenanceReport = {
  local?: string | null
  kmArrival?: number | null
  service?: string | null
  arrivalTime?: string | null
  departureTime?: string | null
  mecanica?: boolean
  hidraulica?: boolean
  eletrica?: boolean
  lavagem?: boolean
  borracharia?: boolean
  bau?: boolean
}

export type LogbookReportExtras = {
  pernoites: PernoiteEntry[]
  meals: MealEntry[]
  restTimes: TimedEntry[]
  waitTimes: TimedEntry[]
  maintenance: MaintenanceReport
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
    destinations: {
      id: string | null
      name: string
      city: string
      state: string
      order: number
      plannedMotoCount: number | null
    }[]
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
    reportFormCode: string
    stops: LogbookStopEntry[]
    reportExtras: LogbookReportExtras
    tripObservations: string | null
    reportStopsComplete: boolean
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
  stops: LogbookStopEntry[]
  reportExtras: LogbookReportExtras
  tripObservations: string | null
  reportStopsComplete: boolean
}
