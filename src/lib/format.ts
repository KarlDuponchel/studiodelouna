import type { Appointment } from './types'

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

export const formatEur = (n: number) => eur.format(n)

export function formatDuration(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} min`
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/** Montant d'un RDV : prix personnalisé s'il existe, sinon somme des prestations. */
export function appointmentTotal(a: Pick<Appointment, 'custom_price' | 'appointment_services'>) {
  if (a.custom_price != null) return Number(a.custom_price)
  return a.appointment_services.reduce((sum, s) => sum + Number(s.price), 0)
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
