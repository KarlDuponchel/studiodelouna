import { useMemo, useState } from 'react'
import { addMonths, format, startOfMonth } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import AppointmentSheet, { type SheetTarget } from '../components/AppointmentSheet'
import { useAppointments, usePaymentMethods, useServices, useStatuses } from '../lib/queries'
import { appointmentServicesPrice, formatEur, appointmentCountsInStats } from '../lib/format'
import { Card, ColorDot } from '../components/ui'

type SortKey = 'date' | 'services' | 'supplement' | 'total'

const COLUMNS: { key: SortKey | null; label: string; numeric?: boolean }[] = [
  { key: null, label: 'Nom' },
  { key: 'date', label: 'Date' },
  { key: null, label: 'Paiement' },
  { key: 'services', label: 'Prestation', numeric: true },
  { key: 'supplement', label: 'Suppléments', numeric: true },
  { key: 'total', label: 'Total', numeric: true },
]

/** Récapitulatif mensuel des RDV comptés dans le CA, triable par date et par prix */
export default function TablePage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: false })
  const [target, setTarget] = useState<SheetTarget | null>(null)

  const next = addMonths(month, 1)
  const { data: appointments = [], isLoading } = useAppointments(month.toISOString(), next.toISOString())
  const { data: statuses = [] } = useStatuses()
  const { data: serviceList = [] } = useServices()
  const { data: paymentMethods = [] } = usePaymentMethods()

  const rows = useMemo(() => {
    const list = appointments
      // Un RDV appartient au mois de son heure de début
      .filter((a) => new Date(a.start_at) >= month && new Date(a.start_at) < next)
      .filter((a) => statuses.find((s) => s.id === a.status_id)?.counts_in_revenue ?? true)
      .filter((a) => appointmentCountsInStats(a, serviceList))
      .map((a) => {
        const services = appointmentServicesPrice(a)
        const supplement = Number(a.supplement ?? 0)
        return {
          appointment: a,
          date: new Date(a.start_at),
          status: statuses.find((s) => s.id === a.status_id),
          payment: paymentMethods.find((p) => p.id === a.payment_method_id)?.name,
          services,
          supplement,
          total: services + supplement,
        }
      })
    const value = (r: (typeof list)[number]) => (sort.key === 'date' ? r.date.getTime() : r[sort.key])
    return list.sort((x, y) => (value(x) - value(y)) * (sort.desc ? -1 : 1) || x.date.getTime() - y.date.getTime())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments, statuses, serviceList, paymentMethods, sort, month.getTime()])

  const totals = rows.reduce(
    (t, r) => ({ services: t.services + r.services, supplement: t.supplement + r.supplement, total: t.total + r.total }),
    { services: 0, supplement: 0, total: 0 },
  )

  function toggleSort(key: SortKey) {
    // Premier clic : date croissante, prix décroissants
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'date' }))
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Tableau mensuel</h1>

      <div className="flex items-center justify-between">
        <button aria-label="Mois précédent" onClick={() => setMonth(addMonths(month, -1))} className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-accent-soft active:scale-90">
          <ChevronLeft />
        </button>
        <button onClick={() => setMonth(startOfMonth(new Date()))} className="text-lg font-semibold capitalize">
          {format(month, 'MMMM yyyy', { locale: fr })}
        </button>
        <button aria-label="Mois suivant" onClick={() => setMonth(next)} className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-accent-soft active:scale-90">
          <ChevronRight />
        </button>
      </div>

      <Card className={clsx('overflow-x-auto', isLoading && 'opacity-60')}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              {COLUMNS.map((c) => (
                <th key={c.label} className={clsx('px-3 py-2 font-medium', c.numeric && 'text-right')} aria-sort={c.key && sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                  {c.key ? (
                    <button
                      onClick={() => toggleSort(c.key!)}
                      className={clsx('inline-flex min-h-9 items-center gap-1 transition-colors hover:text-ink', sort.key === c.key && 'text-accent')}
                    >
                      {c.label}
                      {sort.key === c.key && (sort.desc ? <ArrowDown size={14} /> : <ArrowUp size={14} />)}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.appointment.id} onClick={() => setTarget({ appointment: r.appointment })} className="cursor-pointer transition hover:bg-bg">
                <td className="max-w-48 truncate px-3 py-2.5 font-medium">{r.appointment.client_name}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5" title={r.status?.name}>
                    {r.status && <ColorDot color={r.status.color} size={8} />}
                    {format(r.date, 'EEE dd/MM HH:mm', { locale: fr })}
                  </span>
                </td>
                <td className={clsx('px-3 py-2.5', !r.payment && 'text-muted')}>{r.payment ?? '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatEur(r.services)}</td>
                <td className={clsx('px-3 py-2.5 text-right tabular-nums', !r.supplement && 'text-muted')}>{r.supplement ? formatEur(r.supplement) : '—'}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatEur(r.total)}</td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-muted">
                  Aucun rendez-vous ce mois-ci
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-line font-semibold">
                <td className="px-3 py-2.5" colSpan={3}>
                  Total · {rows.length} RDV
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatEur(totals.services)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatEur(totals.supplement)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatEur(totals.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
      <p className="text-xs text-muted">Les RDV annulés, les absences et les prestations hors statistiques (ex. « Perso ») ne sont pas comptés. La pastille indique le statut.</p>

      <AppointmentSheet target={target} onClose={() => setTarget(null)} />
    </div>
  )
}
