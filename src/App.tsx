import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import MfaPage from './pages/MfaPage'
import HomePage from './pages/HomePage'
import CalendarPage from './pages/CalendarPage'

const StatsPage = lazy(() => import('./pages/StatsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ClientsPage = lazy(() => import('./pages/ClientsPage'))
const TablePage = lazy(() => import('./pages/TablePage'))

export default function App() {
  const { session, loading, mfa } = useAuth()

  if (loading) return null
  if (!session) return <LoginPage />
  // Rien n'est affiché (ni le cache local) tant que la 2FA n'est pas validée
  if (mfa === 'loading') return null
  if (mfa !== 'ok') return <MfaPage />

  return (
    <Suspense>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="agenda" element={<CalendarPage />} />
          <Route path="clientes/:id?" element={<ClientsPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="stats/tableau" element={<TablePage />} />
          <Route path="parametres" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
