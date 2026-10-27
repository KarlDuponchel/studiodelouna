import { Check } from 'lucide-react'
import { clsx } from 'clsx'
import type { Service } from '../lib/types'
import { formatDuration, formatEur } from '../lib/format'

type Props = {
  services: Service[]
  value: string[]
  disabled?: boolean
  onChange: (ids: string[]) => void
}

/** Sélection multiple de prestations, dans l'ordre où elles sont touchées. */
export default function ServicePicker({ services, value, disabled, onChange }: Props) {
  // Prestations actives + celles archivées déjà présentes sur le RDV
  const visible = services.filter((s) => !s.archived || value.includes(s.id))

  if (!visible.length) {
    return <p className="text-sm text-muted">Aucune prestation : à créer dans Paramètres.</p>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((s) => {
        const index = value.indexOf(s.id)
        const selected = index >= 0
        return (
          <button
            key={s.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(selected ? value.filter((id) => id !== s.id) : [...value, s.id])}
            className={clsx(
              'flex min-h-11 items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition disabled:opacity-60',
              selected ? 'border-transparent text-white' : 'border-line bg-surface',
            )}
            style={selected ? { background: s.color } : undefined}
          >
            {selected ? (
              <Check size={16} />
            ) : (
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
            )}
            <span className="leading-tight">
              <span className="block text-sm font-medium">{s.name}</span>
              <span className={clsx('block text-xs', selected ? 'text-white/85' : 'text-muted')}>
                {formatEur(Number(s.price))}
                {s.duration_min ? ` · ${formatDuration(s.duration_min)}` : ''}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
