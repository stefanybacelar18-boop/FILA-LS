import type { Trip } from '../types'
import type { RouteLoadDestination } from './route-priority'
import { totalMotoCountFromDestinations } from './route-priority'

/** Paradas do roteiro vinculado à viagem (cidade, concessionária, motos, vencimento). */
export function tripRouteDestinations(trip: Trip): RouteLoadDestination[] {
  const route = trip.route
  if (route?.dealerships && route.dealerships.length > 0) {
    return route.dealerships.map((rd) => ({
      city: rd.dealership.city,
      dealershipName: rd.dealership.name,
      motoCount: rd.motoCount,
      minExpiryDate: rd.minExpiryDate ?? null,
      order: rd.order,
    }))
  }
  if (route?.dealership) {
    return [
      {
        city: route.dealership.city,
        dealershipName: route.dealership.name,
        order: 0,
      },
    ]
  }
  return [
    {
      city: trip.dealership.city,
      dealershipName: trip.dealership.name,
      order: 0,
    },
  ]
}

export function tripRouteMotoTotal(trip: Trip): number | null {
  const route = trip.route
  if (route?.totalMotoCount != null) return route.totalMotoCount
  const dests = tripRouteDestinations(trip)
  const fromDest = totalMotoCountFromDestinations(dests)
  return fromDest != null && fromDest > 0 ? fromDest : null
}
