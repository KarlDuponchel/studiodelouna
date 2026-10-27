import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, CalendarDays, LogOut, Settings, WifiOff } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '../lib/auth'
import { useOnline } from '../lib/useOnline'

const NAV = [
  { to: '/', label: 'Agenda', icon: CalendarDays, end: true },
  { to: '/stats', label: 'Statistiques', icon: BarChart3, end: false },
  { to: '/parametres', label: 'Paramètres', icon: Settings, end: false },
]

export default function Layout() {
  const { signOut } = useAuth()
  const online = useOnline()
  const { pathname } = useLocation()

  return (
    <div className="flex h-full">
      {/* Barre latérale : iPad et desktop */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <span className="text-lg leading-tight font-semibold">Studio de Louna</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium transition-colors',
                  isActive ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-bg',
                )
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button onClick={signOut} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-muted hover:bg-bg">
          <LogOut size={20} />
          Déconnexion
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {!online && (
          <div className="pt-safe flex items-center justify-center gap-2 bg-amber-100 px-3 py-1.5 text-sm text-amber-900">
            <WifiOff size={16} /> Hors ligne : consultation seule
          </div>
        )}
        <main className={clsx('min-h-0 flex-1 overflow-y-auto', online && 'pt-safe')}>
          {/* key : rejoue l'animation d'entrée à chaque changement d'onglet */}
          <div key={pathname} className="page-enter h-full">
            <Outlet />
          </div>
        </main>

        {/* Barre d'onglets : iPhone */}
        <nav className="pb-safe flex border-t border-line bg-surface md:hidden">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx('group flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors', isActive ? 'text-accent' : 'text-muted')
              }
            >
              <Icon size={22} className="transition-transform duration-150 group-active:scale-85" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
