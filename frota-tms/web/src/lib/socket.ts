import { io, type Socket } from 'socket.io-client'
import { getToken } from './api'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      path: '/socket.io',
      autoConnect: false,
      // socket.io v4 chama auth(cb) — precisa invocar o callback
      auth: (cb: (data: { token: string | null }) => void) => {
        cb({ token: getToken() })
      },
    })
  }
  return socket
}

export function connectSocket() {
  const s = getSocket()
  if (!s.connected) s.connect()
  return s
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect()
}
