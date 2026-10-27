import {
  useCallback, useEffect, useImperativeHandle, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import { X } from 'lucide-react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger'
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
        variant === 'primary' && 'bg-accent text-white hover:brightness-105',
        variant === 'outline' && 'border border-line bg-surface hover:bg-accent-soft',
        variant === 'ghost' && 'hover:bg-accent-soft',
        variant === 'danger' && 'border border-line bg-surface text-danger hover:bg-red-50',
        className,
      )}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

const inputClass =
  'block min-h-11 w-full rounded-xl border border-line bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-bg disabled:text-muted'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputClass, className)} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(inputClass, 'appearance-none', className)} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(inputClass, 'py-2', props.className)} />
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-line')}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </label>
  )
}

export type SheetHandle = { close: () => void }

const SHEET_EXIT_MS = 240

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Glisser la zone d'accroche vers le bas pour fermer, comme les fenêtres iOS.
 * Ferme au-delà de 120 px ou sur un geste rapide, sinon revient en place.
 */
function useDragToClose(panelRef: React.RefObject<HTMLDivElement | null>, close: () => void) {
  const start = useRef<{ y: number; t: number } | null>(null)
  const dy = useRef(0)

  const reset = () => {
    const panel = panelRef.current
    if (!panel) return
    panel.style.transition = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)'
    panel.style.transform = ''
  }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      // Uniquement au doigt ou en mode mobile ; pas sur le bouton Fermer
      if (window.innerWidth >= 640 || (e.target as HTMLElement).closest('button')) return
      start.current = { y: e.clientY, t: performance.now() }
      dy.current = 0
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      if (panelRef.current) panelRef.current.style.transition = 'none'
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current || !panelRef.current) return
      // Résistance vers le haut, libre vers le bas
      const raw = e.clientY - start.current.y
      dy.current = raw > 0 ? raw : raw / 6
      panelRef.current.style.transform = `translateY(${dy.current}px)`
    },
    onPointerUp: () => {
      if (!start.current) return
      const velocity = dy.current / (performance.now() - start.current.t)
      start.current = null
      if (dy.current > 120 || (dy.current > 30 && velocity > 0.6)) close()
      else reset()
    },
    onPointerCancel: () => {
      start.current = null
      reset()
    },
  }
}

/** Panneau qui monte du bas sur mobile, fenêtre centrée sur grand écran. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  ref,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** Permet aux formulaires de fermer avec l'animation (ex. après enregistrement) */
  ref?: Ref<SheetHandle>
}) {
  const [closing, setClosing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const close = useCallback(() => {
    if (prefersReducedMotion()) return onCloseRef.current()
    setClosing(true)
    window.setTimeout(() => {
      setClosing(false)
      onCloseRef.current()
    }, SHEET_EXIT_MS)
  }, [])

  useImperativeHandle(ref, () => ({ close }), [close])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, close])

  const drag = useDragToClose(panelRef, close)

  if (!open) return null
  // Portail : la popup ne dépend pas du contexte d'empilement de la page (animations, z-index)
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" data-closing={closing || undefined}>
      <div className="sheet-backdrop absolute inset-0 bg-black/30" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet-panel relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-bg shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        {/* Zone d'accroche : glisser vers le bas pour fermer (mobile) */}
        <div {...drag} className="touch-none select-none">
          <div className="flex justify-center pt-2 sm:hidden">
            <span className="h-1.5 w-10 rounded-full bg-line" />
          </div>
          <div className="flex items-center justify-between border-b border-line px-4 pt-1 pb-3 sm:pt-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={close} className="-mr-2 rounded-full p-2 transition hover:bg-accent-soft active:scale-90" aria-label="Fermer">
              <X size={20} />
            </button>
          </div>
        </div>
        {/* max() : garde une marge minimale quand il n'y a pas de zone de sécurité (hors iPhone) */}
        <div className={clsx('flex-1 overflow-y-auto px-4 pt-4', footer ? 'pb-4' : 'pb-[max(1rem,env(safe-area-inset-bottom))]')}>
          {children}
        </div>
        {footer && (
          <div className="border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('rounded-2xl border border-line bg-surface', className)}>{children}</div>
}

export function ColorDot({ color, size = 12 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ background: color, width: size, height: size }} />
}

export function ColorPicker({ value, onChange, palette }: { value: string; onChange: (c: string) => void; palette: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {palette.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          className={clsx('h-9 w-9 rounded-full border-2 transition', value === c ? 'border-ink scale-110' : 'border-transparent')}
          style={{ background: c }}
        />
      ))}
      <label className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-full border border-line" title="Autre couleur">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        <span className="flex h-full w-full items-center justify-center text-lg text-muted">+</span>
      </label>
    </div>
  )
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error instanceof Error ? error.message : String(error)}</p>
}
