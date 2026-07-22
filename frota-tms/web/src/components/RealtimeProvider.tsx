import { useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { connectSocket, disconnectSocket } from '../lib/socket'
import { useAuthStore } from '../stores/auth'

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!token) {
      disconnectSocket()
      return
    }

    const socket = connectSocket()

    const onFleet = () => {
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      void queryClient.invalidateQueries({ queryKey: ['vehicles-maintenance'] })
      void queryClient.invalidateQueries({ queryKey: ['vehicles-available-for-block'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['trips'] })
      void queryClient.invalidateQueries({ queryKey: ['returns'] })
      void queryClient.invalidateQueries({ queryKey: ['plates-board'] })
      void queryClient.invalidateQueries({ queryKey: ['vehicles-availability-summary'] })
      void queryClient.invalidateQueries({ queryKey: ['justifications'] })
    }
    const onTrips = () => {
      void queryClient.invalidateQueries({ queryKey: ['trips'] })
      void queryClient.invalidateQueries({ queryKey: ['returns'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['history'] })
      void queryClient.invalidateQueries({ queryKey: ['plates-board'] })
      void queryClient.invalidateQueries({ queryKey: ['vehicles-availability-summary'] })
      void queryClient.invalidateQueries({ queryKey: ['justifications'] })
    }
    const onRoutes = () => {
      void queryClient.invalidateQueries({ queryKey: ['routes'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['plates-board'] })
      void queryClient.invalidateQueries({ queryKey: ['vehicles-availability-summary'] })
      void queryClient.invalidateQueries({ queryKey: ['planning-board'] })
      void queryClient.invalidateQueries({ queryKey: ['planning-my-day'] })
      void queryClient.invalidateQueries({ queryKey: ['planning-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['planning-alerts'] })
      void queryClient.invalidateQueries({ queryKey: ['justifications'] })
    }
    const onPlanning = () => {
      void queryClient.invalidateQueries({ queryKey: ['planning-board'] })
      void queryClient.invalidateQueries({ queryKey: ['planning-my-day'] })
      void queryClient.invalidateQueries({ queryKey: ['planning-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['planning-alerts'] })
      void queryClient.invalidateQueries({ queryKey: ['routes'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    }

    socket.on('fleet:changed', onFleet)
    socket.on('trips:changed', onTrips)
    socket.on('routes:changed', onRoutes)
    socket.on('planning:changed', onPlanning)

    return () => {
      socket.off('fleet:changed', onFleet)
      socket.off('trips:changed', onTrips)
      socket.off('routes:changed', onRoutes)
      socket.off('planning:changed', onPlanning)
      disconnectSocket()
    }
  }, [token, queryClient])

  return children
}
