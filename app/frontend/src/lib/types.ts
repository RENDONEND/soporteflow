export type Role = 'admin' | 'tecnico' | 'cliente'
export type TicketType = 'soporte' | 'funcionalidad'
export type TicketSeverity = 'critico' | 'alto' | 'normal' | 'bajo'
export type TicketStatus =
  | 'abierto'
  | 'en_progreso'
  | 'esperando_cliente'
  | 'resuelto'
  | 'cerrado'
export type BankAlert = 'ok' | 'umbral' | 'agotado'
export type SlaState = 'ok' | 'warning' | 'breached' | 'met' | 'none'
export type PackStatus =
  | 'propuesto'
  | 'aprobado'
  | 'rechazado'
  | 'en_desarrollo'
  | 'entregado'
  | 'facturado'
export type MaintenanceRecurrence = 'semanal' | 'mensual' | 'trimestral'
export type NotificationType =
  | 'ticket_creado'
  | 'ticket_comentario'
  | 'ticket_estado'
  | 'sla_por_vencer'
  | 'sla_vencido'
  | 'banco_umbral'
  | 'banco_agotado'
  | 'pack_propuesto'
  | 'pack_aprobado'
  | 'pack_rechazado'
  | 'mantenimiento_pendiente'

export interface User {
  id: number
  email: string
  name: string
  role: Role
  client_id: number | null
}

export interface Client {
  id: number
  name: string
  contacts: Record<string, string> | null
}

export interface Application {
  id: number
  client_id: number
  name: string
  description: string | null
  client?: Client
}

export interface CoverageWindow {
  timezone: string
  days: number[]
  start_hour: number
  end_hour: number
  holidays: string[]
}

export interface Plan {
  id: number
  name: string
  window_coverage: CoverageWindow
  sla_by_severity: Record<string, number>
  response_sla_by_severity: Record<string, number> | null
  hours_bank_default: number
  what_covers: string[] | null
}

export interface Contract {
  id: number
  application_id: number
  plan_id: number
  hours_bank_month: number
  cut_date_day: number
  currency: string
  hourly_rate_extra: number
  timezone: string
  state: 'activo' | 'archivado'
  plan?: Plan | null
  application?: Application | null
}

export interface HourBank {
  contract_id: number
  cycle: string
  period_start: string
  period_end: string
  hours_assigned: number
  hours_consumed: number
  hours_remaining: number
  percent_used: number
  alert: BankAlert
  closed: boolean
}

export interface TicketComment {
  id: number
  body: string
  internal: boolean
  created_at: string | null
  user_name: string | null
}

export interface TicketTimeLog {
  id: number
  hours: number
  logged_at: string | null
  note: string | null
  user_name: string | null
}

export interface TicketAttachment {
  id: number
  filename: string
  content_type: string | null
  size: number
  created_at: string | null
  user_name: string | null
}

export interface Ticket {
  id: number
  contract_id: number
  client_id: number
  client_name: string
  application_name: string
  plan_name: string
  timezone: string
  type: TicketType
  severity: TicketSeverity | null
  status: TicketStatus
  title: string
  description: string | null
  assigned_to: number | null
  assigned_to_name: string | null
  created_by: number | null
  created_by_name: string | null
  opened_at: string | null
  response_deadline: string | null
  resolution_deadline: string | null
  first_response_at: string | null
  resolved_at: string | null
  response_state: SlaState
  resolution_state: SlaState
  is_overdue: boolean
  hours_logged: number
  packs: TicketPackSummary[]
  closable: boolean
  comments: TicketComment[]
  time_logs: TicketTimeLog[]
  attachments: TicketAttachment[]
}

export interface TicketPackSummary {
  id: number
  name: string
  status: PackStatus
  price: number
  currency: string
  hours_estimated: number
}

export interface FeaturePackTicket {
  id: number
  title: string
  status: TicketStatus
  hours_logged: number
}

export interface FeaturePack {
  id: number
  contract_id: number
  client_id: number | null
  client_name: string | null
  application_name: string | null
  name: string
  description: string | null
  status: PackStatus
  hours_estimated: number
  hours_real: number
  price: number
  currency: string
  created_at: string | null
  decided_at: string | null
  decided_by_name: string | null
  approved_at: string | null
  approved_by_name: string | null
  delivered_at: string | null
  billed_at: string | null
  rejection_reason: string | null
  ticket_ids: number[]
  tickets: FeaturePackTicket[]
}

export interface MaintenanceRun {
  id: number
  run_at: string | null
  hours: number
  notes: string | null
  user_name: string | null
}

export interface MaintenanceTask {
  id: number
  contract_id: number
  client_id: number | null
  client_name: string | null
  application_name: string | null
  name: string
  recurrence: MaintenanceRecurrence
  checklist: string[]
  estimated_hours: number | null
  active: boolean
  last_run_at: string | null
  last_run_by: string | null
  next_due_at: string | null
  due: boolean
  overdue: boolean
  runs: MaintenanceRun[]
}

export interface MaintenanceCalendarRun {
  id: number
  task_id: number
  task_name: string | null
  run_at: string | null
  hours: number
  notes: string | null
  user_name: string | null
}

export interface MaintenanceCalendar {
  contract_id: number
  year: number
  month: number
  due_tasks: MaintenanceTask[]
  month_hours: number
  runs: MaintenanceCalendarRun[]
}

export interface Notification {
  id: number
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  read: boolean
  email_sent: boolean
  created_at: string | null
}

export interface NotificationList {
  unread: number
  items: Notification[]
}

export interface DashboardAlert {
  type: 'bank' | 'sla'
  id: number
  title: string
  detail: string
  remaining: number | null
}

export interface DashboardContract extends HourBank {
  id: number
  client_id: number
  client_name: string
  application_name: string
  plan_name: string
  what_covers: string[]
  state: string
}

export interface Dashboard {
  role: Role
  counts: {
    clients: number
    applications: number
    active_contracts: number
    open_tickets: number
    overdue_tickets: number
  }
  hours: {
    assigned: number
    consumed: number
    remaining: number
    percent_used: number
  }
  alerts: DashboardAlert[]
  contracts: DashboardContract[]
  recent_tickets: Ticket[]
}

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: User
}
