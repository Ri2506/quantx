'use client'

/**
 * ModelBadge — single reusable chip for every Greek-branded engine.
 *
 * Always import the brand name + color from `lib/models.ts`. Never
 * hardcode a Greek name in a component — keep the registry as the
 * source of truth so renames happen in one place.
 */

import { publicModel, type PublicModelKey } from '@/lib/models'

type Size = 'xs' | 'sm' | 'md'

interface ModelBadgeProps {
  modelKey: PublicModelKey | string
  value?: string | number     // optional numeric payload (e.g. score, confidence)
  size?: Size
  variant?: 'soft' | 'solid' | 'outline'
  showRole?: boolean
  className?: string
}

const SIZE_CLS: Record<Size, string> = {
  xs: 'text-[9px] px-1.5 py-0.5 gap-1',
  sm: 'text-[10px] px-2 py-0.5 gap-1.5',
  md: 'text-[11px] px-2.5 py-1 gap-1.5',
}

export default function ModelBadge({
  modelKey,
  value,
  size = 'sm',
  variant = 'soft',
  showRole = false,
  className = '',
}: ModelBadgeProps) {
  const m = publicModel(modelKey)
  const name = m?.name ?? String(modelKey)
  const hex = m?.hex ?? '#4FECCD'
  const role = m?.role

  const style =
    variant === 'solid'
      ? { background: hex, color: '#0A0D14', borderColor: hex }
      : variant === 'outline'
        ? { background: 'transparent', color: hex, borderColor: `${hex}66` }
        : { background: `${hex}14`, color: hex, borderColor: `${hex}55` }

  return (
    <span
      title={showRole && role ? role : name}
      className={`inline-flex items-center font-semibold tracking-wider uppercase rounded-full border ${SIZE_CLS[size]} ${className}`}
      style={style}
    >
      <span>{name}</span>
      {value !== undefined && value !== null && value !== '' && (
        <span className="numeric font-normal opacity-90">{value}</span>
      )}
    </span>
  )
}
