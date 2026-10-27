import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import CalendarPage from './pages/CalendarPage'

const StatsPage = lazy(() => import('./pages/StatsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ClientsPage = lazy(() => import('./pages/ClientsPage'))

export default function App() {
  const { session, loading } = useAuth()

  if (loading) return null
  if (!session) return <LoginPage />

  return (
    <Suspense>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="agenda" element={<CalendarPage />} />
          <Route path="clientes/:id?" element={<ClientsPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="parametres" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
