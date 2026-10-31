import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Filter,
  Inbox,
  Plus,
  Search,
  Ticket as TicketIcon,
  X,
} from 'lucide-react'

import { get, post } from '../lib/api'
import { useAuth } from '../lib/auth'
import { SEVERITY_LABELS, STATUS_LABELS, TYPE_LABELS } from '../lib/format'
import type {
  Contract,
  Ticket,
  TicketSeverity,
  TicketStatus,
  TicketType,
} from '../lib/types'
import {
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
import {
  SeverityBadge,
  SlaBadge,
  StatusBadge,
  TypeBadge,
} from '../components/ticket-badges'

const STATUS_OPTIONS: TicketStatus[] = [
  'abierto',
  'en_progreso',
  'esperando_cliente',
  'resuelto',
  'cerrado',
]

function contractLabel(contract: Contract): string {
  const client = contract.application?.client?.name
  const application = contract.application?.name
  if (client && application) return `${client} · ${application}`
  return `Contrato #${contract.id}`
}

export default function Tickets() {
  const { isAgency } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [status, setStatus] = useState<string>('')
  const [type, setType] = useState<string>('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(searchParams.get('new') === '1')
  const [formError, setFormError] = useState<unknown>(null)

  const [contractId, setContractId] = useState(searchParams.get('contract') || '')
  const [ticketType, setTicketType] = useState<TicketType>('soporte')
  const [severity, setSeverity] = useState<TicketSeverity>('normal')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (searchParams.get('new') === '1') setOpen(true)
    const preset = searchParams.get('contract')
    if (preset) setContractId(preset)
  }, [searchParams])

  useEffect(() => {
    const timeout = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timeout)
  }, [search])

  const contractsQuery = useQuery<Contract[]>({
    queryKey: ['contracts'],
    queryFn: () => get<Contract[]>('/contracts'),
  })

  const ticketsQuery = useQuery<Ticket[]>({
    queryKey: ['tickets', { status, type, query }],
    queryFn: () => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (type) params.set('type', type)
      if (query) params.set('q', query)
      const suffix = params.toString()
      return get<Ticket[]>(`/tickets${suffix ? `?${suffix}` : ''}`)
    },
  })

  const contracts = useMemo(
    () => (contractsQuery.data || []).filter((contract) => contract.state === 'activo'),
    [contractsQuery.data],
  )

  useEffect(() => {
    if (!contractId && contracts.length === 1) setContractId(String(contracts[0].id))
  }, [contracts, contractId])

  const createTicket = useMutation({
    mutationFn: (payload: unknown) => post<Ticket>('/tickets', payload),
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['contract-tickets'] })
      closeModal()
      navigate(`/tickets/${ticket.id}`)
    },
    onError: (error) => setFormError(error),
  })

  function closeModal() {
    setOpen(false)
    setFormError(null)
    if (searchParams.has('new') || searchParams.has('contract')) {
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      next.delete('contract')
      setSearchParams(next, { replace: true })
    }
  }

  function openModal() {
    setFormError(null)
    if (contracts.length === 1) setContractId(String(contracts[0].id))
    setOpen(true)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    createTicket.mutate({
      contract_id: Number(contractId),
      type: ticketType,
      severity: ticketType === 'soporte' ? severity : null,
      title: title.trim(),
      description: description.trim() || null,
    })
  }

  const tickets = ticketsQuery.data || []
  const hasFilters = Boolean(status || type || query)

  return (
    <div className="space-y-5">
      <PageHeader
        title={isAgency ? 'Tickets' : 'Mis tickets'}
        subtitle={
          isAgency
            ? 'Soporte y funcionalidad, con SLA y consumo de horas.'
            : 'Seguí el estado de cada pedido y respondé al equipo.'
        }
        actions={
          <Button onClick={openModal}>
            <Plus className="h-4 w-4" />
            Nuevo ticket
          </Button>
        }
      />

      <Card className="p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título…"
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <div className="relative w-40">
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="pl-8"
              >
                <option value="">Todos los estados</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABELS[option]}
                  </option>
                ))}
              </Select>
            </div>
            <Select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="w-40"
            >
              <option value="">Todos los tipos</option>
              <option value="soporte">Soporte</option>
              <option value="funcionalidad">Funcionalidad</option>
            </Select>
            {hasFilters && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStatus('')
                  setType('')
                  setSearch('')
                }}
                title="Limpiar filtros"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {ticketsQuery.error && <ErrorBanner error={ticketsQuery.error} />}

      <Card>
        {ticketsQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner />
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title={hasFilters ? 'No hay tickets con esos filtros' : 'Todavía no hay tickets'}
            description={
              hasFilters
                ? 'Probá quitando filtros o buscando otro término.'
                : 'Abrí el primero y el equipo lo toma desde el tablero.'
            }
            action={
              !hasFilters && (
                <Button size="sm" onClick={openModal}>
                  <Plus className="h-4 w-4" /> Nuevo ticket
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Ticket</th>
                    {isAgency && <th className="px-3 py-2.5 font-medium">Cliente</th>}
                    <th className="px-3 py-2.5 font-medium">Tipo</th>
                    <th className="px-3 py-2.5 font-medium">Severidad</th>
                    <th className="px-3 py-2.5 font-medium">Estado</th>
                    <th className="px-3 py-2.5 font-medium">SLA</th>
                    <th className="px-5 py-2.5 text-right font-medium">Horas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="group transition hover:bg-slate-50">
                      <td className="max-w-[24rem] px-5 py-3">
                        <Link to={`/tickets/${ticket.id}`} className="block">
                          <p className="truncate font-medium text-slate-900 group-hover:text-indigo-700">
                            #{ticket.id} · {ticket.title}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {ticket.application_name}
                          </p>
                        </Link>
                      </td>
                      {isAgency && (
                        <td className="px-3 py-3 text-slate-600">{ticket.client_name}</td>
                      )}
                      <td className="px-3 py-3">
                        <TypeBadge type={ticket.type} />
                      </td>
                      <td className="px-3 py-3">
                        <SeverityBadge severity={ticket.severity} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={ticket.status} />
                      </td>
                      <td className="px-3 py-3">
                        <SlaBadge
                          state={ticket.resolution_state}
                          deadline={ticket.resolution_deadline}
                          showCountdown
                        />
                      </td>
                      <td className="px-5 py-3 text-right text-slate-600">
                        {ticket.hours_logged > 0 ? `${ticket.hours_logged} h` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-slate-100 md:hidden">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link to={`/tickets/${ticket.id}`} className="block px-4 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-900">
                        #{ticket.id} · {ticket.title}
                      </p>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {ticket.client_name} · {ticket.application_name}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <TypeBadge type={ticket.type} />
                      <SeverityBadge severity={ticket.severity} />
                      <SlaBadge state={ticket.resolution_state} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Modal
        open={open}
        onClose={closeModal}
        title="Nuevo ticket"
        description="El tipo define si consume banco de horas y si tiene SLA."
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4" id="new-ticket-form">
          <Field label="Contrato / servicio">
            <Select
              required
              value={contractId}
              onChange={(event) => setContractId(event.target.value)}
              disabled={contractsQuery.isLoading || contracts.length === 0}
            >
              <option value="" disabled>
                Elegí un contrato
              </option>
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contractLabel(contract)} · {contract.plan?.name}
                </option>
              ))}
            </Select>
          </Field>

          {!contractsQuery.isLoading && contracts.length === 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20">
              No hay contratos activos. Un administrador tiene que crear uno antes de abrir
              tickets.
            </p>
          )}

          <div>
            <span className="text-sm font-medium text-slate-700">Tipo de ticket</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(['soporte', 'funcionalidad'] as TicketType[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTicketType(option)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition ${
                    ticketType === option
                      ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500'
                      : 'border-slate-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-sm font-medium text-slate-900">
                    {TYPE_LABELS[option]}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {option === 'soporte'
                      ? 'Incidente o mantenimiento · descuenta horas'
                      : 'Pedido nuevo · se cotiza aparte'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {ticketType === 'soporte' && (
            <Field label="Severidad" hint="Define el plazo de respuesta y resolución.">
              <Select
                value={severity}
                onChange={(event) => setSeverity(event.target.value as TicketSeverity)}
              >
                {(Object.keys(SEVERITY_LABELS) as TicketSeverity[]).map((option) => (
                  <option key={option} value={option}>
                    {SEVERITY_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Título">
            <Input
              required
              minLength={3}
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ej.: no puedo entrar al portal"
            />
          </Field>

          <Field label="Descripción" hint="Contanos qué pasa, desde cuándo y a quién afecta.">
            <Textarea
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Detalle del problema o pedido…"
            />
          </Field>

          <ErrorBanner error={formError} />
        </form>

        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={closeModal} type="button">
            Cancelar
          </Button>
          <Button
            type="submit"
            form="new-ticket-form"
            loading={createTicket.isPending}
            disabled={contracts.length === 0}
          >
            <TicketIcon className="h-4 w-4" />
            Crear ticket
          </Button>
        </div>
      </Modal>
    </div>
  )
}
