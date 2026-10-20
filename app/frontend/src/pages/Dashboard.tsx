import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Inbox,
  Ticket,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { get } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  BANK_ALERT_LABELS,
  BANK_ALERT_TONES,
  formatDay,
  formatHours,
} from '../lib/format'
import type { Dashboard } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Progress,
  Spinner,
  cn,
} from '../components/ui'
import { SeverityBadge, SlaBadge, StatusBadge } from '../components/ticket-badges'

function StatCard({
  label,
  value,
  hint,
  icon,
  accent = 'bg-indigo-50 text-indigo-600',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: ReactNode
  accent?: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', accent)}>
          {icon}
        </div>
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const { user, isAgency } = useAuth()
  const { data, isLoading, error } = useQuery<Dashboard>({
    queryKey: ['dashboard'],
    queryFn: () => get<Dashboard>('/dashboard'),
  })

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (error || !data) {
    return <ErrorBanner error={error || 'No se pudo cargar el resumen'} />
  }

  const today = new Intl.DateTimeFormat('es-AR', { dateStyle: 'full' }).format(new Date())
  const bankTone =
    data.hours.percent_used >= 100
      ? 'bg-rose-500'
      : data.hours.remaining <= data.hours.assigned * 0.2
        ? 'bg-amber-500'
        : 'bg-indigo-500'

  const header = (
    <PageHeader
      title={isAgency ? 'Resumen operativo' : `Hola, ${user?.name?.split(' ')[0] || ''}`}
      subtitle={
        isAgency
          ? `${today} · todo lo que pasa hoy con tus clientes`
          : `${today} · el estado de tu soporte`
      }
      actions={
        <Link to="/tickets?new=1">
          <Button>
            <Ticket className="h-4 w-4" />
            Nuevo ticket
          </Button>
        </Link>
      }
    />
  )

  if (!isAgency) {
    const contracts = data.contracts
    return (
      <div className="space-y-6">
        {header}

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Tickets abiertos"
            value={data.counts.open_tickets}
            hint={
              data.counts.overdue_tickets > 0
                ? `${data.counts.overdue_tickets} fuera de SLA`
                : 'Dentro del SLA'
            }
            icon={<Ticket className="h-4 w-4" />}
          />
          <StatCard
            label="Horas disponibles"
            value={formatHours(data.hours.remaining)}
            hint={`de ${formatHours(data.hours.assigned)} este ciclo`}
            icon={<Clock className="h-4 w-4" />}
            accent="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            label="Aplicaciones"
            value={data.counts.applications}
            hint={`${data.counts.active_contracts} contrato(s) activo(s)`}
            icon={<FileText className="h-4 w-4" />}
            accent="bg-violet-50 text-violet-600"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {contracts.length === 0 && (
            <Card className="lg:col-span-2">
              <EmptyState
                icon={<FileText className="h-5 w-5" />}
                title="Todavía no hay un contrato activo"
                description="Cuando la agencia active tu plan vas a ver acá el saldo de horas y el SLA."
              />
            </Card>
          )}
          {contracts.map((contract) => (
            <Card key={contract.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {contract.application_name}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    Plan {contract.plan_name}
                  </p>
                </div>
                <Badge tone={BANK_ALERT_TONES[contract.alert]}>
                  {BANK_ALERT_LABELS[contract.alert]}
                </Badge>
              </div>

              <div className="mt-5 flex items-end justify-between">
                <div>
                  <p className="text-2xl font-semibold text-slate-900">
                    {formatHours(contract.hours_remaining)}
                  </p>
                  <p className="text-xs text-slate-500">
                    disponibles de {formatHours(contract.hours_assigned)}
                  </p>
                </div>
                <p className="text-sm font-medium text-slate-500">
                  {contract.percent_used.toFixed(0)}% usado
                </p>
              </div>
              <Progress
                value={contract.percent_used}
                tone={
                  contract.alert === 'agotado'
                    ? 'bg-rose-500'
                    : contract.alert === 'umbral'
                      ? 'bg-amber-500'
                      : 'bg-indigo-500'
                }
                className="mt-2.5"
              />

              <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <CalendarClock className="h-4 w-4 text-slate-400" />
                Se renueva el {formatDay(contract.period_end)} · sin arrastre
              </div>

              {contract.what_covers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {contract.what_covers.map((item) => (
                    <span
                      key={item}
                      className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              )}

              <Link
                to={`/contracts/${contract.id}`}
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Ver detalle del servicio <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Card>
          ))}
        </div>

        <Card>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">Tickets recientes</h2>
            <Link
              to="/tickets"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Ver todos
            </Link>
          </div>
          {data.recent_tickets.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title="Sin tickets por ahora"
              description="Cuando necesites algo, abrí un ticket y el equipo lo toma."
              action={
                <Link to="/tickets?new=1">
                  <Button size="sm">Abrir ticket</Button>
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recent_tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    to={`/tickets/${ticket.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        #{ticket.id} · {ticket.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {ticket.application_name}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <SlaBadge state={ticket.resolution_state} />
                      <StatusBadge status={ticket.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Clientes"
          value={data.counts.clients}
          hint={`${data.counts.applications} aplicaciones`}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Contratos activos"
          value={data.counts.active_contracts}
          hint="Con banco de horas vigente"
          icon={<FileText className="h-4 w-4" />}
          accent="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Tickets abiertos"
          value={data.counts.open_tickets}
          hint={
            data.counts.overdue_tickets > 0 ? (
              <span className="font-medium text-rose-600">
                {data.counts.overdue_tickets} con SLA vencido
              </span>
            ) : (
              'Ninguno fuera de SLA'
            )
          }
          icon={<Ticket className="h-4 w-4" />}
          accent="bg-sky-50 text-sky-600"
        />
        <StatCard
          label="Horas disponibles"
          value={formatHours(data.hours.remaining)}
          hint={`${formatHours(data.hours.consumed)} consumidas de ${formatHours(data.hours.assigned)}`}
          icon={<Clock className="h-4 w-4" />}
          accent="bg-emerald-50 text-emerald-600"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Banco de horas</h2>
            <span className="text-xs font-medium text-slate-500">Mes en curso</span>
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
            {formatHours(data.hours.remaining)}
          </p>
          <p className="text-xs text-slate-500">
            disponibles de {formatHours(data.hours.assigned)}
          </p>
          <Progress value={data.hours.percent_used} tone={bankTone} className="mt-3" />
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Consumidas</p>
              <p className="font-semibold text-slate-900">
                {formatHours(data.hours.consumed)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Uso</p>
              <p className="font-semibold text-slate-900">
                {data.hours.percent_used.toFixed(0)}%
              </p>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            Al llegar a cero no se bloquea: avisa para decidir hora extra.
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">Alertas</h2>
            <span className="text-xs text-slate-500">
              {data.alerts.length === 0 ? 'Sin pendientes' : `${data.alerts.length} activas`}
            </span>
          </div>
          {data.alerts.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              title="Todo en orden"
              description="No hay bancos de horas al límite ni tickets fuera de SLA."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.alerts.map((alert) => (
                <li key={`${alert.type}-${alert.id}`}>
                  <Link
                    to={alert.type === 'bank' ? `/contracts/${alert.id}` : `/tickets/${alert.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50"
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        alert.type === 'sla'
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-amber-50 text-amber-600',
                      )}
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{alert.title}</p>
                      <p className="truncate text-xs text-slate-500">{alert.detail}</p>
                    </div>
                    {alert.remaining !== null && (
                      <span className="shrink-0 text-xs font-medium text-slate-500">
                        {formatHours(alert.remaining)}
                      </span>
                    )}
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">Últimos tickets</h2>
          <Link
            to="/tickets"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            Ver todos
          </Link>
        </div>
        {data.recent_tickets.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="Todavía no hay tickets"
            description="Cuando un cliente abra un ticket va a aparecer acá."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Ticket</th>
                  <th className="px-3 py-2.5 font-medium">Cliente</th>
                  <th className="px-3 py-2.5 font-medium">Severidad</th>
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                  <th className="px-5 py-2.5 font-medium">SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recent_tickets.map((ticket) => (
                  <tr key={ticket.id} className="transition hover:bg-slate-50">
                    <td className="max-w-[22rem] px-5 py-3">
                      <Link
                        to={`/tickets/${ticket.id}`}
                        className="block truncate font-medium text-slate-900 hover:text-indigo-700"
                      >
                        #{ticket.id} · {ticket.title}
                      </Link>
                      <p className="truncate text-xs text-slate-500">
                        {ticket.application_name}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{ticket.client_name}</td>
                    <td className="px-3 py-3">
                      <SeverityBadge severity={ticket.severity} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-5 py-3">
                      <SlaBadge
                        state={ticket.resolution_state}
                        deadline={ticket.resolution_deadline}
                        showCountdown
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
