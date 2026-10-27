import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Download, LogOut, Pencil, Plus, ShieldCheck, Star } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  exportAll,
  useDaysOff,
  useDeleteDayOff,
  useDeleteSetting,
  usePaymentMethods,
  useSaveDayOff,
  useSaveSetting,
  useServices,
  useSetDefaultStatus,
  useStatuses,
  type SettingsTable,
} from '../lib/queries'
import type { DayOff, PaymentMethod, Service, Status } from '../lib/types'
import { PALETTE, formatDuration, formatEur, toDateInput } from '../lib/format'
import { useAuth } from '../lib/auth'
import { useOnline } from '../lib/useOnline'
import { useFlip } from '../lib/useFlip'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, ColorDot, ColorPicker, ErrorText, Field, Input, Sheet, Toggle, type SheetHandle } from '../components/ui'

export default function SettingsPage() {
  const { signOut, session } = useAuth()
  const online = useOnline()
  const [exporting, setExporting] = useState(false)
  const totp = session?.user.factors?.find((f) => f.factor_type === 'totp' && f.status === 'verified')

  async function download() {
    setExporting(true)
    try {
      const data = await exportAll()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `studio-de-louna-sauvegarde-${toDateInput(new Date())}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-6">
      <h1 className="text-2xl font-semibold">Paramètres</h1>
      {!online && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Hors ligne : modifications impossibles.</p>}

      <ServicesSection />
      <StatusesSection />
      <PaymentMethodsSection />
      <DaysOffSection />

      <Section title="Compte">
        <Card className="divide-y divide-line">
          <div className="px-4 py-3 text-sm text-muted">Connectée : {session?.user.email}</div>
          {totp && (
            <div className="flex items-start gap-3 px-4 py-3 text-sm">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" />
              <div>
                <p className="font-medium">Double authentification activée</p>
                <p className="text-muted">
                  Depuis le {format(parseISO(totp.created_at), 'd MMMM yyyy', { locale: fr })}. En cas de perte du téléphone, la réinitialiser
                  depuis le tableau de bord Supabase.
                </p>
              </div>
            </div>
          )}
          <button onClick={download} disabled={!online || exporting} className="flex min-h-12 w-full items-center gap-3 px-4 text-left transition-colors active:bg-bg disabled:opacity-50">
            <Download size={18} /> {exporting ? 'Export en cours…' : 'Télécharger une sauvegarde'}
          </button>
          <button onClick={signOut} className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-danger transition-colors active:bg-bg">
            <LogOut size={18} /> Déconnexion
          </button>
        </Card>
      </Section>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function AddButton({ onClick }: { onClick: () => void }) {
  const online = useOnline()
  return (
    <Button variant="outline" className="min-h-9 px-3 text-sm" onClick={onClick} disabled={!online}>
      <Plus size={16} /> Ajouter
    </Button>
  )
}

/** Liste ordonnable commune aux prestations, statuts et modes de paiement */
function SortableList<T extends { id: string; sort_order: number; archived: boolean }>({
  table,
  items,
  render,
  onEdit,
}: {
  table: SettingsTable
  items: T[]
  render: (item: T) => ReactNode
  onEdit: (item: T) => void
}) {
  const save = useSaveSetting(table)
  const online = useOnline()
  const [showArchived, setShowArchived] = useState(false)
  const active = items.filter((i) => !i.archived)
  const archived = items.filter((i) => i.archived)

  const qc = useQueryClient()
  const listRef = useRef<HTMLDivElement>(null)
  useFlip(listRef, active.map((i) => i.id).join())

  async function swap(i: number, j: number) {
    const a = active[i], b = active[j]
    // On renumérote toute la liste pour éviter les égalités de sort_order
    const orders = new Map(active.map((item, idx) => [item.id, item === a ? j : item === b ? i : idx]))
    // Mise à jour immédiate de l'affichage, sans attendre le serveur
    qc.setQueryData<T[]>([table], (old) =>
      old?.map((it) => (orders.has(it.id) ? { ...it, sort_order: orders.get(it.id)! } : it)).sort((x, y) => x.sort_order - y.sort_order),
    )
    await Promise.all(
      active.map((item) => {
        const order = orders.get(item.id)!
        return item.sort_order === order ? null : save.mutateAsync({ id: item.id, sort_order: order } as never)
      }),
    )
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div ref={listRef} className="divide-y divide-line">
        {active.length === 0 && <p className="px-4 py-3 text-sm text-muted">Aucun élément.</p>}
        {active.map((item, i) => (
          <div key={item.id} data-flip-id={item.id} className="relative flex min-h-14 items-center gap-2 bg-surface pr-2 pl-4">
            <div className="min-w-0 flex-1">{render(item)}</div>
            <div className="flex">
              <IconBtn label="Monter" disabled={!online || i === 0} onClick={() => swap(i, i - 1)}><ChevronUp size={18} /></IconBtn>
              <IconBtn label="Descendre" disabled={!online || i === active.length - 1} onClick={() => swap(i, i + 1)}><ChevronDown size={18} /></IconBtn>
              <IconBtn label="Modifier" disabled={!online} onClick={() => onEdit(item)}><Pencil size={18} /></IconBtn>
            </div>
          </div>
        ))}
        </div>
      </Card>
      {archived.length > 0 && (
        <div className="mt-2">
          <button className="text-sm text-muted underline" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Masquer' : 'Afficher'} les archivés ({archived.length})
          </button>
          {showArchived && (
            <Card className="pop-in mt-2 divide-y divide-line opacity-70">
              {archived.map((item) => (
                <div key={item.id} className="flex min-h-12 items-center gap-2 pr-2 pl-4">
                  <div className="min-w-0 flex-1">{render(item)}</div>
                  <Button variant="ghost" className="min-h-9 text-sm" disabled={!online} onClick={() => save.mutate({ id: item.id, archived: false } as never)}>
                    Restaurer
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </>
  )
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} disabled={disabled} className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-accent-soft active:scale-90 active:bg-accent-soft disabled:opacity-30 disabled:active:scale-100">
      {children}
    </button>
  )
}

/** Pied de fenêtre commun : supprimer (ou archiver si utilisé) + enregistrer */
function EditFooter({ table, id, onDone, onSave, saving, canSave }: {
  table: SettingsTable
  id?: string
  onDone: () => void
  onSave: () => void
  saving: boolean
  canSave: boolean
}) {
  const del = useDeleteSetting(table)
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="space-y-2">
      <ErrorText error={del.error} />
      <div className="flex justify-between gap-2">
        {id ? (
          confirm ? (
            <Button variant="danger" disabled={del.isPending} onClick={async () => { await del.mutateAsync(id); onDone() }}>
              Confirmer
            </Button>
          ) : (
            <Button variant="danger" onClick={() => setConfirm(true)}>Supprimer</Button>
          )
        ) : <span />}
        <Button onClick={onSave} disabled={!canSave || saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
      </div>
      {confirm && <p className="text-xs text-muted">S'il est utilisé dans des rendez-vous, il sera archivé et non supprimé.</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Prestations
// ---------------------------------------------------------------------------

function ServicesSection() {
  const { data = [] } = useServices()
  const [editing, setEditing] = useState<Partial<Service> | null>(null)
  return (
    <Section title="Prestations" action={<AddButton onClick={() => setEditing({ color: PALETTE[0], sort_order: data.length })} />}>
      <SortableList
        table="services"
        items={data}
        onEdit={setEditing}
        render={(s) => (
          <div className="flex items-center gap-3">
            <ColorDot color={s.color} size={14} />
            <div className="min-w-0">
              <div className="truncate font-medium">{s.name}</div>
              <div className="text-sm text-muted">
                {formatEur(Number(s.price))}
                {s.duration_min ? ` · ${formatDuration(s.duration_min)}` : ''}
                {s.supplement_step ? ` · suppl. ${formatEur(Number(s.supplement_step))}` : ''}
              </div>
            </div>
          </div>
        )}
      />
      {editing && <ServiceForm initial={editing} onDone={() => setEditing(null)} />}
    </Section>
  )
}

function ServiceForm({ initial, onDone }: { initial: Partial<Service>; onDone: () => void }) {
  const sheet = useRef<SheetHandle>(null)
  const close = () => sheet.current?.close()
  const save = useSaveSetting('services')
  const [name, setName] = useState(initial.name ?? '')
  const [price, setPrice] = useState(initial.price != null ? String(initial.price) : '')
  const [duration, setDuration] = useState(initial.duration_min ? String(initial.duration_min) : '')
  const [supplement, setSupplement] = useState(initial.supplement_step != null ? String(initial.supplement_step) : '')
  const [color, setColor] = useState(initial.color ?? PALETTE[0])
  const priceNum = Number(price.replace(',', '.'))
  const supplementNum = Number(supplement.replace(',', '.'))
  const canSave = name.trim() !== '' && price !== '' && !isNaN(priceNum) && priceNum >= 0
    && (supplement === '' || (!isNaN(supplementNum) && supplementNum > 0))

  async function submit() {
    await save.mutateAsync({
      id: initial.id,
      name: name.trim(),
      price: priceNum,
      duration_min: duration ? Number(duration) : null,
      supplement_step: supplement ? supplementNum : null,
      color,
      sort_order: initial.sort_order,
    })
    close()
  }

  return (
    <Sheet ref={sheet} open onClose={onDone} title={initial.id ? 'Modifier la prestation' : 'Nouvelle prestation'}
      footer={<EditFooter table="services" id={initial.id} onDone={close} onSave={submit} saving={save.isPending} canSave={canSave} />}>
      <div className="space-y-4">
        <Field label="Nom"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Semi-permanent" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix (€)">
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="40" />
          </Field>
          <Field label="Durée (min)" hint="Facultatif : calcule l'heure de fin">
            <Input inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))} placeholder="60" />
          </Field>
        </div>
        <Field label="Suppléments (€)" hint="Facultatif : montant proposé en 1× et 2× à la clôture du RDV">
          <Input inputMode="decimal" value={supplement} onChange={(e) => setSupplement(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="5" />
        </Field>
        <Field label="Couleur dans le calendrier" group><ColorPicker value={color} onChange={setColor} palette={PALETTE} /></Field>
        {initial.id && <p className="text-xs text-muted">Un changement de prix ne modifie pas les rendez-vous déjà enregistrés.</p>}
        <ErrorText error={save.error} />
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Statuts
// ---------------------------------------------------------------------------

function StatusesSection() {
  const { data = [] } = useStatuses()
  const setDefault = useSetDefaultStatus()
  const online = useOnline()
  const [editing, setEditing] = useState<Partial<Status> | null>(null)
  return (
    <Section title="Statuts" action={<AddButton onClick={() => setEditing({ color: '#8a8a8a', counts_in_revenue: true, sort_order: data.length })} />}>
      <SortableList
        table="statuses"
        items={data}
        onEdit={setEditing}
        render={(s) => (
          <div className="flex items-center gap-3">
            <ColorDot color={s.color} size={14} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-medium">
                <span className="truncate">{s.name}</span>
                {s.is_default && <span className="rounded-full bg-accent-soft px-2 text-xs text-accent">par défaut</span>}
              </div>
              <div className="text-sm text-muted">
                {s.counts_in_revenue ? 'Compte dans le CA' : 'Hors CA'}
                {s.reschedule && ' · reprogramme'}
              </div>
            </div>
            {!s.is_default && !s.archived && (
              <button className="ml-auto text-muted disabled:opacity-30" title="Définir par défaut" aria-label="Définir par défaut" disabled={!online} onClick={() => setDefault.mutate(s.id)}>
                <Star size={16} />
              </button>
            )}
          </div>
        )}
      />
      {editing && <StatusForm initial={editing} onDone={() => setEditing(null)} />}
    </Section>
  )
}

function StatusForm({ initial, onDone }: { initial: Partial<Status>; onDone: () => void }) {
  const sheet = useRef<SheetHandle>(null)
  const close = () => sheet.current?.close()
  const save = useSaveSetting('statuses')
  const [name, setName] = useState(initial.name ?? '')
  const [color, setColor] = useState(initial.color ?? '#8a8a8a')
  const [counts, setCounts] = useState(initial.counts_in_revenue ?? true)
  const [reschedule, setReschedule] = useState(initial.reschedule ?? false)

  async function submit() {
    await save.mutateAsync({ id: initial.id, name: name.trim(), color, counts_in_revenue: counts, reschedule, sort_order: initial.sort_order })
    close()
  }

  return (
    <Sheet ref={sheet} open onClose={onDone} title={initial.id ? 'Modifier le statut' : 'Nouveau statut'}
      footer={<EditFooter table="statuses" id={initial.id} onDone={close} onSave={submit} saving={save.isPending} canSave={name.trim() !== ''} />}>
      <div className="space-y-4">
        <Field label="Nom"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Toggle label="Compte dans le chiffre d'affaires" checked={counts} onChange={setCounts} />
        <div>
          <Toggle label="Proposer de reprogrammer" checked={reschedule} onChange={setReschedule} />
          <p className="text-xs text-muted">Sur l'accueil, ce bouton ouvre le choix d'une nouvelle date et repasse le RDV au statut par défaut.</p>
        </div>
        <Field label="Couleur" group><ColorPicker value={color} onChange={setColor} palette={PALETTE} /></Field>
        <ErrorText error={save.error} />
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Modes de paiement
// ---------------------------------------------------------------------------

function PaymentMethodsSection() {
  const { data = [] } = usePaymentMethods()
  const [editing, setEditing] = useState<Partial<PaymentMethod> | null>(null)
  return (
    <Section title="Modes de paiement" action={<AddButton onClick={() => setEditing({ sort_order: data.length })} />}>
      <SortableList table="payment_methods" items={data} onEdit={setEditing} render={(p) => <span className="font-medium">{p.name}</span>} />
      {editing && <PaymentForm initial={editing} onDone={() => setEditing(null)} />}
    </Section>
  )
}

function PaymentForm({ initial, onDone }: { initial: Partial<PaymentMethod>; onDone: () => void }) {
  const sheet = useRef<SheetHandle>(null)
  const close = () => sheet.current?.close()
  const save = useSaveSetting('payment_methods')
  const [name, setName] = useState(initial.name ?? '')
  async function submit() {
    await save.mutateAsync({ id: initial.id, name: name.trim(), sort_order: initial.sort_order })
    close()
  }
  return (
    <Sheet ref={sheet} open onClose={onDone} title={initial.id ? 'Modifier le mode de paiement' : 'Nouveau mode de paiement'}
      footer={<EditFooter table="payment_methods" id={initial.id} onDone={close} onSave={submit} saving={save.isPending} canSave={name.trim() !== ''} />}>
      <div className="space-y-4">
        <Field label="Nom"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lydia, chèque…" autoFocus /></Field>
        <ErrorText error={save.error} />
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Vacances et jours off
// ---------------------------------------------------------------------------

function DaysOffSection() {
  const { data = [] } = useDaysOff()
  const online = useOnline()
  const [editing, setEditing] = useState<Partial<DayOff> | null>(null)
  const today = toDateInput(new Date())
  const upcoming = data.filter((d) => d.end_date >= today).reverse()
  const past = data.filter((d) => d.end_date < today)
  const [showPast, setShowPast] = useState(false)

  const label = (d: DayOff) => {
    const f = (s: string) => format(parseISO(s), 'EEE d MMM yyyy', { locale: fr })
    return d.start_date === d.end_date ? f(d.start_date) : `${f(d.start_date)} → ${f(d.end_date)}`
  }

  const row = (d: DayOff) => (
    <div key={d.id} className="flex min-h-14 items-center gap-2 pr-2 pl-4">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{d.label}</div>
        <div className="text-sm text-muted capitalize">{label(d)}</div>
      </div>
      <IconBtn label="Modifier" disabled={!online} onClick={() => setEditing(d)}><Pencil size={18} /></IconBtn>
    </div>
  )

  return (
    <Section title="Vacances et jours off" action={<AddButton onClick={() => setEditing({ start_date: today, end_date: today, label: 'Vacances' })} />}>
      <Card className="divide-y divide-line">
        {upcoming.length === 0 && <p className="px-4 py-3 text-sm text-muted">Aucun jour off à venir.</p>}
        {upcoming.map(row)}
      </Card>
      {past.length > 0 && (
        <div className="mt-2">
          <button className="text-sm text-muted underline" onClick={() => setShowPast(!showPast)}>
            {showPast ? 'Masquer' : 'Afficher'} les passés ({past.length})
          </button>
          {showPast && <Card className="pop-in mt-2 divide-y divide-line opacity-70">{past.map(row)}</Card>}
        </div>
      )}
      {editing && <DayOffForm initial={editing} onDone={() => setEditing(null)} />}
    </Section>
  )
}

function DayOffForm({ initial, onDone }: { initial: Partial<DayOff>; onDone: () => void }) {
  const sheet = useRef<SheetHandle>(null)
  const close = () => sheet.current?.close()
  const save = useSaveDayOff()
  const del = useDeleteDayOff()
  const [labelText, setLabelText] = useState(initial.label ?? 'Vacances')
  const [start, setStart] = useState(initial.start_date ?? toDateInput(new Date()))
  const [end, setEnd] = useState(initial.end_date ?? start)
  const canSave = labelText.trim() !== '' && start !== '' && end >= start

  async function submit() {
    await save.mutateAsync({ id: initial.id, label: labelText.trim(), start_date: start, end_date: end })
    close()
  }

  return (
    <Sheet ref={sheet} open onClose={onDone} title={initial.id ? 'Modifier' : 'Nouveau jour off'}
      footer={
        <div className="flex justify-between gap-2">
          {initial.id ? (
            <Button variant="danger" disabled={del.isPending} onClick={async () => { await del.mutateAsync(initial.id!); close() }}>Supprimer</Button>
          ) : <span />}
          <Button onClick={submit} disabled={!canSave || save.isPending}>Enregistrer</Button>
        </div>
      }>
      <div className="space-y-4">
        <Field label="Libellé"><Input value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder="Vacances, formation…" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Du"><Input type="date" value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value) }} /></Field>
          <Field label="Au (inclus)"><Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <ErrorText error={save.error ?? del.error} />
      </div>
    </Sheet>
  )
}
