export type Service = {
  id: string
  name: string
  price: number
  duration_min: number | null
  /** Montant d'un pas de supplément pour cette pose (proposé 1× et 2× à la clôture) */
  supplement_step: number | null
  color: string
  sort_order: number
  archived: boolean
}

export type Status = {
  id: string
  name: string
  color: string
  counts_in_revenue: boolean
  is_default: boolean
  /** Sur l'accueil, ouvre la reprogrammation au lieu de clôturer (ex. Absente) */
  reschedule: boolean
  sort_order: number
  archived: boolean
}

export type PaymentMethod = {
  id: string
  name: string
  sort_order: number
  archived: boolean
}

export type DayOff = {
  id: string
  start_date: string
  end_date: string
  label: string
}

export type Client = {
  id: string
  name: string
  instagram: string | null
}

export type AppointmentService = {
  service_id: string
  price: number
  position: number
}

export type Appointment = {
  id: string
  client_id: string | null
  client_name: string
  start_at: string
  end_at: string
  status_id: string | null
  payment_method_id: string | null
  custom_price: number | null
  supplement: number
  notes: string | null
  client: { instagram: string | null } | null
  appointment_services: AppointmentService[]
}

export type AppointmentInput = {
  id?: string
  client_id: string | null
  client_name: string
  instagram: string | null
  start_at: string
  end_at: string
  status_id: string | null
  payment_method_id: string | null
  custom_price: number | null
  supplement: number
  notes: string | null
  service_ids: string[]
}
