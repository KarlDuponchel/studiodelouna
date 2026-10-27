import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, CalendarDays, House, LogOut, PanelLeftClose, PanelLeftOpen, Settings, Table2, Users, WifiOff } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '../lib/auth'
import { useOnline } from '../lib/useOnline'

// short : libellé de la barre d'onglets iPhone, où 6 onglets se partagent la largeur
const NAV = [
  { to: '/', label: 'Accueil', icon: House, end: true },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays, end: false },
  { to: '/clientes', label: 'Clientes', icon: Users, end: false },
  { to: '/stats', label: 'Statistiques', short: 'Stats', icon: BarChart3, end: true },
  { to: '/stats/tableau', label: 'Tableau', icon: Table2, end: false },
  { to: '/parametres', label: 'Paramètres', short: 'Réglages', icon: Settings, end: false },
]

const COLLAPSED_KEY = 'sidebar-collapsed'

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export default function Layout() {
  const { signOut } = useAuth()
  const online = useOnline()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(readCollapsed)

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    try {
      window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
    } catch {
      // Stockage indisponible (navigation privée) : l'état reste en mémoire
    }
  }

  return (
    <div className="flex h-full">
      {/* Barre latérale : iPad et desktop. Repliée, seules les icônes restent visibles */}
      <aside
        className={clsx(
          'hidden shrink-0 flex-col overflow-hidden border-r border-line bg-surface px-3 py-4 transition-[width] duration-200 ease-out md:flex',
          collapsed ? 'w-17' : 'w-56',
        )}
        // FullCalendar ne suit que le redimensionnement de la fenêtre
        onTransitionEnd={(e) => e.target === e.currentTarget && window.dispatchEvent(new Event('resize'))}
      >
        <div className="mb-6 flex items-center gap-2">
          <div className={clsx('flex min-w-0 flex-1 items-center gap-2 pl-2', collapsed && 'hidden')}>
            <img src="/icon.svg" alt="" className="h-8 w-8 shrink-0" />
            <span className="truncate text-lg leading-tight font-semibold">Studio de Louna</span>
          </div>
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-bg active:scale-90"
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              className={({ isActive }) =>
                clsx(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium whitespace-nowrap transition-colors',
                  isActive ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-bg',
                )
              }
            >
              <Icon size={20} className="shrink-0" />
              <span className={clsx(collapsed && 'sr-only')}>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button
          onClick={signOut}
          title={collapsed ? 'Déconnexion' : undefined}
          className="flex min-h-11 items-center gap-3 rounded-xl px-3 whitespace-nowrap text-muted hover:bg-bg"
        >
          <LogOut size={20} className="shrink-0" />
          <span className={clsx(collapsed && 'sr-only')}>Déconnexion</span>
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {!online && (
          <div className="pt-safe flex items-center justify-center gap-2 bg-amber-100 px-3 py-1.5 text-sm text-amber-900">
            <WifiOff size={16} /> Hors ligne : consultation seule
          </div>
        )}
        <main className={clsx('min-h-0 flex-1 overflow-y-auto', online && 'pt-safe')}>
          {/* key : rejoue l'animation d'entrée à chaque changement d'onglet (pas entre deux fiches clientes) */}
          <div key={pathname.split('/')[1] === 'clientes' ? 'clientes' : pathname} className="page-enter h-full">
            <Outlet />
          </div>
        </main>

        {/* Barre d'onglets : iPhone */}
        <nav className="pb-safe flex border-t border-line bg-surface md:hidden">
          {NAV.map(({ to, label, short, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={short ? label : undefined}
              className={({ isActive }) =>
                clsx('group flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors', isActive ? 'text-accent' : 'text-muted')
              }
            >
              <Icon size={22} className="transition-transform duration-150 group-active:scale-85" />
              <span className="max-w-full truncate">{short ?? label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
