import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Clock,
  Pencil,
  Plus,
  Power,
  ReceiptText,
} from 'lucide-react'

import { get, post, put } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  BANK_ALERT_LABELS,
  BANK_ALERT_TONES,
  SEVERITY_LABELS,
  coverageLabel,
  formatDate,
  formatDay,
  formatHours,
} from '../lib/format'
import type {
  Contract,
  HourBank,
  MaintenanceTask,
  Plan,
  Ticket,
  TicketSeverity,
} from '../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
  Spinner,
  Textarea,
} from '../components/ui'
import {
  RecurrenceBadge,
  SeverityBadge,
  SlaBadge,
  StatusBadge,
  TypeBadge,
} from '../components/ticket-badges'

const SEVERITIES: TicketSeverity[] = ['critico', 'alto', 'normal', 'bajo']

export default function ContractDetail() {
  const { id } = useParams()
  const contractId = Number(id)
  const { isAgency, isAdmin } = useAuth()
  const queryClient = useQueryClient()

  const [hours, setHours] = useState('')
  const [note, setNote] = useState('')
  const [consumeError, setConsumeError] = useState<unknown>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editError, setEditError] = useState<unknown>(null)

  const contractQuery = useQuery<Contract>({
    queryKey: ['contract', contractId],
    queryFn: () => get<Contract>(`/contracts/${contractId}`),
    enabled: Number.isFinite(contractId),
  })
  const bankQuery = useQuery<HourBank>({
    queryKey: ['bank', contractId],
    queryFn: () => get<HourBank>(`/contracts/${contractId}/hour-bank`),
    enabled: Number.isFinite(contractId),
  })
  const historyQuery = useQuery<HourBank[]>({
    queryKey: ['bank-history', contractId],
    queryFn: () => get<HourBank[]>(`/contracts/${contractId}/hour-bank/history`),
    enabled: Number.isFinite(contractId),
  })
  const ticketsQuery = useQuery<Ticket[]>({
    queryKey: ['contract-tickets', contractId],
    queryFn: () => get<Ticket[]>(`/tickets?contract_id=${contractId}`),
    enabled: Number.isFinite(contractId),
  })

  const maintenanceQuery = useQuery<MaintenanceTask[]>({
    queryKey: ['maintenance', contractId],
    queryFn: () => get<MaintenanceTask[]>(`/maintenance-tasks?contract_id=${contractId}`),
    enabled: Number.isFinite(contractId),
  })

  const [editPlanId, setEditPlanId] = useState('')
  const [editHours, setEditHours] = useState('')
  const [editCutDay, setEditCutDay] = useState('')
  const [editRate, setEditRate] = useState('')
  const [editCurrency, setEditCurrency] = useState('')
  const [editTimezone, setEditTimezone] = useState('')

  const plansQuery = useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: () => get<Plan[]>('/plans'),
    enabled: isAdmin,
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['bank', contractId] })
    queryClient.invalidateQueries({ queryKey: ['bank-history', contractId] })
    queryClient.invalidateQueries({ queryKey: ['contract', contractId] })
    queryClient.invalidateQueries({ queryKey: ['contracts'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const consume = useMutation({
    mutationFn: () =>
      post<HourBank>(`/contracts/${contractId}/hour-bank/consume`, {
        hours: Number(hours),
        note: note.trim() || null,
      }),
    onSuccess: () => {
      setHours('')
      setNote('')
      invalidate()
    },
    onError: (error) => setConsumeError(error),
  })

  const updateContract = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      put<Contract>(`/contracts/${contractId}`, payload),
    onSuccess: () => {
      setEditOpen(false)
      invalidate()
    },
    onError: (error) => setEditError(error),
  })

  function openEdit() {
    const contract = contractQuery.data
    if (!contract) return
    setEditPlanId(String(contract.plan_id))
    setEditHours(String(contract.hours_bank_month))
    setEditCutDay(String(contract.cut_date_day))
    setEditRate(String(contract.hourly_rate_extra))
    setEditCurrency(contract.currency)
    setEditTimezone(contract.timezone)
    setEditError(null)
    setEditOpen(true)
  }

  function contractPayload(state: 'activo' | 'archivado') {
    return {
      plan_id: Number(editPlanId),
      hours_bank_month: Number(editHours),
      cut_date_day: Number(editCutDay),
      currency: editCurrency.toUpperCase(),
      hourly_rate_extra: Number(editRate),
      timezone: editTimezone,
      state,
    }
  }

  function handleEdit(event: FormEvent) {
    event.preventDefault()
    setEditError(null)
    updateContract.mutate(contractPayload('activo'))
  }

  function handleArchive() {
    const contract = contractQuery.data
    if (!contract) return
    if (!window.confirm('¿Archivar este contrato? El historial se conserva.')) return
    updateContract.mutate({
      plan_id: contract.plan_id,
      hours_bank_month: contract.hours_bank_month,
      cut_date_day: contract.cut_date_day,
      currency: contract.currency,
      hourly_rate_extra: contract.hourly_rate_extra,
      timezone: contract.timezone,
      state: 'archivado',
    })
  }

  if (contractQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (contractQuery.error || !contractQuery.data) {
    return (
      <div className="space-y-4">
        <Link
          to="/contracts"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a contratos
        </Link>
        <ErrorBanner error={contractQuery.error || 'Contrato no encontrado'} />
      </div>
    )
  }

  const contract = contractQuery.data
  const plan = contract.plan
  const bank = bankQuery.data
  const tickets = ticketsQuery.data || []
  const openTickets = tickets.filter(
    (ticket) => ticket.status !== 'resuelto' && ticket.status !== 'cerrado',
  )

  const responseMap = plan?.response_sla_by_severity || plan?.sla_by_severity || {}

  return (
    <div className="space-y-5">
      <Link
        to="/contracts"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a contratos
      </Link>

      <PageHeader
        title={`${contract.application?.client?.name || 'Cliente'} · ${contract.application?.name || ''}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            Plan {plan?.name || '—'}
            <Badge
              tone={
                contract.state === 'activo'
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                  : 'bg-slate-100 text-slate-500 ring-slate-400/20'
              }
            >
              {contract.state === 'activo' ? 'Activo' : 'Archivado'}
            </Badge>
          </span>
        }
        actions={
          <>
            {isAdmin && (
              <Button variant="secondary" onClick={openEdit}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
            )}
            {isAdmin && contract.state === 'activo' && (
              <Button variant="secondary" onClick={handleArchive}>
                <Power className="h-4 w-4" /> Archivar
              </Button>
            )}
            {contract.state === 'activo' && (
              <Link to={`/tickets?new=1&contract=${contract.id}`}>
                <Button>
                  <Plus className="h-4 w-4" /> Nuevo ticket
                </Button>
              </Link>
            )}
          </>
        }
      />

      {updateContract.error && <ErrorBanner error={updateContract.error} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Banco de horas</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ciclo {bank?.cycle || '—'} · sin arrastre al siguiente mes
                </p>
              </div>
              {bank && (
                <Badge tone={BANK_ALERT_TONES[bank.alert]}>
                  {BANK_ALERT_LABELS[bank.alert]}
                </Badge>
              )}
            </div>

            {bankQuery.isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Spinner />
              </div>
            ) : bank ? (
              <>
                <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-3xl font-semibold tracking-tight text-slate-900">
                      {formatHours(bank.hours_remaining)}
                    </p>
                    <p className="text-xs text-slate-500">
                      disponibles de {formatHours(bank.hours_assigned)}
                    </p>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Consumidas</p>
                      <p className="font-semibold text-slate-900">
                        {formatHours(bank.hours_consumed)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Uso</p>
                      <p className="font-semibold text-slate-900">
                        {bank.percent_used.toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </div>
                <Progress
                  value={bank.percent_used}
                  tone={
                    bank.alert === 'agotado'
                      ? 'bg-rose-500'
                      : bank.alert === 'umbral'
                        ? 'bg-amber-500'
                        : 'bg-indigo-500'
                  }
                  className="mt-3"
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="h-4 w-4 text-slate-400" />
                    {formatDay(bank.period_start)} a {formatDay(bank.period_end)}
                  </span>
                  <span>Se renueva automáticamente</span>
                </div>

                {bank.alert !== 'ok' && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      El banco está {bank.alert === 'agotado' ? 'agotado' : 'por agotarse'}.
                      No se bloquea el soporte: decidí si facturás hora extra o esperás al
                      próximo ciclo.
                    </span>
                  </div>
                )}

                {isAgency && contract.state === 'activo' && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      setConsumeError(null)
                      if (!hours || Number(hours) <= 0) return
                      consume.mutate()
                    }}
                    className="mt-5 border-t border-slate-100 pt-4"
                  >
                    <p className="text-sm font-medium text-slate-900">Consumo manual</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Para tareas de mantenimiento que no pasan por un ticket.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[110px_1fr_auto]">
                      <Input
                        type="number"
                        min="0.25"
                        step="0.25"
                        required
                        value={hours}
                        onChange={(event) => setHours(event.target.value)}
                        placeholder="Horas"
                      />
                      <Input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Nota (ej.: mantenimiento mensual)"
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        loading={consume.isPending}
                        disabled={!hours || Number(hours) <= 0}
                      >
                        <Clock className="h-4 w-4" /> Descontar
                      </Button>
                    </div>
                    <div className="mt-2">
                      <ErrorBanner error={consumeError} />
                    </div>
                  </form>
                )}
              </>
            ) : (
              <ErrorBanner error={bankQuery.error} />
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-slate-900">
                Tickets del contrato
                <span className="ml-1.5 font-normal text-slate-400">
                  ({openTickets.length} abiertos)
                </span>
              </h2>
              {contract.state === 'activo' && (
                <Link
                  to={`/tickets?new=1&contract=${contract.id}`}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Abrir ticket
                </Link>
              )}
            </div>
            {ticketsQuery.isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Spinner />
              </div>
            ) : tickets.length === 0 ? (
              <EmptyState
                icon={<ReceiptText className="h-5 w-5" />}
                title="Sin tickets"
                description="Los pedidos de este servicio van a aparecer acá."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      to={`/tickets/${ticket.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          #{ticket.id} · {ticket.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <TypeBadge type={ticket.type} />
                          <SeverityBadge severity={ticket.severity} />
                          <StatusBadge status={ticket.status} />
                          <SlaBadge state={ticket.resolution_state} />
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Cobertura del plan</h2>
            {plan ? (
              <>
                <p className="mt-2 text-sm font-medium text-slate-800">{plan.name}</p>
                <p className="text-xs text-slate-500">
                  {coverageLabel(
                    plan.window_coverage.days,
                    plan.window_coverage.start_hour,
                    plan.window_coverage.end_hour,
                  )}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Zona horaria: {plan.window_coverage.timezone}
                </p>

                <div className="mt-4 overflow-hidden rounded-lg ring-1 ring-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Severidad</th>
                        <th className="px-3 py-2 font-medium">Respuesta</th>
                        <th className="px-3 py-2 font-medium">Resolución</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {SEVERITIES.map((severity) => (
                        <tr key={severity}>
                          <td className="px-3 py-2 text-slate-700">
                            {SEVERITY_LABELS[severity]}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {formatHours(responseMap[severity] || 0)}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {formatHours(plan.sla_by_severity[severity] || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  Los plazos se cuentan en horas de cobertura: fuera de la ventana, fines de
                  semana y feriados no corren.
                </p>

                {plan.what_covers && plan.what_covers.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {plan.what_covers.map((item) => (
                      <span
                        key={item}
                        className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Sin plan asociado.</p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Datos del contrato</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Horas / mes</dt>
                <dd className="text-slate-800">{formatHours(contract.hours_bank_month)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Día de corte</dt>
                <dd className="text-slate-800">{contract.cut_date_day}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Hora extra</dt>
                <dd className="text-slate-800">
                  {contract.currency} {contract.hourly_rate_extra}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Zona horaria</dt>
                <dd className="max-w-[10rem] truncate text-right text-slate-800">
                  {contract.timezone}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <div className="border-b border-slate-200 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-slate-900">Historial reciente</h2>
            </div>
            {historyQuery.isLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Spinner />
              </div>
            ) : (historyQuery.data || []).length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Sin ciclos cerrados.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(historyQuery.data || []).slice(0, 6).map((cycle) => (
                  <li
                    key={`${cycle.contract_id}-${cycle.cycle}`}
                    className="flex items-center justify-between gap-2 px-5 py-2.5 text-xs"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{cycle.cycle}</p>
                      <p className="text-slate-500">
                        {formatDate(cycle.period_start)} → {formatDate(cycle.period_end)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-slate-800">
                        {formatHours(cycle.hours_consumed)}
                      </p>
                      <p className="text-slate-500">
                        quedaron {formatHours(cycle.hours_remaining)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Mantenimiento preventivo</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Tareas recurrentes del contrato y sus últimas ejecuciones.
            </p>
          </div>
          {isAgency && (
            <Link to="/maintenance">
              <Button variant="ghost" size="sm">
                Gestionar
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
        {maintenanceQuery.isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner />
          </div>
        ) : (maintenanceQuery.data || []).length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-5 w-5" />}
            title="Sin mantenimiento programado"
            description={
              isAgency
                ? 'Creá tareas de mantenimiento recurrente para este contrato.'
                : 'Tu proveedor no programó mantenimiento preventivo.'
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(maintenanceQuery.data || []).map((task) => (
              <li key={task.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{task.name}</span>
                  <RecurrenceBadge recurrence={task.recurrence} />
                  {task.active && task.due && (
                    <Badge tone="bg-amber-50 text-amber-700 ring-amber-600/20">Pendiente</Badge>
                  )}
                  {!task.active && (
                    <Badge tone="bg-slate-100 text-slate-500 ring-slate-500/20">Inactiva</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Última: {task.last_run_at ? formatDate(task.last_run_at) : 'nunca'}
                  {' · '}Próxima: {formatDate(task.next_due_at)}
                  {task.estimated_hours ? ` · ${formatHours(task.estimated_hours)} estimadas` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar contrato"
        description="Cambiar las horas afecta al próximo ciclo, no al vigente."
        size="lg"
      >
        <form onSubmit={handleEdit} className="space-y-4" id="edit-contract-form">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plan">
              <Select
                required
                value={editPlanId}
                onChange={(event) => {
                  setEditPlanId(event.target.value)
                  const plan = (plansQuery.data || []).find(
                    (item) => String(item.id) === event.target.value,
                  )
                  if (plan) setEditTimezone(plan.window_coverage.timezone)
                }}
              >
                {(plansQuery.data || []).map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Horas por mes">
              <Input
                type="number"
                min="1"
                step="0.5"
                required
                value={editHours}
                onChange={(event) => setEditHours(event.target.value)}
              />
            </Field>
            <Field label="Día de corte">
              <Input
                type="number"
                min="1"
                max="28"
                required
                value={editCutDay}
                onChange={(event) => setEditCutDay(event.target.value)}
              />
            </Field>
            <Field label="Moneda">
              <Input
                required
                maxLength={3}
                value={editCurrency}
                onChange={(event) => setEditCurrency(event.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Tarifa hora extra">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editRate}
                onChange={(event) => setEditRate(event.target.value)}
              />
            </Field>
            <Field label="Zona horaria">
              <Input
                required
                value={editTimezone}
                onChange={(event) => setEditTimezone(event.target.value)}
              />
            </Field>
          </div>
          <ErrorBanner error={editError} />
        </form>
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setEditOpen(false)} type="button">
            Cancelar
          </Button>
          <Button type="submit" form="edit-contract-form" loading={updateContract.isPending}>
            Guardar cambios
          </Button>
        </div>
      </Modal>
    </div>
  )
}
