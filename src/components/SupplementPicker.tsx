import { Minus, Plus } from 'lucide-react'
import { clsx } from 'clsx'
import { formatEur } from '../lib/format'

/** Boutons rapides 1× et 2× le pas, puis ±1 € pour ajuster. */
export default function SupplementPicker({ value, onChange, step, disabled }: {
  value: number
  onChange: (v: number) => void
  step: number
  disabled?: boolean
}) {
  const presets = [0, step, step * 2]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <button
          key={p}
          type="button"
          disabled={disabled}
          onClick={() => onChange(p)}
          className={clsx(
            'min-h-11 rounded-full border px-4 text-sm font-medium transition duration-200 active:scale-95',
            value === p ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface',
          )}
        >
          {p === 0 ? 'Aucun' : `+${formatEur(p)}`}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-1 rounded-full border border-line bg-surface p-1">
        <button
          type="button"
          aria-label="Retirer 1 €"
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-accent-soft active:scale-90 disabled:opacity-30"
        >
          <Minus size={18} />
        </button>
        <span className="min-w-16 text-center font-semibold tabular-nums">{formatEur(value)}</span>
        <button
          type="button"
          aria-label="Ajouter 1 €"
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-accent-soft active:scale-90 disabled:opacity-30"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  )
}
