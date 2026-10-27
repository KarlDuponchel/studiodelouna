import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { addMinutes, differenceInMinutes, format } from 'date-fns'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useDaysOff, useDeleteAppointment, usePaymentMethods, useSaveAppointment, useServices, useStatuses } from '../lib/queries'
import type { Appointment } from '../lib/types'
import { formatDuration, formatEur } from '../lib/format'
import { useOnline } from '../lib/useOnline'
import ClientAutocomplete from './ClientAutocomplete'
import ServicePicker from './ServicePicker'
import { Button, ErrorText, Field, Input, Select, Sheet, Textarea, Toggle } from './ui'

export type SheetTarget = { appointment: Appointment } | { start: Date; end: Date | null }

const QUICK_DURATIONS = [30, 60, 90, 120]

export default function AppointmentSheet({ target, onClose }: { target: SheetTarget | null; onClose: () => void }) {
  return (
    <Sheet open={target !== null} onClose={onClose} title={target && 'appointment' in target ? 'Rendez-vous' : 'Nouveau rendez-vous'}>
      {target && <AppointmentForm key={'appointment' in target ? target.appointment.id : target.start.toISOString()} target={target} onDone={onClose} />}
    </Sheet>
  )
}

function AppointmentForm({ target, onDone }: { target: SheetTarget; onDone: () => void }) {
  const existing = 'appointment' in target ? target.appointment : null
  const online = useOnline()
  const readOnly = !online

  const { data: services = [] } = useServices()
  const { data: statuses = [] } = useStatuses()
  const { data: paymentMethods = [] } = usePaymentMethods()
  const { data: daysOff = [] } = useDaysOff()
  const save = useSaveAppointment()
  const remove = useDeleteAppointment()

  const initialStart = existing ? new Date(existing.start_at) : (target as { start: Date }).start
  const initialEnd = existing
    ? new Date(existing.end_at)
    : ((target as { end: Date | null }).end ?? addMinutes(initialStart, 60))

  const [clientName, setClientName] = useState(existing?.client_name ?? '')
  const [clientId, setClientId] = useState<string | null>(existing?.client_id ?? null)
  const [instagram, setInstagram] = useState(existing?.client?.instagram ?? '')
  const [date, setDate] = useState(format(initialStart, 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState(format(initialStart, 'HH:mm'))
  const [endTime, setEndTime] = useState(format(initialEnd, 'HH:mm'))
  const [serviceIds, setServiceIds] = useState<string[]>(
    existing ? [...existing.appointment_services].sort((a, b) => a.position - b.position).map((s) => s.service_id) : [],
  )
  const [statusId, setStatusId] = useState<string>(existing?.status_id ?? '')
  const [paymentMethodId, setPaymentMethodId] = useState<string>(existing?.payment_method_id ?? '')
  const [customPriceOn, setCustomPriceOn] = useState(existing?.custom_price != null)
  const [customPrice, setCustomPrice] = useState(existing?.custom_price != null ? String(existing.custom_price) : '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Tant que l'heure de fin n'a pas été touchée à la main, elle suit la durée des prestations
  const endTouched = useRef(Boolean(existing) || Boolean(!existing && (target as { end: Date | null }).end))

  // Statut par défaut une fois les statuts chargés
  useEffect(() => {
    if (!statusId && statuses.length) {
      setStatusId((statuses.find((s) => s.is_default && !s.archived) ?? statuses[0]).id)
    }
  }, [statuses, statusId])

  const start = new Date(`${date}T${startTime}`)
  const end = new Date(`${date}T${endTime}`)
  const durationMin = differenceInMinutes(end, start)

  const selectedServices = serviceIds.map((id) => services.find((s) => s.id === id)).filter((s) => s !== undefined)
  const servicesDuration = selectedServices.reduce((sum, s) => sum + (s.duration_min ?? 0), 0)

  // Prix : figé pour les prestations déjà enregistrées, prix courant pour les nouvelles
  const servicesTotal = selectedServices.reduce((sum, s) => {
    const saved = existing?.appointment_services.find((as) => as.service_id === s.id)
    return sum + Number(saved ? saved.price : s.price)
  }, 0)

  function setDuration(min: number) {
    setEndTime(format(addMinutes(start, min), 'HH:mm'))
  }

  function onServicesChange(ids: string[]) {
    setServiceIds(ids)
    if (endTouched.current) return
    const total = ids.reduce((sum, id) => sum + (services.find((s) => s.id === id)?.duration_min ?? 0), 0)
    if (total > 0) setEndTime(format(addMinutes(start, total), 'HH:mm'))
  }

  function onStartChange(value: string) {
    // On décale la fin pour garder la même durée
    const newStart = new Date(`${date}T${value}`)
    if (!isNaN(newStart.getTime()) && durationMin > 0) setEndTime(format(addMinutes(newStart, durationMin), 'HH:mm'))
    setStartTime(value)
  }

  const dayOff = useMemo(() => daysOff.find((d) => date >= d.start_date && date <= d.end_date), [daysOff, date])

  const invalidReason = !clientName.trim()
    ? 'Nom de la cliente requis'
    : isNaN(start.getTime()) || isNaN(end.getTime()) || durationMin <= 0
      ? "L'heure de fin doit être après l'heure de début"
      : customPriceOn && (customPrice === '' || Number(customPrice.replace(',', '.')) < 0)
        ? 'Prix personnalisé invalide'
        : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (invalidReason || readOnly) return
    await save.mutateAsync({
      id: existing?.id,
      client_id: clientId,
      client_name: clientName.trim(),
      instagram: instagram.trim() || null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status_id: statusId || null,
      payment_method_id: paymentMethodId || null,
      custom_price: customPriceOn ? Number(customPrice.replace(',', '.')) : null,
      notes: notes.trim() || null,
      service_ids: serviceIds,
    })
    onDone()
  }

  async function doDelete() {
    if (!existing) return
    await remove.mutateAsync(existing.id)
    onDone()
  }

  const activeStatuses = statuses.filter((s) => !s.archived || s.id === statusId)
  const activePayments = paymentMethods.filter((p) => !p.archived || p.id === paymentMethodId)

  return (
    <form onSubmit={submit} className="space-y-5">
      {readOnly && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Hors ligne : modification impossible.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cliente">
          <ClientAutocomplete
            name={clientName}
            clientId={clientId}
            disabled={readOnly}
            onChange={(name, client) => {
              setClientName(name)
              setClientId(client?.id ?? null)
              if (client) setInstagram(client.instagram ?? '')
            }}
          />
        </Field>
        <Field label="Instagram">
          <Input
            value={instagram}
            disabled={readOnly}
            placeholder="@pseudo"
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => setInstagram(e.target.value)}
          />
        </Field>
      </div>

      <div className="space-y-3">
        <Field label="Date">
          <Input type="date" required value={date} disabled={readOnly} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {dayOff && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle size={16} /> Jour off : {dayOff.label}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Début">
            <Input type="time" step={300} required value={startTime} disabled={readOnly} onChange={(e) => onStartChange(e.target.value)} />
          </Field>
          <Field label="Fin">
            <Input
              type="time"
              step={300}
              required
              value={endTime}
              disabled={readOnly}
              onChange={(e) => {
                endTouched.current = true
                setEndTime(e.target.value)
              }}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_DURATIONS.map((m) => (
            <button
              key={m}
              type="button"
              disabled={readOnly}
              onClick={() => {
                endTouched.current = true
                setDuration(m)
              }}
              className={clsx(
                'min-h-9 rounded-full border px-3 text-sm',
                durationMin === m ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface',
              )}
            >
              {formatDuration(m)}
            </button>
          ))}
          {servicesDuration > 0 && durationMin !== servicesDuration && (
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setDuration(servicesDuration)}
              className="min-h-9 rounded-full border border-dashed border-accent px-3 text-sm text-accent"
            >
              Durée des prestations : {formatDuration(servicesDuration)}
            </button>
          )}
          {durationMin > 0 && !QUICK_DURATIONS.includes(durationMin) && (
            <span className="text-sm text-muted">{formatDuration(durationMin)}</span>
          )}
        </div>
      </div>

      <Field label="Prestations">
        <ServicePicker services={services} value={serviceIds} disabled={readOnly} onChange={onServicesChange} />
      </Field>

      <div className="rounded-xl border border-line bg-surface px-3 py-2">
        <div className="flex items-center justify-between py-1">
          <span className="text-muted">Total prestations</span>
          <span className={clsx('font-semibold', customPriceOn && 'text-muted line-through')}>{formatEur(servicesTotal)}</span>
        </div>
        <Toggle label="Prix personnalisé" checked={customPriceOn} onChange={(v) => !readOnly && setCustomPriceOn(v)} />
        {customPriceOn && (
          <div className="pb-2">
            <Input
              inputMode="decimal"
              placeholder="Montant en €"
              value={customPrice}
              disabled={readOnly}
              autoFocus={!existing}
              onChange={(e) => setCustomPrice(e.target.value.replace(/[^0-9.,]/g, ''))}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Statut">
          <Select value={statusId} disabled={readOnly} onChange={(e) => setStatusId(e.target.value)}>
            {activeStatuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paiement">
          <Select value={paymentMethodId} disabled={readOnly} onChange={(e) => setPaymentMethodId(e.target.value)}>
            <option value="">—</option>
            {activePayments.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Notes">
        <Textarea rows={2} value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <ErrorText error={save.error ?? remove.error} />

      {!readOnly && (
        <div className="pb-safe flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {existing ? (
            confirmDelete ? (
              <div className="flex gap-2">
                <Button type="button" variant="danger" onClick={doDelete} disabled={remove.isPending}>
                  Confirmer la suppression
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Annuler
                </Button>
              </div>
            ) : (
              <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={18} /> Supprimer
              </Button>
            )
          ) : (
            <span />
          )}
          <Button type="submit" disabled={Boolean(invalidReason) || save.isPending} title={invalidReason ?? undefined}>
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      )}
      {invalidReason && clientName && <p className="text-right text-xs text-muted">{invalidReason}</p>}
    </form>
  )
}
