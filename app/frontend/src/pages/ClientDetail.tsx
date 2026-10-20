import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  AppWindow,
  Mail,
  Phone,
  Plus,
  Server,
} from 'lucide-react'

import { get, post } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatHours } from '../lib/format'
import type { Application, Client, Contract, Plan } from '../lib/types'
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
} from '../components/ui'

export default function ClientDetail() {
  const { id } = useParams()
  const clientId = Number(id)
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()

  const [appOpen, setAppOpen] = useState(false)
  const [appName, setAppName] = useState('')
  const [appDescription, setAppDescription] = useState('')
  const [appError, setAppError] = useState<unknown>(null)

  const [contractApp, setContractApp] = useState<Application | null>(null)
  const [planId, setPlanId] = useState('')
  const [hours, setHours] = useState('60')
  const [cutDay, setCutDay] = useState('1')
  const [rate, setRate] = useState('0')
  const [currency, setCurrency] = useState('USD')
  const [timezone, setTimezone] = useState('America/Argentina/Buenos_Aires')
  const [contractError, setContractError] = useState<unknown>(null)

  const clientQuery = useQuery<Client>({
    queryKey: ['client', clientId],
    queryFn: () => get<Client>(`/clients/${clientId}`),
    enabled: Number.isFinite(clientId),
  })
  const appsQuery = useQuery<Application[]>({
    queryKey: ['client-apps', clientId],
    queryFn: () => get<Application[]>(`/clients/${clientId}/applications`),
    enabled: Number.isFinite(clientId),
  })
  const contractsQuery = useQuery<Contract[]>({
    queryKey: ['contracts'],
    queryFn: () => get<Contract[]>('/contracts'),
  })
  const plansQuery = useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: () => get<Plan[]>('/plans'),
  })

  const plans = plansQuery.data || []

  const createApplication = useMutation({
    mutationFn: (payload: unknown) =>
      post<Application>(`/clients/${clientId}/applications`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-apps', clientId] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setAppOpen(false)
      setAppName('')
      setAppDescription('')
      setAppError(null)
    },
    onError: (error) => setAppError(error),
  })

  const createContract = useMutation({
    mutationFn: (payload: unknown) =>
      post<Contract>(`/applications/${contractApp?.id}/contracts`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setContractApp(null)
      setContractError(null)
    },
    onError: (error) => setContractError(error),
  })

  function openContractModal(application: Application) {
    const defaultPlan = plans[0]
    setPlanId(defaultPlan ? String(defaultPlan.id) : '')
    setHours(defaultPlan ? String(defaultPlan.hours_bank_default) : '60')
    setTimezone(defaultPlan?.window_coverage.timezone || 'America/Argentina/Buenos_Aires')
    setCutDay('1')
    setRate('0')
    setCurrency('USD')
    setContractError(null)
    setContractApp(application)
  }

  function handlePlanChange(value: string) {
    setPlanId(value)
    const plan = plans.find((item) => String(item.id) === value)
    if (plan) {
      setHours(String(plan.hours_bank_default))
      setTimezone(plan.window_coverage.timezone)
    }
  }

  function handleCreateContract(event: FormEvent) {
    event.preventDefault()
    setContractError(null)
    createContract.mutate({
      plan_id: Number(planId),
      hours_bank_month: Number(hours),
      cut_date_day: Number(cutDay),
      currency: currency.toUpperCase(),
      hourly_rate_extra: Number(rate),
      timezone,
      state: 'activo',
    })
  }

  if (clientQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (clientQuery.error || !clientQuery.data) {
    return (
      <div className="space-y-4">
        <Link
          to="/clients"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a clientes
        </Link>
        <ErrorBanner error={clientQuery.error || 'Cliente no encontrado'} />
      </div>
    )
  }

  const client = clientQuery.data
  const applications = appsQuery.data || []
  const contracts = contractsQuery.data || []

  function activeContract(applicationId: number) {
    return contracts.find(
      (contract) =>
        contract.application_id === applicationId && contract.state === 'activo',
    )
  }

  return (
    <div className="space-y-5">
      <Link
        to="/clients"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a clientes
      </Link>

      <PageHeader
        title={client.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {client.contacts?.email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {client.contacts.email}
              </span>
            )}
            {client.contacts?.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {client.contacts.phone}
              </span>
            )}
            {!client.contacts?.email && !client.contacts?.phone && 'Sin datos de contacto'}
          </span>
        }
        actions={
          isAdmin && (
            <Button onClick={() => setAppOpen(true)}>
              <Plus className="h-4 w-4" /> Nueva aplicación
            </Button>
          )
        }
      />

      {appsQuery.error && <ErrorBanner error={appsQuery.error} />}

      {applications.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Server className="h-5 w-5" />}
            title="El cliente todavía no tiene aplicaciones"
            description="Agregá la primera para poder asignarle un plan y banco de horas."
            action={
              isAdmin && (
                <Button size="sm" onClick={() => setAppOpen(true)}>
                  <Plus className="h-4 w-4" /> Nueva aplicación
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {applications.map((application) => {
            const contract = activeContract(application.id)
            return (
              <Card key={application.id} className="flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <AppWindow className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{application.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {application.description || 'Sin descripción'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex-1 rounded-lg bg-slate-50 p-3">
                  {contract ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          Plan {contract.plan?.name}
                        </span>
                        <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
                          Activo
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatHours(contract.hours_bank_month)} / mes · corte día{' '}
                        {contract.cut_date_day} · {contract.currency}{' '}
                        {contract.hourly_rate_extra}/h extra
                      </p>
                      <Link
                        to={`/contracts/${contract.id}`}
                        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Ver contrato y banco <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          Sin contrato activo
                        </p>
                        <p className="text-xs text-slate-500">
                          Asignale un plan para habilitar tickets y banco de horas.
                        </p>
                      </div>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openContractModal(application)}
                        >
                          <Plus className="h-3.5 w-3.5" /> Crear contrato
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={appOpen}
        onClose={() => setAppOpen(false)}
        title="Nueva aplicación"
        description={`Se agrega a ${client.name}.`}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            setAppError(null)
            createApplication.mutate({
              name: appName.trim(),
              description: appDescription.trim() || null,
            })
          }}
          className="space-y-4"
          id="new-app-form"
        >
          <Field label="Nombre">
            <Input
              required
              value={appName}
              onChange={(event) => setAppName(event.target.value)}
              placeholder="Portal de clientes"
            />
          </Field>
          <Field label="Descripción">
            <Textarea
              rows={3}
              value={appDescription}
              onChange={(event) => setAppDescription(event.target.value)}
              placeholder="Qué hace esta aplicación…"
            />
          </Field>
          <ErrorBanner error={appError} />
        </form>
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setAppOpen(false)} type="button">
            Cancelar
          </Button>
          <Button type="submit" form="new-app-form" loading={createApplication.isPending}>
            Crear aplicación
          </Button>
        </div>
      </Modal>

      <Modal
        open={contractApp !== null}
        onClose={() => setContractApp(null)}
        title="Nuevo contrato"
        description={
          contractApp
            ? `${contractApp.name} · si ya hay un contrato activo, archivalo primero.`
            : undefined
        }
        size="lg"
      >
        <form onSubmit={handleCreateContract} className="space-y-4" id="new-contract-form">
          <Field label="Plan">
            <Select required value={planId} onChange={(event) => handlePlanChange(event.target.value)}>
              <option value="" disabled>
                Elegí un plan
              </option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} · {plan.hours_bank_default} h / mes
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Horas por mes">
              <Input
                type="number"
                min="1"
                step="0.5"
                required
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            </Field>
            <Field label="Día de corte" hint="1 a 28, todos los meses.">
              <Input
                type="number"
                min="1"
                max="28"
                required
                value={cutDay}
                onChange={(event) => setCutDay(event.target.value)}
              />
            </Field>
            <Field label="Moneda">
              <Input
                required
                maxLength={3}
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Tarifa hora extra">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
              />
            </Field>
          </div>

          <Field label="Zona horaria" hint="Se usa para la ventana de cobertura del SLA.">
            <Input
              required
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            />
          </Field>

          <ErrorBanner error={contractError} />
        </form>
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setContractApp(null)} type="button">
            Cancelar
          </Button>
          <Button type="submit" form="new-contract-form" loading={createContract.isPending}>
            Crear contrato
          </Button>
        </div>
      </Modal>
    </div>
  )
}
