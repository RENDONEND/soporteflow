import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Layers, Pencil, Plus } from 'lucide-react'

import { get, post, put } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  SEVERITY_LABELS,
  WEEKDAYS,
  coverageLabel,
  formatHours,
} from '../lib/format'
import type { Plan, TicketSeverity } from '../lib/types'
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
  Spinner,
  Textarea,
  cn,
} from '../components/ui'

const SEVERITIES: TicketSeverity[] = ['critico', 'alto', 'normal', 'bajo']

interface PlanForm {
  name: string
  hours: string
  timezone: string
  days: number[]
  start: string
  end: string
  resolution: Record<TicketSeverity, string>
  response: Record<TicketSeverity, string>
  holidays: string
  covers: string
}

function blankForm(): PlanForm {
  return {
    name: '',
    hours: '60',
    timezone: 'America/Argentina/Buenos_Aires',
    days: [0, 1, 2, 3, 4],
    start: '9',
    end: '18',
    resolution: { critico: '4', alto: '6', normal: '12', bajo: '24' },
    response: { critico: '', alto: '', normal: '', bajo: '' },
    holidays: '',
    covers: '',
  }
}

function splitLines(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function Plans() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [form, setForm] = useState<PlanForm>(blankForm())
  const [error, setError] = useState<unknown>(null)

  const plansQuery = useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: () => get<Plan[]>('/plans'),
  })

  const savePlan = useMutation({
    mutationFn: (payload: unknown) =>
      editing ? put<Plan>(`/plans/${editing.id}`, payload) : post<Plan>('/plans', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setOpen(false)
      setEditing(null)
      setError(null)
    },
    onError: (err) => setError(err),
  })

  const duplicatePlan = useMutation({
    mutationFn: (planId: number) => post<Plan>(`/plans/${planId}/duplicate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plans'] }),
  })

  function openCreate() {
    setEditing(null)
    setForm(blankForm())
    setError(null)
    setOpen(true)
  }

  function openEdit(plan: Plan) {
    setEditing(plan)
    setForm({
      name: plan.name,
      hours: String(plan.hours_bank_default),
      timezone: plan.window_coverage.timezone,
      days: plan.window_coverage.days,
      start: String(plan.window_coverage.start_hour),
      end: String(plan.window_coverage.end_hour),
      resolution: {
        critico: String(plan.sla_by_severity.critico ?? ''),
        alto: String(plan.sla_by_severity.alto ?? ''),
        normal: String(plan.sla_by_severity.normal ?? ''),
        bajo: String(plan.sla_by_severity.bajo ?? ''),
      },
      response: {
        critico: String(plan.response_sla_by_severity?.critico ?? ''),
        alto: String(plan.response_sla_by_severity?.alto ?? ''),
        normal: String(plan.response_sla_by_severity?.normal ?? ''),
        bajo: String(plan.response_sla_by_severity?.bajo ?? ''),
      },
      holidays: plan.window_coverage.holidays.join('\n'),
      covers: (plan.what_covers || []).join('\n'),
    })
    setError(null)
    setOpen(true)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const responseEntries = SEVERITIES.filter((severity) =>
      form.response[severity].trim(),
    ).map((severity) => [severity, Number(form.response[severity])])

    savePlan.mutate({
      name: form.name.trim(),
      window_coverage: {
        timezone: form.timezone.trim(),
        days: form.days,
        start_hour: Number(form.start),
        end_hour: Number(form.end),
        holidays: splitLines(form.holidays),
      },
      sla_by_severity: Object.fromEntries(
        SEVERITIES.map((severity) => [severity, Number(form.resolution[severity])]),
      ),
      response_sla_by_severity:
        responseEntries.length > 0 ? Object.fromEntries(responseEntries) : null,
      hours_bank_default: Number(form.hours),
      what_covers: splitLines(form.covers),
    })
  }

  function setResponse(severity: TicketSeverity, value: string) {
    setForm((current) => ({
      ...current,
      response: { ...current.response, [severity]: value },
    }))
  }

  function setResolution(severity: TicketSeverity, value: string) {
    setForm((current) => ({
      ...current,
      resolution: { ...current.resolution, [severity]: value },
    }))
  }

  function toggleDay(day: number) {
    setForm((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((item) => item !== day)
        : [...current.days, day].sort((a, b) => a - b),
    }))
  }

  const plans = plansQuery.data || []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Planes"
        subtitle="Ventana de cobertura, SLA por severidad y horas incluidas."
        actions={
          isAdmin && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Nuevo plan
            </Button>
          )
        }
      />

      {plansQuery.error && <ErrorBanner error={plansQuery.error} />}
      {duplicatePlan.error && <ErrorBanner error={duplicatePlan.error} />}

      {plansQuery.isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Layers className="h-5 w-5" />}
            title="No hay planes todavía"
            description="Creá el primero para poder asignar contratos."
            action={
              isAdmin && (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Nuevo plan
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.map((plan) => {
            const responseMap = plan.response_sla_by_severity || plan.sla_by_severity
            return (
              <Card key={plan.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{plan.name}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {coverageLabel(
                        plan.window_coverage.days,
                        plan.window_coverage.start_hour,
                        plan.window_coverage.end_hour,
                      )}{' '}
                      · {plan.window_coverage.timezone}
                    </p>
                  </div>
                  <Badge tone="bg-indigo-50 text-indigo-700 ring-indigo-600/20">
                    {formatHours(plan.hours_bank_default)} / mes
                  </Badge>
                </div>

                <div className="mt-4 overflow-hidden rounded-lg ring-1 ring-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Severidad</th>
                        <th className="px-3 py-2 font-medium">Respuesta</th>
                        <th className="px-3 py-2 font-medium">Resolución</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
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

                {plan.what_covers && plan.what_covers.length > 0 && (
                  <div className="mt-3 flex flex-1 flex-wrap content-start gap-1.5">
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

                {isAdmin && (
                  <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(plan)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => duplicatePlan.mutate(plan.id)}
                      loading={
                        duplicatePlan.isPending && duplicatePlan.variables === plan.id
                      }
                    >
                      <Copy className="h-3.5 w-3.5" /> Duplicar
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Editar ${editing.name}` : 'Nuevo plan'}
        description="Los SLA se expresan en horas de cobertura, no de reloj."
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5" id="plan-form">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre">
              <Input
                required
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Plan Prioritario"
              />
            </Field>
            <Field label="Horas de banco por defecto">
              <Input
                type="number"
                min="1"
                step="0.5"
                required
                value={form.hours}
                onChange={(event) =>
                  setForm((current) => ({ ...current, hours: event.target.value }))
                }
              />
            </Field>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700">Ventana de cobertura</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(index)}
                  className={cn(
                    'h-8 rounded-lg px-3 text-xs font-medium ring-1 transition',
                    form.days.includes(index)
                      ? 'bg-indigo-50 text-indigo-700 ring-indigo-500'
                      : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Desde (hora)">
                <Input
                  type="number"
                  min="0"
                  max="23"
                  required
                  value={form.start}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, start: event.target.value }))
                  }
                />
              </Field>
              <Field label="Hasta (hora)">
                <Input
                  type="number"
                  min="1"
                  max="24"
                  required
                  value={form.end}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, end: event.target.value }))
                  }
                />
              </Field>
              <Field label="Zona horaria">
                <Input
                  required
                  value={form.timezone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, timezone: event.target.value }))
                  }
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Feriados" hint="Un YYYY-MM-DD por línea. No corren para el SLA.">
                <Textarea
                  rows={2}
                  value={form.holidays}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, holidays: event.target.value }))
                  }
                  placeholder="2026-01-01"
                />
              </Field>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700">Tiempos por severidad</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Dejá vacía la primera respuesta para usar el mismo plazo que la resolución.
            </p>
            <div className="mt-2 overflow-x-auto rounded-lg ring-1 ring-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Severidad</th>
                    <th className="px-3 py-2 font-medium">Primera respuesta (h)</th>
                    <th className="px-3 py-2 font-medium">Resolución (h)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {SEVERITIES.map((severity) => (
                    <tr key={severity}>
                      <td className="px-3 py-2 text-slate-700">
                        {SEVERITY_LABELS[severity]}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0.25"
                          step="0.25"
                          value={form.response[severity]}
                          onChange={(event) => setResponse(severity, event.target.value)}
                          placeholder="= resolución"
                          className="h-8"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0.25"
                          step="0.25"
                          required
                          value={form.resolution[severity]}
                          onChange={(event) => setResolution(severity, event.target.value)}
                          className="h-8"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Field label="Qué cubre" hint="Un ítem por línea.">
            <Textarea
              rows={3}
              value={form.covers}
              onChange={(event) =>
                setForm((current) => ({ ...current, covers: event.target.value }))
              }
              placeholder={'Incidentes\nMantenimiento preventivo'}
            />
          </Field>

          <ErrorBanner error={error} />
        </form>
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)} type="button">
            Cancelar
          </Button>
          <Button
            type="submit"
            form="plan-form"
            loading={savePlan.isPending}
            disabled={form.days.length === 0}
          >
            {editing ? 'Guardar cambios' : 'Crear plan'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
