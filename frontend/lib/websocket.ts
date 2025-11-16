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
    // For demo purposes, we'll use a placeholder URL
    // Replace with your actual WebSocket server URL
    this.url = url || (typeof window !== 'undefined'
      ? `ws://${window.location.hostname}:3001/ws`
      : 'ws://localhost:3001/ws')
  }

  connect() {
    if (typeof window === 'undefined') return

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
