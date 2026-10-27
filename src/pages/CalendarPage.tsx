import { useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import frLocale from '@fullcalendar/core/locales/fr'
import type { EventInput } from '@fullcalendar/core'
import { addDays, setHours, startOfHour, addHours } from 'date-fns'
import { Plus } from 'lucide-react'
import AppointmentSheet, { type SheetTarget } from '../components/AppointmentSheet'
import { useAppointments, useDaysOff, useMoveAppointment, useServices, useStatuses } from '../lib/queries'
import type { Appointment } from '../lib/types'
import { appointmentTotal, formatEur, toDateInput } from '../lib/format'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useOnline } from '../lib/useOnline'
import { useSwipeNavigation } from '../lib/useSwipeNavigation'

export default function CalendarPage() {
  const isWide = useMediaQuery('(min-width: 768px)')
  const online = useOnline()
  const [range, setRange] = useState<{ from: string; to: string; view: string } | null>(null)
  const [target, setTarget] = useState<SheetTarget | null>(null)

  const { data: appointments = [] } = useAppointments(range?.from ?? null, range?.to ?? null)
  const { data: services = [] } = useServices()
  const { data: statuses = [] } = useStatuses()
  const { data: daysOff = [] } = useDaysOff()
  const move = useMoveAppointment()

  const calendarRef = useRef<FullCalendar>(null)
  const swipeRef = useRef<HTMLDivElement>(null)
  const draggingEvent = useRef(false)
  useSwipeNavigation(swipeRef, {
    onPrev: () => calendarRef.current?.getApi().prev(),
    onNext: () => calendarRef.current?.getApi().next(),
    isBlocked: () => draggingEvent.current,
    targetSelector: '.fc-view-harness',
  })

  const events = useMemo<EventInput[]>(() => {
    const isMonth = range?.view === 'dayGridMonth'
    const offEvents: EventInput[] = daysOff.map((d) => ({
      id: `off-${d.id}`,
      title: d.label,
      start: d.start_date,
      end: toDateInput(addDays(new Date(`${d.end_date}T00:00`), 1)) + (isMonth ? '' : 'T00:00'),
      allDay: isMonth,
      display: 'background',
      classNames: ['day-off'],
    }))

    const apptEvents: EventInput[] = appointments.map((a) => {
      const first = [...a.appointment_services].sort((x, y) => x.position - y.position)[0]
      const service = first && services.find((s) => s.id === first.service_id)
      const status = statuses.find((s) => s.id === a.status_id)
      const names = [...a.appointment_services]
        .sort((x, y) => x.position - y.position)
        .map((as) => services.find((s) => s.id === as.service_id)?.name)
        .filter(Boolean)
        .join(' + ')
      return {
        id: a.id,
        title: a.client_name,
        start: a.start_at,
        end: a.end_at,
        backgroundColor: service?.color ?? '#8a8a8a',
        borderColor: service?.color ?? '#8a8a8a',
        classNames: status && !status.counts_in_revenue ? ['ev-cancelled'] : [],
        extendedProps: { appointment: a, detail: [names, formatEur(appointmentTotal(a))].filter(Boolean).join(' · ') },
      }
    })
    return [...offEvents, ...apptEvents]
  }, [appointments, services, statuses, daysOff, range?.view])

  function openNew(start: Date, end: Date | null = null) {
    if (!online) return
    setTarget({ start, end })
  }

  return (
    <div className="flex h-full flex-col p-2 md:p-4">
      <div ref={swipeRef} className="min-h-0 flex-1 touch-pan-y overflow-hidden rounded-2xl border border-line bg-surface p-2 md:p-3">
        <FullCalendar
          ref={calendarRef}
          key={isWide ? 'wide' : 'narrow'}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          locale={frLocale}
          // Vue 3 jours façon Outlook mobile : 7 colonnes sont trop serrées sur iPhone
          views={{ timeGrid3Days: { type: 'timeGrid', duration: { days: 3 }, buttonText: '3 jours' } }}
          initialView={isWide ? 'timeGridWeek' : 'timeGrid3Days'}
          headerToolbar={
            isWide
              ? { left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGrid3Days,timeGridWeek,dayGridMonth' }
              : { left: 'prev,next', center: 'title', right: 'today' }
          }
          footerToolbar={isWide ? undefined : { center: 'timeGridDay,timeGrid3Days,timeGridWeek,dayGridMonth' }}
          buttonText={{ today: "Aujourd'hui", day: 'Jour', week: 'Semaine', month: 'Mois' }}
          height="100%"
          allDaySlot={false}
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          scrollTime="08:30:00"
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          nowIndicator
          dayMaxEvents={3}
          weekNumbers={false}
          editable={online}
          eventDurationEditable={online}
          selectable={online && isWide}
          selectMirror
          longPressDelay={350}
          events={events}
          datesSet={(arg) => setRange({ from: arg.start.toISOString(), to: arg.end.toISOString(), view: arg.view.type })}
          select={(arg) => {
            arg.view.calendar.unselect()
            if (arg.allDay) openNew(setHours(arg.start, 9))
            else openNew(arg.start, arg.end)
          }}
          dateClick={(arg) => {
            // Sur grand écran, le clic est géré par `select`
            if (isWide && arg.view.type !== 'dayGridMonth') return
            if (arg.allDay) {
              if (isWide) return
              arg.view.calendar.changeView('timeGridDay', arg.date)
              return
            }
            openNew(arg.date)
          }}
          eventClick={(arg) => {
            const appointment = arg.event.extendedProps.appointment as Appointment | undefined
            if (appointment) setTarget({ appointment })
          }}
          eventDragStart={() => { draggingEvent.current = true }}
          eventDragStop={() => { draggingEvent.current = false }}
          eventResizeStart={() => { draggingEvent.current = true }}
          eventResizeStop={() => { draggingEvent.current = false }}
          eventChange={(arg) => {
            if (!arg.event.start || !arg.event.end) return arg.revert()
            move.mutate(
              { id: arg.event.id, start_at: arg.event.start.toISOString(), end_at: arg.event.end.toISOString() },
              { onError: () => arg.revert() },
            )
          }}
          eventContent={(arg) => {
            if (arg.event.display === 'background') return undefined
            const detail = arg.event.extendedProps.detail as string
            if (arg.view.type === 'dayGridMonth') {
              return (
                <div className="flex items-center gap-1 overflow-hidden px-1 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: arg.backgroundColor }} />
                  <span className="truncate">
                    {arg.timeText} {arg.event.title}
                  </span>
                </div>
              )
            }
            return (
              <div className="overflow-hidden leading-tight text-white">
                <div className="text-[11px] opacity-90">{arg.timeText}</div>
                <div className="truncate text-[13px] font-semibold">{arg.event.title}</div>
                {detail && <div className="truncate text-[11px] opacity-90">{detail}</div>}
              </div>
            )
          }}
        />
      </div>

      {online && (
        <button
          onClick={() => openNew(startOfHour(addHours(new Date(), 1)))}
          className="fixed right-5 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-20 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform active:scale-90 md:right-8 md:bottom-8"
          aria-label="Nouveau rendez-vous"
        >
          <Plus size={28} />
        </button>
      )}

      <AppointmentSheet target={target} onClose={() => setTarget(null)} />
    </div>
  )
}

