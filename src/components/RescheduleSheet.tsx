import { useMemo, useRef, useState } from 'react'
import { addDays, addMinutes, differenceInMinutes, format } from 'date-fns'
import { clsx } from 'clsx'
import { useDaysOff, useRescheduleAppointment, useStatuses } from '../lib/queries'
import type { Appointment, Status } from '../lib/types'
import { formatDuration, isOutsideAgendaHours, QUICK_DURATIONS } from '../lib/format'
import { Button, ErrorText, Field, Input, OutsideHoursWarning, Sheet, Warning, type SheetHandle } from './ui'

/**
 * Cliente absente : choisir une nouvelle date et, au besoin, une autre durée.
 * Le RDV repasse au statut par défaut. On peut aussi le marquer absent sans le reprogrammer.
 */
export default function RescheduleSheet({ appointment: a, status, onMarkOnly, onClose }: {
  appointment: Appointment
  status: Status
  onMarkOnly: () => void
  onClose: () => void
}) {
  const sheet = useRef<SheetHandle>(null)
  const { data: statuses = [] } = useStatuses()
  const { data: daysOff = [] } = useDaysOff()
  const reschedule = useRescheduleAppointment()

  const oldStart = new Date(a.start_at)
  // Par défaut : même jour, même heure et même durée la semaine suivante
  const [date, setDate] = useState(format(addDays(oldStart, 7), 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState(format(oldStart, 'HH:mm'))
  const [endTime, setEndTime] = useState(format(new Date(a.end_at), 'HH:mm'))

  const start = new Date(`${date}T${startTime}`)
  const end = new Date(`${date}T${endTime}`)
  const durationMin = differenceInMinutes(end, start)
  const valid = !isNaN(start.getTime()) && !isNaN(end.getTime()) && durationMin > 0

  function onStartChange(value: string) {
    // On décale la fin pour garder la même durée
    const newStart = new Date(`${date}T${value}`)
    if (!isNaN(newStart.getTime()) && durationMin > 0) setEndTime(format(addMinutes(newStart, durationMin), 'HH:mm'))
    setStartTime(value)
  }
  const dayOff = useMemo(() => daysOff.find((d) => date >= d.start_date && date <= d.end_date), [daysOff, date])
  const defaultStatus = statuses.find((s) => s.is_default && !s.archived)

  async function submit() {
    if (!valid) return
    await reschedule.mutateAsync({
      id: a.id,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status_id: defaultStatus?.id ?? null,
    })
    sheet.current?.close()
  }

  return (
    <Sheet
      ref={sheet}
      open
      onClose={onClose}
      title="Reprogrammer le rendez-vous"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            onClick={() => {
              onMarkOnly()
              sheet.current?.close()
            }}
          >
            Marquer « {status.name} » seulement
          </Button>
          <Button onClick={submit} disabled={!valid || reschedule.isPending}>
            {reschedule.isPending ? 'Enregistrement…' : 'Reprogrammer'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p>
          Nouvelle date pour <span className="font-semibold">{a.client_name}</span>. Le rendez-vous repassera en
          « {defaultStatus?.name ?? 'Prévu'} ».
        </p>
        <Field label="Date">
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
        </Field>
        {dayOff && <Warning>Jour off : {dayOff.label}</Warning>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Début">
            <Input type="time" step={300} required value={startTime} onChange={(e) => onStartChange(e.target.value)} />
          </Field>
          <Field label="Fin">
            <Input type="time" step={300} required value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_DURATIONS.map((m) => (
            <button
              key={m}
              type="button"
              disabled={isNaN(start.getTime())}
              onClick={() => setEndTime(format(addMinutes(start, m), 'HH:mm'))}
              className={clsx(
                'min-h-9 rounded-full border px-3 text-sm transition duration-200 active:scale-95',
                durationMin === m ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface',
              )}
            >
              {formatDuration(m)}
            </button>
          ))}
          {durationMin > 0 && !QUICK_DURATIONS.includes(durationMin) && (
            <span className="text-sm text-muted">{formatDuration(durationMin)}</span>
          )}
        </div>
        {!valid && <p className="text-sm text-danger">L'heure de fin doit être après l'heure de début</p>}
        {valid && isOutsideAgendaHours(start, end) && <OutsideHoursWarning />}
        <ErrorText error={reschedule.error} />
      </div>
    </Sheet>
  )
}
