import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, differenceInMinutes, format, isSameDay, startOfDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Clock, Pencil } from 'lucide-react'
import { clsx } from 'clsx'
import AppointmentSheet, { type SheetTarget } from '../components/AppointmentSheet'
import SupplementPicker from '../components/SupplementPicker'
import RescheduleSheet from '../components/RescheduleSheet'
import { useAppointments, useCloseAppointment, usePaymentMethods, useServices, useStatuses } from '../lib/queries'
import type { Appointment, Service, Status } from '../lib/types'
import { appointmentTotal, formatDuration, formatEur, supplementStep, appointmentCountsInStats } from '../lib/format'
import { useOnline } from '../lib/useOnline'
import { Card, ColorDot, ErrorText, Tile } from '../components/ui'

/** Heure courante, rafraîchie toutes les 30 s */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/** Un RDV est « à clôturer » tant qu'il garde le statut par défaut (Prévu) ou n'en a pas */
function isOpen(a: Appointment, statuses: Status[]) {
  const status = statuses.find((s) => s.id === a.status_id)
  return !status || status.is_default
}

function serviceNames(a: Appointment, services: Service[]) {
  return [...a.appointment_services]
    .sort((x, y) => x.position - y.position)
    .map((as) => services.find((s) => s.id === as.service_id)?.name)
    .filter(Boolean)
    .join(' + ')
}

/** Synthèse d'une journée : les RDV hors CA (annulés, absentes) et hors stats (ex. « Perso ») sont écartés */
function summarizeDay(appts: Appointment[], statuses: Status[], services: Service[]) {
  const kept = appts.filter(
    (a) => (statuses.find((s) => s.id === a.status_id)?.counts_in_revenue ?? true) && appointmentCountsInStats(a, services),
  )
  const done = kept.filter((a) => !isOpen(a, statuses))
  const sum = (list: Appointment[]) => list.reduce((total, a) => total + appointmentTotal(a), 0)
  const lastEnd = kept.reduce<Date | null>((max, a) => {
    const end = new Date(a.end_at)
    return !max || end > max ? end : max
  }, null)
  return {
    kept,
    done: done.length,
    remaining: kept.length - done.length,
    cashed: sum(done),
    potential: sum(kept),
    firstStart: kept[0] ? new Date(kept[0].start_at) : null,
    lastEnd,
  }
}

const NEXT_DAYS_LOOKAHEAD = 14

export default function HomePage() {
  const now = useNow()
  const dayStart = startOfDay(now)
  const tomorrow = addDays(dayStart, 1)
  const { data: appointments = [], isLoading } = useAppointments(dayStart.toISOString(), tomorrow.toISOString())
  const { data: upcoming = [] } = useAppointments(tomorrow.toISOString(), addDays(tomorrow, NEXT_DAYS_LOOKAHEAD).toISOString())
  const { data: statuses = [] } = useStatuses()
  const { data: services = [] } = useServices()
  const [target, setTarget] = useState<SheetTarget | null>(null)

  // RDV en cours : le premier de la journée déjà commencé et pas encore clôturé, même en retard.
  // Il ne laisse la place à la cliente suivante qu'une fois son statut choisi.
  // Les créneaux hors stats (ex. « Perso ») n'ont rien à encaisser : jamais mis en avant.
  const open = appointments.filter((a) => isOpen(a, statuses) && appointmentCountsInStats(a, services))
  const current = open.find((a) => new Date(a.start_at) <= now)
  const next = open.find((a) => a !== current && new Date(a.start_at) > now)
  const featured = current ?? next

  const today = summarizeDay(appointments, statuses, services)

  // Prochaine journée travaillée : le premier jour à venir qui a des RDV
  const nextDay = useMemo(() => {
    const kept = summarizeDay(upcoming, statuses, services).kept
    if (!kept.length) return null
    const day = startOfDay(new Date(kept[0].start_at))
    const sameDay = upcoming.filter((a) => isSameDay(new Date(a.start_at), day))
    return { day, appointments: sameDay, summary: summarizeDay(sameDay, statuses, services) }
  }, [upcoming, statuses, services])

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 md:p-6">
      <div>
        <p className="text-sm text-muted first-letter:uppercase">{format(now, 'EEEE d MMMM', { locale: fr })}</p>
        <h1 className="text-2xl font-semibold">Accueil</h1>
      </div>

      {today.kept.length > 0 && (
        <section className="space-y-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Tile label="Clientes" value={String(today.kept.length)} sub={`${today.done} terminée${today.done > 1 ? 's' : ''}`} />
            <Tile
              label="Restantes"
              value={String(today.remaining)}
              sub={today.lastEnd ? `Fin prévue ${format(today.lastEnd, 'HH:mm')}` : undefined}
            />
            <Tile label="Encaissé" value={formatEur(today.cashed)} />
            <Tile label="CA potentiel" value={formatEur(today.potential)} sub="Si tout est réalisé" />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${(today.done / today.kept.length) * 100}%` }}
            />
          </div>
        </section>
      )}

      {featured ? (
        <CurrentCard
          key={featured.id}
          appointment={featured}
          isCurrent={featured === current}
          now={now}
          upNext={featured === current ? next : undefined}
          onEdit={() => setTarget({ appointment: featured })}
        />
      ) : (
        !isLoading && (
          <Card className="p-6 text-center">
            <p className="font-medium">{appointments.length ? 'Tous les rendez-vous du jour sont clôturés' : "Aucun rendez-vous aujourd'hui"}</p>
            <Link to="/agenda" className="mt-2 inline-block text-sm font-medium text-accent">Ouvrir l'agenda</Link>
          </Card>
        )
      )}

      {appointments.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Aujourd'hui</h2>
          <AppointmentList appointments={appointments} highlight={featured} onOpen={(a) => setTarget({ appointment: a })} />
        </section>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">{nextDay && !isSameDay(nextDay.day, tomorrow) ? 'Prochaine journée' : 'Demain'}</h2>
          {nextDay && <span className="text-sm text-muted first-letter:uppercase">{format(nextDay.day, 'EEEE d MMMM', { locale: fr })}</span>}
        </div>
        {nextDay ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Tile label="Clientes" value={String(nextDay.summary.kept.length)} />
              <Tile
                label="Horaires"
                value={
                  nextDay.summary.firstStart && nextDay.summary.lastEnd
                    ? `${format(nextDay.summary.firstStart, 'HH:mm')}–${format(nextDay.summary.lastEnd, 'HH:mm')}`
                    : '—'
                }
              />
              <Tile label="CA potentiel" value={formatEur(nextDay.summary.potential)} />
            </div>
            <AppointmentList appointments={nextDay.appointments} onOpen={(a) => setTarget({ appointment: a })} showPrice />
          </div>
        ) : (
          <Card className="p-4 text-sm text-muted">Aucun rendez-vous dans les {NEXT_DAYS_LOOKAHEAD} prochains jours.</Card>
        )}
      </section>

      <AppointmentSheet target={target} onClose={() => setTarget(null)} />
    </div>
  )
}

function AppointmentList({ appointments, highlight, onOpen, showPrice }: {
  appointments: Appointment[]
  highlight?: Appointment
  onOpen: (a: Appointment) => void
  showPrice?: boolean
}) {
  const { data: statuses = [] } = useStatuses()
  const { data: services = [] } = useServices()
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {appointments.map((a) => {
        const status = statuses.find((s) => s.id === a.status_id)
        const cancelled = status && !status.counts_in_revenue
        return (
          <button
            key={a.id}
            onClick={() => onOpen(a)}
            className={clsx('flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-bg', a === highlight && 'bg-accent-soft/50')}
          >
            <span className="w-12 shrink-0 text-sm text-muted tabular-nums">{format(new Date(a.start_at), 'HH:mm')}</span>
            <div className="min-w-0 flex-1">
              <div className={clsx('truncate font-medium', cancelled && 'text-muted line-through')}>{a.client_name}</div>
              <div className="truncate text-sm text-muted">{serviceNames(a, services) || '—'}</div>
            </div>
            {showPrice && !cancelled ? (
              <span className="shrink-0 text-sm font-medium tabular-nums">{formatEur(appointmentTotal(a))}</span>
            ) : (
              status && (
                <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
                  <ColorDot color={status.color} size={10} /> {status.name}
                </span>
              )
            )}
          </button>
        )
      })}
    </Card>
  )
}

function CurrentCard({ appointment: a, isCurrent, now, upNext, onEdit }: {
  appointment: Appointment
  isCurrent: boolean
  now: Date
  upNext?: Appointment
  onEdit: () => void
}) {
  const online = useOnline()
  const { data: services = [] } = useServices()
  const { data: statuses = [] } = useStatuses()
  const { data: paymentMethods = [] } = usePaymentMethods()
  const close = useCloseAppointment()

  const [supplement, setSupplement] = useState(Number(a.supplement ?? 0))
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(a.payment_method_id)
  const [rescheduling, setRescheduling] = useState<Status | null>(null)

  const start = new Date(a.start_at)
  const end = new Date(a.end_at)
  const late = differenceInMinutes(now, end)
  const serviceIds = a.appointment_services.map((s) => s.service_id)
  const total = appointmentTotal({ ...a, supplement })

  const closingStatuses = statuses.filter((s) => !s.archived && !s.is_default)
  const activePayments = paymentMethods.filter((p) => !p.archived)

  const badge = !isCurrent
    ? `À venir · dans ${formatDuration(Math.max(1, differenceInMinutes(start, now)))}`
    : late > 0
      ? `En cours · ${formatDuration(late)} de dépassement`
      : 'En cours'

  return (
    <Card className="pop-in overflow-hidden">
      <div className="space-y-1 border-b border-line p-4">
        <div className="flex items-center justify-between gap-2">
          <span
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              isCurrent && late > 0 ? 'bg-amber-50 text-amber-800' : 'bg-accent-soft text-accent',
            )}
          >
            <Clock size={14} /> {badge}
          </span>
          <button onClick={onEdit} aria-label="Modifier le rendez-vous" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-accent-soft active:scale-90">
            <Pencil size={18} />
          </button>
        </div>
        <p className="text-2xl font-semibold">{a.client_name}</p>
        <p className="text-muted">
          {format(start, 'HH:mm')} – {format(end, 'HH:mm')}
          {serviceNames(a, services) && ` · ${serviceNames(a, services)}`}
        </p>
        {a.notes && <p className="text-sm text-muted italic">{a.notes}</p>}
      </div>

      <div className="space-y-4 p-4">
        <div>
          <span className="mb-2 block text-sm font-medium text-muted">Suppléments</span>
          <SupplementPicker value={supplement} onChange={setSupplement} step={supplementStep(services, serviceIds)} disabled={!online} />
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-muted">Paiement</span>
          <div className="flex flex-wrap gap-2">
            {activePayments.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!online}
                onClick={() => setPaymentMethodId(paymentMethodId === p.id ? null : p.id)}
                className={clsx(
                  'min-h-11 rounded-full border px-4 text-sm font-medium transition duration-200 active:scale-95',
                  paymentMethodId === p.id ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface',
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-bg px-3 py-2">
          <span className="font-medium">Total</span>
          <span className="text-lg font-semibold">{formatEur(total)}</span>
        </div>

        <ErrorText error={close.error} />

        <div className="grid grid-cols-2 gap-2">
          {closingStatuses.map((s) => (
            <button
              key={s.id}
              disabled={!online || close.isPending}
              onClick={() =>
                s.reschedule
                  ? setRescheduling(s)
                  : close.mutate({ id: a.id, status_id: s.id, payment_method_id: paymentMethodId, supplement })
              }
              className="min-h-12 rounded-xl border-2 px-3 font-semibold transition active:scale-[0.98] disabled:opacity-50"
              style={s.counts_in_revenue ? { background: s.color, borderColor: s.color, color: '#fff' } : { borderColor: s.color, color: s.color }}
            >
              {s.name}
            </button>
          ))}
        </div>
        {!online && <p className="text-sm text-amber-800">Hors ligne : clôture impossible.</p>}
      </div>

      {rescheduling && (
        <RescheduleSheet
          appointment={a}
          status={rescheduling}
          onMarkOnly={() => close.mutate({ id: a.id, status_id: rescheduling.id, payment_method_id: paymentMethodId, supplement })}
          onClose={() => setRescheduling(null)}
        />
      )}

      {upNext && (
        <div className="border-t border-line bg-bg px-4 py-2 text-sm text-muted">
          Ensuite : <span className="font-medium text-ink">{upNext.client_name}</span> à {format(new Date(upNext.start_at), 'HH:mm')}
        </div>
      )}
    </Card>
  )
}
