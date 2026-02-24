// ============================================================================
// SWINGAI - POSITIONS HOOK
// Fetch and manage trading positions
// ============================================================================

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, handleApiError } from '../lib/api'
import { toast } from 'sonner'

// ============================================================================
// GET ALL POSITIONS
// ============================================================================

export function usePositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: () => api.positions.getAll(),
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // Refetch every 30 seconds for live P&L
  })
}

// ============================================================================
// GET POSITION BY ID
// ============================================================================

export function usePosition(id: string) {
  return useQuery({
    queryKey: ['position', id],
    queryFn: () => api.positions.getById(id),
    enabled: !!id,
    staleTime: 10000,
    refetchInterval: 30000,
  })
}

// ============================================================================
// CLOSE POSITION
// ============================================================================

export function useClosePosition() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (positionId: string) => api.positions.close(positionId),
    onSuccess: () => {
      toast.success('Position closed successfully!')
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      queryClient.invalidateQueries({ queryKey: ['trades'] })
    },
    onError: (error) => {
      const message = handleApiError(error)
      toast.error(`Failed to close position: ${message}`)
    },
  })
}

// ============================================================================
// UPDATE SL/TARGET
// ============================================================================

export function useUpdateSlTarget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      positionId,
      data,
    }: {
      positionId: string
      data: { stop_loss?: number; target?: number }
    }) => api.positions.updateSlTarget(positionId, data),
    onSuccess: () => {
      toast.success('SL/Target updated successfully!')
      queryClient.invalidateQueries({ queryKey: ['positions'] })
    },
    onError: (error) => {
      const message = handleApiError(error)
      toast.error(`Failed to update SL/Target: ${message}`)
    },
  })
}
