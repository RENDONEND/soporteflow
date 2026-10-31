import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  ListChecks,
  Play,
  Plus,
  Power,
} from 'lucide-react'

import { get, post, put } from '../lib/api'
import { useAuth } from '../lib/auth'
import { RECURRENCE_LABELS, formatDate, formatHours } from '../lib/format'
import type { Contract, MaintenanceRecurrence, MaintenanceTask } from '../lib/types'
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
  Select,
  Spinner,
  Textarea,
  cn,
} from '../components/ui'
import { RecurrenceBadge } from '../components/ticket-badges'

const RECURRENCES: MaintenanceRecurrence[] = ['semanal', 'mensual', 'trimestral']

interface TaskForm {
  contract_id: string
  name: string
  recurrence: MaintenanceRecurrence
  estimated: string
  checklist: string
  active: boolean
}

function blankForm(): TaskForm {
  return {
    contract_id: '',
    name: '',
    recurrence: 'mensual',
    estimated: '2',
    checklist: '',
    active: true,
  }
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function Maintenance() {
  const { isAgency } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<TaskForm>(blankForm)
  const [error, setError] = useState<string | null>(null)
  const [runTask, setRunTask] = useState<MaintenanceTask | null>(null)
  const [runHours, setRunHours] = useState('')
  const [runNotes, setRunNotes] = useState('')

  const tasksQuery = useQuery<MaintenanceTask[]>({
    queryKey: ['maintenance'],
    queryFn: () => get<MaintenanceTask[]>('/maintenance-tasks'),
  })

  const contractsQuery = useQuery<Contract[]>({
    queryKey: ['contracts'],
    queryFn: () => get<Contract[]>('/contracts'),
    enabled: isAgency,
  })

  const activeContracts = useMemo(
    () => (contractsQuery.data || []).filter((contract) => contract.state === 'activo'),
    [contractsQuery.data],
  )

  const createTask = useMutation({
    mutationFn: (payload: unknown) => post<MaintenanceTask>('/maintenance-tasks', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      setOpen(false)
      setForm(blankForm())
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Error'),
  })

  const toggleTask = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      put<MaintenanceTask>(`/maintenance-tasks/${id}`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['maintenance'] }),
    onError: (err) => setError(err instanceof Error ? err.message : 'Error'),
  })

  const registerRun = useMutation({
    mutationFn: ({ id, hours, notes }: { id: number; hours: number; notes?: string }) =>
      post<MaintenanceTask>(`/maintenance-tasks/${id}/runs`, { hours, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      setRunTask(null)
      setRunHours('')
      setRunNotes('')
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Error'),
  })

  const tasks = tasksQuery.data || []
  const dueCount = tasks.filter((task) => task.due).length

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!form.contract_id) return setError('Elegí un contrato')
    createTask.mutate({
      contract_id: Number(form.contract_id),
      name: form.name.trim(),
      recurrence: form.recurrence,
      checklist: splitLines(form.checklist),
      estimated_hours: Number(form.estimated) || null,
      active: form.active,
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={isAgency ? 'Mantenimiento preventivo' : 'Mantenimiento'}
        subtitle={
          isAgency
            ? 'Tareas recurrentes por contrato. Al completarlas se descuentan del banco de horas.'
            : 'Tareas de mantenimiento programadas y su historial.'
        }
        actions={
          isAgency ? (
            <Button onClick={() => { setError(null); setForm(blankForm()); setOpen(true) }}>
              <Plus className="h-4 w-4" />
              Nueva tarea
            </Button>
          ) : undefined
        }
      />

      {isAgency && dueCount > 0 && (
        <Card className="flex items-center gap-3 border-amber-200 bg-amber-50 p-4">
          <Clock className="h-5 w-5 text-amber-600" />
          <p className="text-sm text-amber-800">
            {dueCount} tarea{dueCount === 1 ? '' : 's'} pendiente{dueCount === 1 ? '' : 's'} de
            ejecución.
          </p>
        </Card>
      )}

      {error && <ErrorBanner error={new Error(error)} />}
      {tasksQuery.error && <ErrorBanner error={tasksQuery.error} />}

      {tasksQuery.isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarCheck className="h-5 w-5" />}
            title={isAgency ? 'Sin tareas de mantenimiento' : 'Sin mantenimiento programado'}
            description={
              isAgency
                ? 'Definí tareas recurrentes (backups, actualizaciones, revisiones) y registrá su ejecución.'
                : 'Tu proveedor no programó mantenimiento preventivo para tu servicio.'
            }
            action={
              isAgency ? (
                <Button onClick={() => { setError(null); setForm(blankForm()); setOpen(true) }}>
                  <Plus className="h-4 w-4" />
                  Nueva tarea
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card
              key={task.id}
              className={cn('p-4', task.due && task.active && 'border-amber-200')}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{task.name}</h3>
                    <RecurrenceBadge recurrence={task.recurrence} />
                    {!task.active && (
                      <Badge tone="bg-slate-100 text-slate-500 ring-slate-500/20">Inactiva</Badge>
                    )}
                    {task.active && task.due && (
                      <Badge tone="bg-amber-50 text-amber-700 ring-amber-600/20">Pendiente</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {task.client_name} · {task.application_name}
                  </p>

                  {task.checklist.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {task.checklist.map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-2 text-xs text-slate-600"
                        >
                          <ListChecks className="h-3.5 w-3.5 text-slate-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {task.estimated_hours && (
                      <span>Estimado: {formatHours(task.estimated_hours)}</span>
                    )}
                    <span>
                      Última: {task.last_run_at ? formatDate(task.last_run_at) : 'nunca'}
                      {task.last_run_by ? ` · ${task.last_run_by}` : ''}
                    </span>
                    <span>Próxima: {formatDate(task.next_due_at)}</span>
                  </div>
                </div>

                {isAgency && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        toggleTask.mutate({ id: task.id, active: !task.active })
                      }
                      title={task.active ? 'Pausar' : 'Activar'}
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      disabled={!task.active}
                      onClick={() => {
                        setError(null)
                        setRunTask(task)
                        setRunHours(String(task.estimated_hours || 1))
                        setRunNotes('')
                      }}
                    >
                      <Play className="h-4 w-4" />
                      Registrar
                    </Button>
                  </div>
                )}
              </div>

              {task.runs.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Historial
                  </p>
                  <div className="space-y-1">
                    {task.runs.map((run) => (
                      <div
                        key={run.id}
                        className="flex items-center gap-2 text-xs text-slate-600"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                          {formatHours(run.hours)}
                        </span>
                        <span>{formatDate(run.run_at)}</span>
                        {run.user_name && <span className="text-slate-400">· {run.user_name}</span>}
                        {run.notes && (
                          <span className="truncate text-slate-400">· {run.notes}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nueva tarea de mantenimiento">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Contrato">
            <Select
              value={form.contract_id}
              onChange={(event) => setForm({ ...form, contract_id: event.target.value })}
              required
            >
              <option value="">Elegí un contrato…</option>
              {activeContracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.application?.client?.name} · {contract.application?.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Nombre de la tarea">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ej: Backup de base de datos"
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Recurrencia">
              <Select
                value={form.recurrence}
                onChange={(event) =>
                  setForm({ ...form, recurrence: event.target.value as MaintenanceRecurrence })
                }
              >
                {RECURRENCES.map((recurrence) => (
                  <option key={recurrence} value={recurrence}>
                    {RECURRENCE_LABELS[recurrence]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Horas estimadas">
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={form.estimated}
                onChange={(event) => setForm({ ...form, estimated: event.target.value })}
              />
            </Field>
          </div>

          <Field label="Checklist" hint="Un ítem por línea">
            <Textarea
              value={form.checklist}
              onChange={(event) => setForm({ ...form, checklist: event.target.value })}
              rows={3}
              placeholder={'Copiar base\nVerificar restauración'}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createTask.isPending}>
              {createTask.isPending ? 'Creando…' : 'Crear tarea'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(runTask)}
        onClose={() => setRunTask(null)}
        title={`Registrar ejecución · ${runTask?.name || ''}`}
      >
        <div className="space-y-4">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Las horas registradas descuentan del banco de horas del contrato.
          </p>
          <Field label="Horas trabajadas">
            <Input
              type="number"
              min="0.25"
              step="0.25"
              value={runHours}
              onChange={(event) => setRunHours(event.target.value)}
            />
          </Field>
          <Field label="Notas">
            <Textarea
              value={runNotes}
              onChange={(event) => setRunNotes(event.target.value)}
              rows={3}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRunTask(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!runHours || Number(runHours) <= 0 || registerRun.isPending}
              onClick={() =>
                runTask &&
                registerRun.mutate({
                  id: runTask.id,
                  hours: Number(runHours),
                  notes: runNotes.trim() || undefined,
                })
              }
            >
              {registerRun.isPending ? 'Registrando…' : 'Registrar y descontar'}
            </Button>
          </div>
        </div>
      </Modal>

      {isAgency && (
        <p className="text-center text-xs text-slate-400">
          También podés ver el historial desde{' '}
          <Link to="/contracts" className="text-indigo-600 hover:underline">
            cada contrato
          </Link>
          .
        </p>
      )}
    </div>
  )
}
