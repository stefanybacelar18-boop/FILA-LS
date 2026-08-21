import { io, type Socket } from 'socket.io-client'
import { getToken } from './api'

let socket: Socket | null = null

function createNoopSocket(): Socket {
  const noop = () => {}
  return {
    on: noop,
    off: noop,
    connect: noop,
    disconnect: noop,
    connected: false,
  } as unknown as Socket
}

export function getSocket(): Socket {
  if (import.meta.env.VITE_DISABLE_SOCKET === 'true') {
    if (!socket) socket = createNoopSocket()
    return socket
  }
  if (!socket) {
    socket = io('/', {
      path: '/socket.io',
      autoConnect: false,
      reconnectionAttempts: 5,
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
