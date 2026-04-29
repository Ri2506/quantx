// ============================================================================
// QUANT X - WEBSOCKET HOOK
// Real-time data subscriptions via WebSocket
// ============================================================================

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { PriceUpdate, WebSocketMessage } from '../types'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'

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
  const [connectionFailed, setConnectionFailed] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const ws = useRef<WebSocket | null>(null)
  const reconnectCount = useRef(0)
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null)

  // ============================================================================
  // CONNECT
  // ============================================================================

  /**
   * Resolve the WebSocket URL + token separately. The token is NOT appended
   * to the URL (that leaked tokens to server logs / CDN history). We always
   * connect to the bare `/ws` endpoint and pass the token via the
   * `Sec-WebSocket-Protocol` header using the browser subprotocol mechanism:
   *   new WebSocket(url, ['access_token', token])
   * The server accepts with `subprotocol='access_token'` to complete the
   * handshake. See backend `/ws` endpoint in src/backend/api/app.py.
   */
  const resolveWebSocketConfig = useCallback(async () => {
    let trimmedUrl = url.replace(/\/$/, '')

    // Legacy support: if env var still points at /ws/{token} style, strip the
    // path suffix. The header-auth endpoint lives at bare /ws.
    trimmedUrl = trimmedUrl.replace('{token}', '').replace(/\/ws\/[^/]+$/, '/ws')
    if (!trimmedUrl.endsWith('/ws')) {
      trimmedUrl = `${trimmedUrl}/ws`
    }

    let resolvedToken = token
    if (!resolvedToken) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        resolvedToken = session?.access_token || undefined
      } catch (error) {
        logger.error('Failed to resolve WebSocket token:', error)
      }
    }

    if (!resolvedToken) {
      logger.warn('WebSocket token missing; skipping connection')
      return null
    }

    return { url: trimmedUrl, token: resolvedToken }
  }, [url, token])

  const connect = useCallback(async () => {
    try {
      const config = await resolveWebSocketConfig()
      if (!config) {
        return
      }

      // Pass token as a subprotocol. The browser sends this as
      // `Sec-WebSocket-Protocol: access_token, <jwt>` — never in the URL.
      ws.current = new WebSocket(config.url, ['access_token', config.token])

      ws.current.onopen = () => {
        logger.log('WebSocket connected')
        setIsConnected(true)
        setConnectionFailed(false)
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
          logger.error('Error parsing WebSocket message:', error)
        }
      }

      ws.current.onerror = (error) => {
        logger.error('WebSocket error:', error)

        if (onError) {
          onError(error)
        }
      }

      ws.current.onclose = () => {
        logger.log('WebSocket disconnected')
        setIsConnected(false)

        if (onClose) {
          onClose()
        }

        // Attempt reconnection
        if (reconnectCount.current < reconnectAttempts) {
          reconnectCount.current += 1
          logger.log(
            `Attempting to reconnect (${reconnectCount.current}/${reconnectAttempts})...`
          )

          reconnectTimeout.current = setTimeout(() => {
            connect()
          }, reconnectInterval)
        } else {
          logger.error('Max reconnection attempts reached')
          setConnectionFailed(true)
        }
      }
    } catch (error) {
      logger.error('Error creating WebSocket:', error)
    }
  }, [resolveWebSocketConfig, reconnectAttempts, reconnectInterval, onMessage, onError, onClose])

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
      logger.error('WebSocket is not connected')
    }
  }, [])

  // ============================================================================
  // SUBSCRIBE TO CHANNEL
  // ============================================================================

  const subscribe = useCallback(
    (channel: string, data?: any) => {
      const channelMap: Record<string, string> = {
        prices: 'price',
        positions: 'portfolio',
      }
      const backendChannel = channelMap[channel] || channel

      if ((channel === 'prices' || channel === 'price') && data?.symbol) {
        sendMessage({
          action: 'subscribe',
          channel: backendChannel,
          symbols: Array.isArray(data.symbol) ? data.symbol : [data.symbol],
        })
      } else if (data?.symbols) {
        sendMessage({
          action: 'subscribe',
          channel: backendChannel,
          symbols: data.symbols,
        })
      } else {
        sendMessage({
          action: 'subscribe',
          channel: backendChannel,
        })
      }
    },
    [sendMessage]
  )

  // ============================================================================
  // UNSUBSCRIBE FROM CHANNEL
  // ============================================================================

  const unsubscribe = useCallback(
    (channel: string, data?: any) => {
      const channelMap: Record<string, string> = {
        prices: 'price',
        positions: 'portfolio',
      }
      sendMessage({
        action: 'unsubscribe',
        channel: channelMap[channel] || channel,
        symbols: data?.symbols || [],
      })
    },
    [sendMessage]
  )

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  useEffect(() => {
    connect()

    // PR 105 — Supabase access tokens expire in 1 hour. Once a WS is
    // connected, the session sits frozen with the original token; the
    // server only verifies on connect (and `verify_exp` is on, so a
    // stale token *would* be rejected on a clean reconnect). Without
    // this listener, a long-running tab quietly accumulates an
    // expired token in the live connection, and any forced reconnect
    // (network blip, server restart) would fail until the page reloads.
    //
    // Subscribe to `TOKEN_REFRESHED` and force a clean reconnect with
    // the freshly minted access token. SIGNED_OUT also drops the WS.
    let authSub: { subscription: { unsubscribe: () => void } } | null = null
    try {
      const handle = supabase?.auth.onAuthStateChange((event) => {
        if (event === 'TOKEN_REFRESHED') {
          // Disconnect + reconnect — `connect()` re-fetches the session
          // and uses the new access_token in the subprotocol handshake.
          if (ws.current) {
            try { ws.current.close() } catch {}
            ws.current = null
          }
          // Reset reconnect counter so onclose's auto-retry doesn't
          // count this against the budget.
          reconnectCount.current = 0
          connect()
        } else if (event === 'SIGNED_OUT') {
          if (ws.current) {
            try { ws.current.close() } catch {}
            ws.current = null
          }
        }
      })
      authSub = handle?.data ? { subscription: handle.data.subscription } : null
    } catch (error) {
      logger.error('WebSocket auth listener setup failed:', error)
    }

    return () => {
      try { authSub?.subscription.unsubscribe() } catch {}
      disconnect()
    }
  }, [connect, disconnect])

  return {
    isConnected,
    connectionFailed,
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
  const pendingRef = useRef<Record<string, PriceUpdate>>({})
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup flush timer on unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    }
  }, [])

  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'price_update') {
      const priceData = message.data as PriceUpdate
      // Accumulate in ref (no re-render)
      pendingRef.current[priceData.symbol] = priceData

      // Flush to state at most every 500ms
      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(() => {
          setPrices((prev) => ({ ...prev, ...pendingRef.current }))
          pendingRef.current = {}
          flushTimerRef.current = null
        }, 500)
      }
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
