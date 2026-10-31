import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  BookOpen,
  Boxes,
  CalendarCheck,
  FileText,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  LogOut,
  Menu,
  Moon,
  Sun,
  Ticket,
  UserCog,
  Users,
  X,
} from 'lucide-react'

import { useAuth } from '../lib/auth'
import NotificationBell from './NotificationBell'
import { cn } from './ui'
import { useTheme } from '../lib/theme'

const ROLE_LABELS = {
  admin: 'Administración',
  tecnico: 'Equipo técnico',
  cliente: 'Portal cliente',
}

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}

function navigation(role: string, isAgency: boolean): NavItem[] {
  if (!isAgency) {
    return [
      { to: '/', label: 'Resumen', icon: LayoutDashboard, end: true },
      { to: '/tickets', label: 'Mis tickets', icon: Ticket },
      { to: '/feature-packs', label: 'Mis packs', icon: Boxes },
      { to: '/maintenance', label: 'Mantenimiento', icon: CalendarCheck },
      { to: '/contracts', label: 'Mi servicio', icon: FileText },
    ]
  }

  const items: NavItem[] = [
    { to: '/', label: 'Resumen', icon: LayoutDashboard, end: true },
    { to: '/tickets', label: 'Tickets', icon: Ticket },
    { to: '/feature-packs', label: 'Packs', icon: Boxes },
    { to: '/maintenance', label: 'Mantenimiento', icon: CalendarCheck },
    { to: '/clients', label: 'Clientes', icon: Users },
    { to: '/contracts', label: 'Contratos', icon: FileText },
    { to: '/plans', label: 'Planes', icon: Layers },
  ]
  if (role === 'admin') {
    items.push({ to: '/users', label: 'Equipo y accesos', icon: UserCog })
  }
  return items
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout, isAgency } = useAuth()
  const { theme, toggleTheme } = useTheme()
  if (!user) return null
  const items = navigation(user.role, isAgency)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
          <LifeBuoy className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-[15px] font-semibold leading-tight text-foreground">
            SoporteFlow
          </p>
          <p className="text-[11px] leading-tight text-muted-foreground">
            {ROLE_LABELS[user.role]}
          </p>
        </div>
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition"
          title="Cambiar tema"
          aria-label="Cambiar tema"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <NotificationBell />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )
            }
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-2 border-t border-border px-3 py-4">
        {isAgency && (
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <BookOpen className="h-[18px] w-[18px]" />
            API docs
          </a>
        )}
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
            {user.name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join('')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border bg-card lg:block">
        <SidebarContent />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-border bg-card shadow-xl animate-fade-in">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/85 px-4 backdrop-blur lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
              <LifeBuoy className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">SoporteFlow</span>
          </div>
          <NotificationBell />
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
