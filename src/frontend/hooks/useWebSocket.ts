// ============================================================================
// SWINGAI - WEBSOCKET HOOK
// Real-time data subscriptions via WebSocket
// ============================================================================

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { PriceUpdate, WebSocketMessage } from '../types'
import { supabase } from '../lib/supabase'

interface WebSocketOptions {
  url?: string
  token?: string
  reconnectAttempts?: number
  reconnectInterval?: number
  onMessage?: (message: WebSocketMessage) => void
  onError?: (error: Event) => void
  onClose?: () => void
}

export function useWebSocket(options: WebSocketOptions = {}) {
  const {
    url = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws',
    token,
    reconnectAttempts = 5,
    reconnectInterval = 3000,
    onMessage,
    onError,
    onClose,
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const ws = useRef<WebSocket | null>(null)
  const reconnectCount = useRef(0)
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null)

  // ============================================================================
  // CONNECT
  // ============================================================================

  const resolveWebSocketUrl = useCallback(async () => {
    const trimmedUrl = url.replace(/\/$/, '')
    const hasTokenInPath = /\/ws\/[^/]+$/.test(trimmedUrl)
    let resolvedToken = token

    if (!resolvedToken) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        resolvedToken = session?.access_token || undefined
      } catch (error) {
        console.error('Failed to resolve WebSocket token:', error)
      }
    }

    if (!resolvedToken) {
      if (hasTokenInPath) {
        return trimmedUrl
      }
      console.warn('WebSocket token missing; skipping connection')
      return null
    }

    if (trimmedUrl.includes('{token}')) {
      return trimmedUrl.replace('{token}', resolvedToken)
    }

    if (hasTokenInPath) {
      return trimmedUrl
    }

    if (trimmedUrl.endsWith('/ws')) {
      return `${trimmedUrl}/${resolvedToken}`
    }

    return `${trimmedUrl}/ws/${resolvedToken}`
  }, [url, token])

  const connect = useCallback(async () => {
    try {
      const resolvedUrl = await resolveWebSocketUrl()
      if (!resolvedUrl) {
        return
      }

      ws.current = new WebSocket(resolvedUrl)

      ws.current.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        reconnectCount.current = 0
      }

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          setLastMessage(message)

          if (onMessage) {
            onMessage(message)
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error)

        if (onError) {
          onError(error)
        }
      }

      ws.current.onclose = () => {
        console.log('WebSocket disconnected')
        setIsConnected(false)

        if (onClose) {
          onClose()
        }

        // Attempt reconnection
        if (reconnectCount.current < reconnectAttempts) {
          reconnectCount.current += 1
          console.log(
            `Attempting to reconnect (${reconnectCount.current}/${reconnectAttempts})...`
          )

          reconnectTimeout.current = setTimeout(() => {
            connect()
          }, reconnectInterval)
        } else {
          console.error('Max reconnection attempts reached')
        }
      }
    } catch (error) {
      console.error('Error creating WebSocket:', error)
    }
  }, [resolveWebSocketUrl, reconnectAttempts, reconnectInterval, onMessage, onError, onClose])

  // ============================================================================
  // DISCONNECT
  // ============================================================================

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current)
      reconnectTimeout.current = null
    }

    if (ws.current) {
      ws.current.close()
      ws.current = null
    }

    setIsConnected(false)
  }, [])

  // ============================================================================
  // SEND MESSAGE
  // ============================================================================

  const sendMessage = useCallback((message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message))
    } else {
      console.error('WebSocket is not connected')
    }
  }, [])

  // ============================================================================
  // SUBSCRIBE TO CHANNEL
  // ============================================================================

  const subscribe = useCallback(
    (channel: string, data?: any) => {
      sendMessage({
        type: 'subscribe',
        channel,
        data,
      })
    },
    [sendMessage]
  )

  // ============================================================================
  // UNSUBSCRIBE FROM CHANNEL
  // ============================================================================

  const unsubscribe = useCallback(
    (channel: string) => {
      sendMessage({
        type: 'unsubscribe',
        channel,
      })
    },
    [sendMessage]
  )

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  useEffect(() => {
    connect()

    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return {
    isConnected,
    lastMessage,
    sendMessage,
    subscribe,
    unsubscribe,
    connect,
    disconnect,
  }
}

// ============================================================================
// PRICE UPDATES HOOK
// ============================================================================

export function usePriceUpdates(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, PriceUpdate>>({})

  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'price_update') {
      const priceData = message.data as PriceUpdate

      setPrices((prev) => ({
        ...prev,
        [priceData.symbol]: priceData,
      }))
    }
  }, [])

  const { isConnected, subscribe, unsubscribe } = useWebSocket({
    onMessage: handleMessage,
  })

  useEffect(() => {
    if (isConnected && symbols.length > 0) {
      // Subscribe to price updates for all symbols
      symbols.forEach((symbol) => {
        subscribe('prices', { symbol })
      })

      // Cleanup on unmount or when symbols change
      return () => {
        symbols.forEach((symbol) => {
          unsubscribe('prices')
        })
      }
    }
  }, [isConnected, symbols, subscribe, unsubscribe])

  return {
    prices,
    isConnected,
  }
}

// ============================================================================
// SIGNAL UPDATES HOOK
// ============================================================================

export function useSignalUpdates(callback: (signal: any) => void) {
  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      if (message.type === 'signal_new') {
        callback(message.data)
      }
    },
    [callback]
  )

  const { isConnected, subscribe, unsubscribe } = useWebSocket({
    onMessage: handleMessage,
  })

  useEffect(() => {
    if (isConnected) {
      subscribe('signals')

      return () => {
        unsubscribe('signals')
      }
    }
  }, [isConnected, subscribe, unsubscribe])

  return {
    isConnected,
  }
}

// ============================================================================
// POSITION UPDATES HOOK
// ============================================================================

export function usePositionUpdates(userId: string, callback: (position: any) => void) {
  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      if (message.type === 'position_update') {
        callback(message.data)
      }
    },
    [callback]
  )

  const { isConnected, subscribe, unsubscribe } = useWebSocket({
    onMessage: handleMessage,
  })

  useEffect(() => {
    if (isConnected && userId) {
      subscribe('positions', { user_id: userId })

      return () => {
        unsubscribe('positions')
      }
    }
  }, [isConnected, userId, subscribe, unsubscribe])

  return {
    isConnected,
  }
}

export default useWebSocket
