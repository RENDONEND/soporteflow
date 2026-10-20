import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  BookOpen,
  FileText,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  LogOut,
  Menu,
  Ticket,
  UserCog,
  Users,
  X,
} from 'lucide-react'

import { useAuth } from '../lib/auth'
import { cn } from './ui'

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
      { to: '/contracts', label: 'Mi servicio', icon: FileText },
    ]
  }

  const items: NavItem[] = [
    { to: '/', label: 'Resumen', icon: LayoutDashboard, end: true },
    { to: '/tickets', label: 'Tickets', icon: Ticket },
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
  if (!user) return null
  const items = navigation(user.role, isAgency)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
          <LifeBuoy className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[15px] font-semibold leading-tight text-slate-900">
            SoporteFlow
          </p>
          <p className="text-[11px] leading-tight text-slate-500">
            {ROLE_LABELS[user.role]}
          </p>
        </div>
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
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-2 border-t border-slate-200 px-3 py-4">
        {isAgency && (
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <BookOpen className="h-[18px] w-[18px]" />
            API docs
          </a>
        )}
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
            {user.name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join('')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
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
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <SidebarContent />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-slate-200 bg-white shadow-xl animate-fade-in">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/85 px-4 backdrop-blur lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
              <LifeBuoy className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-slate-900">SoporteFlow</span>
          </div>
          <div className="w-9" />
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
