import { useState } from 'react'
import { AtSign, UserPlus } from 'lucide-react'
import { useClientSearch } from '../lib/queries'
import type { Client } from '../lib/types'
import { Input } from './ui'

type Props = {
  name: string
  clientId: string | null
  disabled?: boolean
  onChange: (name: string, client: Client | null) => void
}

/** Champ "Cliente" : propose les clientes connues dès 3 lettres saisies. */
export default function ClientAutocomplete({ name, clientId, disabled, onChange }: Props) {
  const [focused, setFocused] = useState(false)
  const { data: matches = [] } = useClientSearch(clientId ? '' : name)

  const trimmed = name.trim()
  const exact = matches.find((c) => c.name.toLowerCase() === trimmed.toLowerCase())
  const showList = focused && !clientId && trimmed.length >= 3

  return (
    <div className="relative">
      <Input
        value={name}
        disabled={disabled}
        placeholder="Nom de la cliente"
        autoComplete="off"
        autoCapitalize="words"
        onFocus={() => setFocused(true)}
        // Délai pour laisser le temps au clic sur une suggestion
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onChange={(e) => onChange(e.target.value, null)}
      />
      {showList && (matches.length > 0 || !exact) && (
        <ul className="pop-in absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-lg">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(c.name, c)
                  setFocused(false)
                }}
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left transition-colors hover:bg-accent-soft active:bg-accent-soft"
              >
                <span>{c.name}</span>
                {c.instagram && (
                  <span className="flex items-center gap-1 text-sm text-muted">
                    <AtSign size={14} />
                    {c.instagram}
                  </span>
                )}
              </button>
            </li>
          ))}
          {!exact && (
            <li className="flex min-h-11 items-center gap-2 px-3 text-sm text-muted">
              <UserPlus size={16} /> Nouvelle cliente, enregistrée à la validation
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
