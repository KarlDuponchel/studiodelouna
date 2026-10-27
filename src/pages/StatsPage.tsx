import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays, addMonths, addWeeks, addYears, eachDayOfInterval, eachMonthOfInterval, endOfMonth, endOfWeek, endOfYear,
  format, startOfMonth, startOfWeek, startOfYear, subDays,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Table2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAppointments, usePaymentMethods, useServices, useStatuses } from '../lib/queries'
import type { Appointment, Status, Service } from '../lib/types'
import { appointmentServicesPrice, appointmentTotal, formatEur, appointmentCountsInStats, serviceCountsInStats } from '../lib/format'
import { Card, ColorDot } from '../components/ui'

type Period = 'day' | 'week' | 'month' | 'year'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
  { key: 'year', label: 'Année' },
]

function bounds(period: Period, ref: Date): [Date, Date] {
  switch (period) {
    case 'day': {
      const s = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
      return [s, addDays(s, 1)]
    }
    case 'week': {
      const s = startOfWeek(ref, { weekStartsOn: 1 })
      return [s, addDays(endOfWeek(ref, { weekStartsOn: 1 }), 1)]
    }
    case 'month':
      return [startOfMonth(ref), addDays(endOfMonth(ref), 1)]
    case 'year':
      return [startOfYear(ref), addDays(endOfYear(ref), 1)]
  }
}

function shift(period: Period, ref: Date, n: number) {
  return period === 'day' ? addDays(ref, n) : period === 'week' ? addWeeks(ref, n) : period === 'month' ? addMonths(ref, n) : addYears(ref, n)
}

function title(period: Period, [s, e]: [Date, Date]) {
  if (period === 'day') return format(s, 'EEEE d MMMM yyyy', { locale: fr })
  if (period === 'week') return `${format(s, 'd MMM', { locale: fr })} – ${format(subDays(e, 1), 'd MMM yyyy', { locale: fr })}`
  if (period === 'month') return format(s, 'MMMM yyyy', { locale: fr })
  return format(s, 'yyyy')
}

const PREVIOUS_LABEL: Record<Period, string> = { day: 'la veille', week: 'la semaine précédente', month: 'le mois précédent', year: "l'année précédente" }

function summarize(appts: Appointment[], statuses: Status[], serviceList: Service[]) {
  const counted = appts.filter((a) => statuses.find((s) => s.id === a.status_id)?.counts_in_revenue ?? true)
  const servicesRevenue = counted.reduce((sum, a) => sum + appointmentServicesPrice(a), 0)
  const supplementsRevenue = counted.reduce((sum, a) => sum + Number(a.supplement ?? 0), 0)
  const services = counted.reduce((n, a) => n + a.appointment_services.filter((as) => serviceCountsInStats(as, serviceList)).length, 0)
  return { counted, revenue: servicesRevenue + supplementsRevenue, servicesRevenue, supplementsRevenue, services }
}

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [ref, setRef] = useState(new Date())

  const range = bounds(period, ref)
  const prevRange = bounds(period, shift(period, ref, -1))

  const { data: allAppts = [], isLoading } = useAppointments(range[0].toISOString(), range[1].toISOString())
  const { data: allPrevAppts = [] } = useAppointments(prevRange[0].toISOString(), prevRange[1].toISOString())
  const { data: statuses = [] } = useStatuses()
  const { data: services = [] } = useServices()
  // Les RDV faits uniquement de prestations hors stats (ex. « Perso ») sont ignorés partout ici
  const appts = useMemo(() => allAppts.filter((a) => appointmentCountsInStats(a, services)), [allAppts, services])
  const prevAppts = useMemo(() => allPrevAppts.filter((a) => appointmentCountsInStats(a, services)), [allPrevAppts, services])
  const { data: payments = [] } = usePaymentMethods()

  // Un RDV appartient à la période de son heure de début
  const inRange = (a: Appointment, [s, e]: [Date, Date]) => {
    const t = new Date(a.start_at).getTime()
    return t >= s.getTime() && t < e.getTime()
  }
  const current = summarize(appts.filter((a) => inRange(a, range)), statuses, services)
  const previous = summarize(prevAppts.filter((a) => inRange(a, prevRange)), statuses, services)

  const byService = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>()
    for (const a of current.counted) {
      // Avec un prix personnalisé, on le répartit au prorata des prix des prestations (hors suppléments)
      const base = a.appointment_services.reduce((s, x) => s + Number(x.price), 0)
      const total = appointmentServicesPrice(a)
      for (const as of a.appointment_services) {
        if (!serviceCountsInStats(as, services)) continue
        const share = base > 0 ? (Number(as.price) / base) * total : total / a.appointment_services.length
        const cur = map.get(as.service_id) ?? { count: 0, revenue: 0 }
        map.set(as.service_id, { count: cur.count + 1, revenue: cur.revenue + share })
      }
    }
    return [...map.entries()]
      .map(([id, v]) => ({ ...v, service: services.find((s) => s.id === id) }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [current.counted, services])

  const byPayment = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of current.counted) map.set(a.payment_method_id ?? '', (map.get(a.payment_method_id ?? '') ?? 0) + appointmentTotal(a))
    return [...map.entries()]
      .map(([id, revenue]) => ({ name: payments.find((p) => p.id === id)?.name ?? 'Non renseigné', revenue }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [current.counted, payments])

  const byStatus = useMemo(() => {
    const list = appts.filter((a) => inRange(a, range))
    return statuses
      .map((s) => ({ status: s, count: list.filter((a) => a.status_id === s.id).length }))
      .filter((x) => x.count > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appts, statuses, range[0].getTime()])

  // Histogramme : par jour (semaine, mois) ou par mois (année)
  const chart = useMemo(() => {
    if (period === 'day') return []
    const buckets = period === 'year'
      ? eachMonthOfInterval({ start: range[0], end: subDays(range[1], 1) })
      : eachDayOfInterval({ start: range[0], end: subDays(range[1], 1) })
    return buckets.map((b) => {
      const end = period === 'year' ? addMonths(b, 1) : addDays(b, 1)
      const revenue = current.counted.filter((a) => inRange(a, [b, end])).reduce((s, a) => s + appointmentTotal(a), 0)
      const label = period === 'year' ? format(b, 'MMM', { locale: fr }) : period === 'week' ? format(b, 'EEE', { locale: fr }) : format(b, 'd')
      return { label, revenue }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, current.counted, range[0].getTime()])

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Statistiques</h1>
        <Link to="/stats/tableau" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium transition hover:bg-accent-soft active:scale-[0.98]">
          <Table2 size={18} /> Tableau mensuel
        </Link>
      </div>

      <div className="relative flex rounded-xl border border-line bg-surface p-1">
        {/* Pastille qui glisse sous l'onglet actif */}
        <span
          aria-hidden
          className="absolute top-1 bottom-1 left-1 rounded-lg bg-accent transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{
            width: `calc((100% - 0.5rem) / ${PERIODS.length})`,
            transform: `translateX(${PERIODS.findIndex((p) => p.key === period) * 100}%)`,
          }}
        />
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={clsx('relative min-h-10 flex-1 rounded-lg text-sm font-medium transition-colors duration-300', period === p.key ? 'text-white' : 'text-muted')}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button aria-label="Période précédente" onClick={() => setRef(shift(period, ref, -1))} className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-accent-soft active:scale-90">
          <ChevronLeft />
        </button>
        <button onClick={() => setRef(new Date())} className="text-lg font-semibold capitalize">
          {title(period, range)}
        </button>
        <button aria-label="Période suivante" onClick={() => setRef(shift(period, ref, 1))} className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-accent-soft active:scale-90">
          <ChevronRight />
        </button>
      </div>

      <div className={clsx('grid grid-cols-2 gap-3 md:grid-cols-3', isLoading && 'opacity-60')}>
        <Kpi label="CA total" value={current.revenue} format={formatEur} cur={current.revenue} prev={previous.revenue} prevLabel={PREVIOUS_LABEL[period]} />
        <Kpi label="CA prestations" value={current.servicesRevenue} format={formatEur} cur={current.servicesRevenue} prev={previous.servicesRevenue} prevLabel={PREVIOUS_LABEL[period]} />
        <Kpi label="CA suppléments" value={current.supplementsRevenue} format={formatEur} cur={current.supplementsRevenue} prev={previous.supplementsRevenue} prevLabel={PREVIOUS_LABEL[period]} />
        <Kpi label="Rendez-vous" value={current.counted.length} format={formatInt} cur={current.counted.length} prev={previous.counted.length} prevLabel={PREVIOUS_LABEL[period]} />
        <Kpi label="Prestations" value={current.services} format={formatInt} cur={current.services} prev={previous.services} prevLabel={PREVIOUS_LABEL[period]} />
        <Kpi label="Panier moyen" value={current.counted.length ? current.revenue / current.counted.length : null} format={formatEur} />
      </div>

      {chart.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Évolution du CA</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} interval="preserveStartEnd" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} tickFormatter={(v) => `${v} €`} />
                <Tooltip formatter={(v) => [formatEur(Number(v)), 'CA']} cursor={{ fill: 'var(--color-accent-soft)' }} />
                <Bar dataKey="revenue" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Par prestation <span className="text-sm font-normal text-muted">(hors suppléments)</span></h2>
          {byService.length === 0 ? <Empty /> : (
            <ul className="space-y-3">
              {byService.map(({ service, count, revenue }) => (
                <li key={service?.id ?? 'x'}>
                  <div className="mb-1 flex items-center gap-2 text-sm">
                    <ColorDot color={service?.color ?? '#8a8a8a'} />
                    <span className="flex-1 truncate">{service?.name ?? 'Prestation supprimée'}</span>
                    <span className="text-muted">× {count}</span>
                    <span className="w-20 text-right font-medium">{formatEur(revenue)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg">
                    <div className="grow-x h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]" style={{ width: `${current.servicesRevenue ? (revenue / current.servicesRevenue) * 100 : 0}%`, background: service?.color ?? '#8a8a8a' }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Par mode de paiement</h2>
            {byPayment.length === 0 ? <Empty /> : (
              <ul className="space-y-2 text-sm">
                {byPayment.map((p) => (
                  <li key={p.name} className="flex justify-between">
                    <span>{p.name}</span>
                    <span className="font-medium">{formatEur(p.revenue)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Par statut</h2>
            {byStatus.length === 0 ? <Empty /> : (
              <ul className="space-y-2 text-sm">
                {byStatus.map(({ status, count }) => (
                  <li key={status.id} className="flex items-center gap-2">
                    <ColorDot color={status.color} />
                    <span className="flex-1">{status.name}</span>
                    <span className="font-medium">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

const formatInt = (n: number) => String(Math.round(n))

/** Fait défiler un nombre de sa valeur précédente vers la nouvelle. */
function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const origin = from.current
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 600)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = origin + (value - origin) * eased
      from.current = v
      setShown(v)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return <>{format(shown)}</>
}

function Kpi({ label, value, format, cur, prev, prevLabel }: {
  label: string
  value: number | null
  format: (n: number) => string
  cur?: number
  prev?: number
  prevLabel?: string
}) {
  let delta: string | null = null
  let up = true
  if (cur !== undefined && prev !== undefined) {
    if (prev > 0) {
      const pct = Math.round(((cur - prev) / prev) * 100)
      up = pct >= 0
      delta = `${pct >= 0 ? '+' : ''}${pct} %`
    } else if (cur > 0) delta = 'nouveau'
  }
  return (
    <Card className="p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value === null ? '—' : <AnimatedNumber value={value} format={format} />}</div>
      {delta && (
        <div className={clsx('pop-in mt-1 text-xs', up ? 'text-emerald-700' : 'text-danger')}>
          {delta} <span className="text-muted">vs {prevLabel}</span>
        </div>
      )}
    </Card>
  )
}

function Empty() {
  return <p className="text-sm text-muted">Aucune donnée sur la période.</p>
}
