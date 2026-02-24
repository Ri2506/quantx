// ============================================================================
// SWINGAI - SIGNALS HOOK
// Simplified version for MVP
// ============================================================================

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

// Mock signals data
const mockSignals = [
  {
    id: '1',
    symbol: 'RELIANCE',
    direction: 'LONG',
    entry_price: 2847.50,
    target_1: 3020,
    stop_loss: 2780,
    confidence: 89,
    risk_reward: 2.57,
    status: 'active',
    generated_at: new Date().toISOString(),
  },
]

export function useSignals(filters?: any) {
  return useQuery({
    queryKey: ['signals', filters],
    queryFn: async () => {
      // Return mock data for now
      return { all_signals: mockSignals }
    },
    staleTime: 30000,
    refetchInterval: 60000,
  })
}

export function useSignal(id: string) {
  return useQuery({
    queryKey: ['signal', id],
    queryFn: async () => {
      return mockSignals.find(s => s.id === id) || null
    },
    enabled: !!id,
  })
}

export function useExecuteSignal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ signalId, data }: { signalId: string; data: any }) => {
      // Mock execute signal
      return { success: true }
    },
    onSuccess: () => {
      toast.success('Signal executed successfully!')
      queryClient.invalidateQueries({ queryKey: ['signals'] })
      queryClient.invalidateQueries({ queryKey: ['positions'] })
    },
    onError: () => {
      toast.error('Failed to execute signal')
    },
  })
}

export function useSignalHistory(filters?: any) {
  return useQuery({
    queryKey: ['signal-history', filters],
    queryFn: async () => {
      return { signals: mockSignals }
    },
    staleTime: 60000,
  })
}
