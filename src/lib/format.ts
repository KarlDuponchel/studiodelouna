import type { Appointment, AppointmentService, Service } from './types'

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

export const formatEur = (n: number) => eur.format(n)

export function formatDuration(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} min`
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/** Prix des prestations d'un RDV : prix personnalisé s'il existe, sinon leur somme (hors suppléments). */
export function appointmentServicesPrice(a: Pick<Appointment, 'custom_price' | 'appointment_services'>) {
  if (a.custom_price != null) return Number(a.custom_price)
  return a.appointment_services.reduce((sum, s) => sum + Number(s.price), 0)
}

/** Montant total d'un RDV : prestations + suppléments. */
export function appointmentTotal(a: Pick<Appointment, 'custom_price' | 'supplement' | 'appointment_services'>) {
  return appointmentServicesPrice(a) + Number(a.supplement ?? 0)
}

/** Une prestation compte dans les stats sauf si elle est explicitement exclue (colonne absente : elle compte) */
export const serviceCountsInStats = (as: AppointmentService, services: Service[]) =>
  services.find((s) => s.id === as.service_id)?.counts_in_stats !== false

/**
 * Un RDV compte dans les stats s'il a au moins une prestation qui compte.
 * Un RDV fait uniquement de prestations exclues (ex. « Perso ») est ignoré partout.
 */
export function appointmentCountsInStats(a: Pick<Appointment, 'appointment_services'>, services: Service[]) {
  return !a.appointment_services.length || a.appointment_services.some((as) => serviceCountsInStats(as, services))
}

/** Plage horaire affichée dans l'agenda : un RDV en dehors n'y est pas visible */
export const AGENDA_START_HOUR = 7
export const AGENDA_END_HOUR = 21

export function isOutsideAgendaHours(start: Date, end: Date) {
  const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  return (
    start < new Date(dayStart.getTime() + AGENDA_START_HOUR * 3_600_000) ||
    end > new Date(dayStart.getTime() + AGENDA_END_HOUR * 3_600_000)
  )
}

/** Durées proposées en un clic dans les formulaires de RDV (minutes) */
export const QUICK_DURATIONS = [30, 60, 75, 90, 120]

/** Pas de supplément d'un RDV : le plus grand parmi ses prestations, 5 € à défaut. */
export function supplementStep(services: Service[], serviceIds: string[]) {
  const steps = serviceIds.map((id) => Number(services.find((s) => s.id === id)?.supplement_step ?? 0))
  return Math.max(0, ...steps) || 5
}

/** "2026-10-27T09:30" pour les champs <input type="datetime-local"> */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function toDateInput(d: Date) {
  return toLocalInput(d).slice(0, 10)
}

export const PALETTE = [
  '#b4566e', '#d98ba0', '#e0a458', '#c9b458', '#6fa86b', '#4f9d9a',
  '#5b8dd6', '#8a6fd1', '#c06ad0', '#8a8a8a', '#5b4a44', '#d0703c',
]
