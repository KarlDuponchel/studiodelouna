import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Appointment, AppointmentInput, Client, DayOff, PaymentMethod, Service, Status } from './types'

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

// ---------------------------------------------------------------------------
// Paramètres (prestations, statuts, modes de paiement)
// ---------------------------------------------------------------------------

export type SettingsTable = 'services' | 'statuses' | 'payment_methods'
type SettingsRow = { services: Service; statuses: Status; payment_methods: PaymentMethod }

export function useSettingsList<T extends SettingsTable>(table: T) {
  return useQuery({
    queryKey: [table],
    queryFn: async () =>
      unwrap(await supabase.from(table).select('*').order('sort_order').order('name')) as SettingsRow[T][],
  })
}

export const useServices = () => useSettingsList('services')
export const useStatuses = () => useSettingsList('statuses')
export const usePaymentMethods = () => useSettingsList('payment_methods')

export function useSaveSetting<T extends SettingsTable>(table: T) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: Partial<SettingsRow[T]>) => {
      const { id, ...rest } = row as { id?: string }
      if (id) unwrap(await supabase.from(table).update(rest).eq('id', id).select())
      else unwrap(await supabase.from(table).insert(rest).select())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] })
      qc.invalidateQueries({ queryKey: ['appointments'] })
    },
  })
}

/** Supprime si jamais utilisé, sinon archive (pour garder l'historique). */
export function useDeleteSetting(table: SettingsTable) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<'deleted' | 'archived'> => {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (!error) return 'deleted'
      // 23503 = violation de clé étrangère : l'élément est utilisé par un RDV
      if (error.code === '23503') {
        unwrap(await supabase.from(table).update({ archived: true }).eq('id', id).select())
        return 'archived'
      }
      throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [table] }),
  })
}

export function useSetDefaultStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('statuses').update({ is_default: false }).neq('id', id).select())
      unwrap(await supabase.from('statuses').update({ is_default: true }).eq('id', id).select())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['statuses'] }),
  })
}

// ---------------------------------------------------------------------------
// Jours off
// ---------------------------------------------------------------------------

export function useDaysOff() {
  return useQuery({
    queryKey: ['days_off'],
    queryFn: async () =>
      unwrap(await supabase.from('days_off').select('*').order('start_date', { ascending: false })) as DayOff[],
  })
}

export function useSaveDayOff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: Omit<DayOff, 'id'> & { id?: string }) => {
      const { id, ...rest } = row
      if (id) unwrap(await supabase.from('days_off').update(rest).eq('id', id).select())
      else unwrap(await supabase.from('days_off').insert(rest).select())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['days_off'] }),
  })
}

export function useDeleteDayOff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('days_off').delete().eq('id', id).select())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['days_off'] }),
  })
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

/** Autocomplétion : à partir de 3 lettres, sur le début du nom ou d'un mot du nom. */
export function useClientSearch(term: string) {
  const q = term.trim()
  return useQuery({
    queryKey: ['clients', 'search', q.toLowerCase()],
    enabled: q.length >= 3,
    staleTime: 30_000,
    queryFn: async () => {
      const safe = q.replace(/[%_,()"\\]/g, '')
      return unwrap(
        await supabase
          .from('clients')
          .select('id, name, instagram')
          .or(`name.ilike."${safe}%",name.ilike."% ${safe}%"`)
          .order('name')
          .limit(8),
      ) as Client[]
    },
  })
}

// ---------------------------------------------------------------------------
// Rendez-vous
// ---------------------------------------------------------------------------

const APPOINTMENT_SELECT =
  'id, client_id, client_name, start_at, end_at, status_id, payment_method_id, custom_price, notes, client:clients(instagram), appointment_services(service_id, price, position)'

export function useAppointments(from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['appointments', from, to],
    enabled: Boolean(from && to),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('appointments')
          .select(APPOINTMENT_SELECT)
          .lt('start_at', to!)
          .gt('end_at', from!)
          .order('start_at'),
      ) as unknown as Appointment[],
  })
}

export function useSaveAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AppointmentInput) =>
      unwrap(await supabase.rpc('save_appointment', { payload: input })) as string,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
    },
  })
}

/** Déplacement / redimensionnement depuis le calendrier */
export function useMoveAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, start_at, end_at }: { id: string; start_at: string; end_at: string }) => {
      unwrap(
        await supabase
          .from('appointments')
          .update({ start_at, end_at, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select(),
      )
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  })
}

export function useDeleteAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('appointments').delete().eq('id', id).select())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  })
}

// ---------------------------------------------------------------------------
// Export de sauvegarde
// ---------------------------------------------------------------------------

export async function exportAll() {
  const tables = ['services', 'statuses', 'payment_methods', 'days_off', 'clients', 'appointments', 'appointment_services']
  const out: Record<string, unknown> = { exported_at: new Date().toISOString() }
  for (const t of tables) out[t] = unwrap(await supabase.from(t).select('*'))
  return out
}
