/**
 * WebSocket Service for Real-time Updates
 *
 * This service provides WebSocket connection management for real-time features
 * like chat messages, transaction notifications, and blockchain updates.
 *
 * Usage:
 * ```typescript
 * import { websocketService } from '@/lib/websocket'
 *
 * // Subscribe to messages
 * websocketService.subscribe('message', (data) => {
 *   console.log('New message:', data)
 * })
 *
 * // Send a message
 * websocketService.send('message', { content: 'Hello!' })
 *
 * // Clean up on unmount
 * useEffect(() => {
 *   return () => websocketService.unsubscribe('message', handler)
 * }, [])
 * ```
 */

type EventHandler = (data: any) => void

class WebSocketService {
  private ws: WebSocket | null = null
  private eventHandlers: Map<string, Set<EventHandler>> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private url: string

  constructor(url?: string) {
    // Prefer an explicitly configured URL, then derive one from the HTTP API
    // base (http(s):// -> ws(s)://) so prod points at the same backend as the
    // REST client. Only fall back to the localhost dev server outside
    // production — in a prod browser ws://<host>:3001 is unreachable and would
    // just spew failed-connection / reconnect noise.
    this.url = url || WebSocketService.resolveUrl()
  }

  private static resolveUrl(): string {
    const explicit = process.env.NEXT_PUBLIC_WS_URL
    if (explicit) return explicit

    const apiBase = process.env.NEXT_PUBLIC_API_URL
    if (apiBase) return `${apiBase.replace(/^http/, 'ws').replace(/\/+$/, '')}/ws`

    // No backend configured: only the local dev server is a sane default.
    return process.env.NODE_ENV === 'production'
      ? ''
      : 'ws://localhost:3001/ws'
  }

  connect() {
    if (typeof window === 'undefined') return
    // No backend WS configured (prod without NEXT_PUBLIC_WS_URL/API_URL):
    // skip instead of throwing on `new WebSocket('')`.
    if (!this.url) return

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.reconnectAttempts = 0
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const { type, payload } = data

          const handlers = this.eventHandlers.get(type)
          if (handlers) {
            handlers.forEach(handler => handler(payload))
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      this.ws.onclose = () => {
        console.log('WebSocket disconnected')
        this.attemptReconnect()
      }
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)

      setTimeout(() => {
        this.connect()
      }, this.reconnectDelay * this.reconnectAttempts)
    } else {
      console.error('Max reconnection attempts reached')
    }
  }

  subscribe(eventType: string, handler: EventHandler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set())
    }
    this.eventHandlers.get(eventType)!.add(handler)
  }

  unsubscribe(eventType: string, handler: EventHandler) {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      handlers.delete(handler)
    }
  }

  send(type: string, payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }))
    } else {
      console.warn('WebSocket is not connected')
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}

// Singleton instance
export const websocketService = new WebSocketService()

// Auto-connect when imported (client-side only)
if (typeof window !== 'undefined') {
  // Note: In production, you might want to connect only when needed
  // For now, we'll skip auto-connect since there's no WebSocket server
  // websocketService.connect()
}
