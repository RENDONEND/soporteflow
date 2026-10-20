import type {
  BankAlert,
  SlaState,
  TicketSeverity,
  TicketStatus,
  TicketType,
} from './types'

export const STATUS_LABELS: Record<TicketStatus, string> = {
  abierto: 'Abierto',
  en_progreso: 'En progreso',
  esperando_cliente: 'Esperando cliente',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
}

export const STATUS_TONES: Record<TicketStatus, string> = {
  abierto: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  en_progreso: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  esperando_cliente: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  resuelto: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  cerrado: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}

export const SEVERITY_LABELS: Record<TicketSeverity, string> = {
  critico: 'Crítico',
  alto: 'Alto',
  normal: 'Normal',
  bajo: 'Bajo',
}

export const SEVERITY_TONES: Record<TicketSeverity, string> = {
  critico: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  alto: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  normal: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  bajo: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}

export const TYPE_LABELS: Record<TicketType, string> = {
  soporte: 'Soporte',
  funcionalidad: 'Funcionalidad',
}

export const SLA_LABELS: Record<SlaState, string> = {
  ok: 'En plazo',
  warning: 'Por vencer',
  breached: 'Vencido',
  met: 'Cumplido',
  none: 'Sin SLA',
}

export const SLA_TONES: Record<SlaState, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  breached: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  met: 'bg-teal-50 text-teal-700 ring-teal-600/20',
  none: 'bg-slate-100 text-slate-500 ring-slate-400/20',
}

export const BANK_ALERT_LABELS: Record<BankAlert, string> = {
  ok: 'Saldo saludable',
  umbral: 'Bajo el 20%',
  agotado: 'Banco agotado',
}

export const BANK_ALERT_TONES: Record<BankAlert, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  umbral: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  agotado: 'bg-rose-50 text-rose-700 ring-rose-600/20',
}

export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function formatHours(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return `${rounded} h`
}

export function formatDate(
  value: string | null | undefined,
  timezone?: string,
): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone || undefined,
  }).format(date)
}

export function formatDay(value: string | null | undefined): string {
  if (!value) return '—'
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(date)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function timeLeft(deadline: string | null): string | null {
  if (!deadline) return null
  const diff = new Date(deadline).getTime() - Date.now()
  if (Number.isNaN(diff)) return null
  const abs = Math.abs(diff)
  const minutes = Math.round(abs / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60

  let text: string
  if (days > 0) text = `${days} d ${hours} h`
  else if (hours > 0) text = `${hours} h ${mins} min`
  else text = `${mins} min`

  return diff >= 0 ? `en ${text}` : `hace ${text}`
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function coverageLabel(days: number[], start: number, end: number): string {
  const sorted = [...days].sort((a, b) => a - b)
  const isWeekdays = sorted.join(',') === '0,1,2,3,4'
  const isMonSat = sorted.join(',') === '0,1,2,3,4,5'
  const everyDay = sorted.length === 7
  const dayLabel = everyDay
    ? 'Todos los días'
    : isWeekdays
      ? 'Lun a Vie'
      : isMonSat
        ? 'Lun a Sáb'
        : sorted.map((day) => WEEKDAYS[day]).join(' · ')

  if (start === 0 && end === 24) return `${dayLabel} · 24 h`
  return `${dayLabel} · ${start}:00 a ${end}:00`
}
