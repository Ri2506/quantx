// ============================================================================
// SWINGAI - POSITIONS HOOK
// Simplified version for MVP
// ============================================================================

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

// Mock positions data
const mockPositions = [
  {
    id: '1',
    symbol: 'RELIANCE',
    direction: 'LONG',
    quantity: 50,
    average_price: 2780,
    current_price: 2847.50,
    unrealized_pnl: 3375,
    unrealized_pnl_percent: 2.43,
    is_active: true,
  },
]

export function usePositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      // Return mock data for now
      return { positions: mockPositions }
    },
    staleTime: 10000,
    refetchInterval: 30000,
  })
}

export function usePosition(id: string) {
  return useQuery({
    queryKey: ['position', id],
    queryFn: async () => {
      return mockPositions.find(p => p.id === id) || null
    },
    enabled: !!id,
    staleTime: 10000,
  })
}

export function useClosePosition() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (positionId: string) => {
      // Mock close position
      return { success: true }
    },
    onSuccess: () => {
      toast.success('Position closed successfully!')
      queryClient.invalidateQueries({ queryKey: ['positions'] })
    },
    onError: () => {
      toast.error('Failed to close position')
    },
  })
}

export function useUpdateSlTarget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      positionId,
      data,
    }: {
      positionId: string
      data: { stop_loss?: number; target?: number }
    }) => {
      // Mock update
      return { success: true }
    },
    onSuccess: () => {
      toast.success('SL/Target updated successfully!')
      queryClient.invalidateQueries({ queryKey: ['positions'] })
    },
    onError: () => {
      toast.error('Failed to update SL/Target')
    },
  })
}
