import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { fr } from 'date-fns/locale'
import { AtSign, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { clsx } from 'clsx'
import AppointmentSheet, { type SheetTarget } from '../components/AppointmentSheet'
import { useClientAppointments, useClients, usePaymentMethods, useServices, useStatuses } from '../lib/queries'
import type { Appointment, ClientWithLastVisit } from '../lib/types'
import { appointmentTotal, formatEur, appointmentCountsInStats } from '../lib/format'
import { Card, ColorDot, Input, Tile } from '../components/ui'

/** Recherche sans tenir compte des accents ni de la casse */
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function ClientsPage() {
  const { id } = useParams()
  const { data: clients = [], isLoading } = useClients()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    return q ? clients.filter((c) => normalize(c.name).includes(q) || normalize(c.instagram ?? '').includes(q)) : clients
  }, [clients, query])

  const selected = clients.find((c) => c.id === id) ?? null

  return (
    <div className="flex h-full">
      {/* Liste : toujours visible sur grand écran, masquée sur iPhone quand une fiche est ouverte */}
      <div className={clsx('flex min-h-0 w-full flex-col md:w-80 md:shrink-0 md:border-r md:border-line', id && 'hidden md:flex')}>
        <div className="space-y-3 p-4 pb-2">
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un nom, un @"
              autoComplete="off"
              autoCorrect="off"
              className="pl-10"
            />
          </div>
          <p className="text-xs text-muted">
            {filtered.length} cliente{filtered.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {!isLoading && filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Aucune cliente trouvée</p>
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {filtered.map((c) => (
                <ClientRow key={c.id} client={c} active={c.id === id} />
              ))}
            </Card>
          )}
        </div>
      </div>

      <div className={clsx('min-h-0 min-w-0 flex-1 overflow-y-auto', !id && 'hidden md:block')}>
        {selected ? (
          <ClientDetail key={selected.id} client={selected} />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-muted">
            {id && !isLoading ? 'Cliente introuvable' : 'Choisir une cliente pour voir son historique'}
          </div>
        )}
      </div>
    </div>
  )
}

function ClientRow({ client: c, active }: { client: ClientWithLastVisit; active: boolean }) {
  const last = c.appointments[0] ? new Date(c.appointments[0].start_at) : null
  return (
    <Link
      to={`/clientes/${c.id}`}
      replace={active}
      className={clsx('flex min-h-14 items-center gap-3 px-4 py-2 transition hover:bg-bg', active && 'bg-accent-soft')}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{c.name}</div>
        <div className="truncate text-sm text-muted">
          {last ? (last > new Date() ? `Prochain RDV le ${format(last, 'd MMM', { locale: fr })}` : `Venue le ${format(last, 'd MMM yyyy', { locale: fr })}`) : 'Aucun RDV'}
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </Link>
  )
}

function ClientDetail({ client }: { client: ClientWithLastVisit }) {
  const navigate = useNavigate()
  const { data: appointments = [], isLoading } = useClientAppointments(client.id)
  const { data: statuses = [] } = useStatuses()
  const { data: services = [] } = useServices()
  const { data: paymentMethods = [] } = usePaymentMethods()
  const [target, setTarget] = useState<SheetTarget | null>(null)

  const now = new Date()
  const countsInRevenue = (a: Appointment) => statuses.find((s) => s.id === a.status_id)?.counts_in_revenue ?? true
  // Les chiffres de la fiche ignorent les créneaux hors stats (ex. « Perso ») ; l'historique les garde
  const counted = appointments.filter((a) => appointmentCountsInStats(a, services))
  const past = counted.filter((a) => new Date(a.start_at) <= now && countsInRevenue(a))
  const upcoming = counted.filter((a) => new Date(a.start_at) > now && countsInRevenue(a))
  const missed = counted.filter((a) => !countsInRevenue(a)).length
  const spent = past.reduce((sum, a) => sum + appointmentTotal(a), 0)
  const lastVisit = past[0] ? new Date(past[0].start_at) : null
  const nextVisit = upcoming.length ? new Date(upcoming[upcoming.length - 1].start_at) : null

  const instagram = client.instagram?.replace(/^@/, '')

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 md:p-6">
      <div>
        <button onClick={() => navigate('/clientes')} className="-ml-2 mb-1 flex min-h-11 items-center gap-1 rounded-xl px-2 text-accent md:hidden">
          <ChevronLeft size={20} /> Clientes
        </button>
        <h2 className="text-2xl font-semibold">{client.name}</h2>
        {instagram && (
          <a
            href={`https://instagram.com/${encodeURIComponent(instagram)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-accent"
          >
            <AtSign size={14} />
            {instagram}
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile label="Venues" value={String(past.length)} sub={missed ? `${missed} annulé${missed > 1 ? 's' : ''} / absente` : undefined} />
        <Tile label="Total dépensé" value={formatEur(spent)} sub={past.length ? `Moy. ${formatEur(spent / past.length)}` : undefined} />
        <Tile
          label="Dernière venue"
          value={lastVisit ? format(lastVisit, 'd MMM yy', { locale: fr }) : '—'}
          sub={lastVisit ? `Il y a ${formatDistanceToNowStrict(lastVisit, { locale: fr })}` : undefined}
        />
        <Tile label="Prochain RDV" value={nextVisit ? format(nextVisit, 'd MMM HH:mm', { locale: fr }) : '—'} />
      </div>

      <section>
        <h3 className="mb-2 font-semibold">Historique</h3>
        {!isLoading && appointments.length === 0 ? (
          <Card className="p-4 text-sm text-muted">Aucun rendez-vous</Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {appointments.map((a) => {
              const status = statuses.find((s) => s.id === a.status_id)
              const cancelled = status && !status.counts_in_revenue
              const names = [...a.appointment_services]
                .sort((x, y) => x.position - y.position)
                .map((as) => services.find((s) => s.id === as.service_id)?.name)
                .filter(Boolean)
                .join(' + ')
              const payment = paymentMethods.find((p) => p.id === a.payment_method_id)
              return (
                <button
                  key={a.id}
                  onClick={() => setTarget({ appointment: a })}
                  className={clsx('block w-full px-4 py-3 text-left transition hover:bg-bg', new Date(a.start_at) > now && 'bg-accent-soft/40')}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium first-letter:uppercase">{format(new Date(a.start_at), 'EEE d MMM yyyy · HH:mm', { locale: fr })}</span>
                    <span className={clsx('shrink-0 font-semibold tabular-nums', cancelled && 'text-muted line-through')}>
                      {formatEur(appointmentTotal(a))}
                    </span>
                  </div>
                  <div className={clsx('text-sm', cancelled ? 'text-muted line-through' : 'text-ink')}>{names || '—'}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    {status && (
                      <span className="flex items-center gap-1">
                        <ColorDot color={status.color} size={8} /> {status.name}
                      </span>
                    )}
                    {Number(a.supplement) > 0 && <span>Suppl. {formatEur(Number(a.supplement))}</span>}
                    {a.custom_price != null && <span>Prix perso.</span>}
                    {payment && <span>{payment.name}</span>}
                  </div>
                  {a.notes && <p className="mt-1 text-sm text-muted italic">{a.notes}</p>}
                </button>
              )
            })}
          </Card>
        )}
      </section>

      <AppointmentSheet target={target} onClose={() => setTarget(null)} />
    </div>
  )
}
