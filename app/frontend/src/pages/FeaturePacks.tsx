import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Boxes,
  Check,
  ChevronRight,
  Clock,
  Package,
  Plus,
  X,
} from 'lucide-react'

import { get, post, put } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDay, formatHours, formatMoney } from '../lib/format'
import type { Contract, FeaturePack, PackStatus, Ticket } from '../lib/types'
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
import { PackStatusBadge, StatusBadge } from '../components/ticket-badges'

const STATUS_FILTERS: { value: PackStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'propuesto', label: 'Propuestos' },
  { value: 'aprobado', label: 'Aprobados' },
  { value: 'en_desarrollo', label: 'En desarrollo' },
  { value: 'entregado', label: 'Entregados' },
  { value: 'facturado', label: 'Facturados' },
  { value: 'rechazado', label: 'Rechazados' },
]

interface PackForm {
  contract_id: string
  name: string
  description: string
  hours: string
  price: string
  currency: string
  ticketIds: number[]
}

function blankForm(): PackForm {
  return {
    contract_id: '',
    name: '',
    description: '',
    hours: '16',
    price: '0',
    currency: 'USD',
    ticketIds: [],
  }
}

function PackCard({ pack, isAgency }: { pack: FeaturePack; isAgency: boolean }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{pack.name}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {pack.client_name} · {pack.application_name}
          </p>
        </div>
        <PackStatusBadge status={pack.status} />
      </div>

      {pack.description && (
        <p className="text-sm text-slate-600 line-clamp-2">{pack.description}</p>
      )}

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
          <div className="text-slate-400">Estimado</div>
          <div className="font-semibold text-slate-800">
            {formatHours(pack.hours_estimated)}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
          <div className="text-slate-400">Real</div>
          <div className="font-semibold text-slate-800">{formatHours(pack.hours_real)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
          <div className="text-slate-400">Precio</div>
          <div className="font-semibold text-slate-800">
            {formatMoney(pack.price, pack.currency)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Package className="h-3.5 w-3.5" />
        {pack.tickets.length} ticket{pack.tickets.length === 1 ? '' : 's'}
        {pack.decided_at && <span>· decidido {formatDay(pack.decided_at)}</span>}
      </div>

      {pack.rejection_reason && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {pack.rejection_reason}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          {isAgency ? `Pack #${pack.id}` : ''}
        </span>
        <Link to={`/feature-packs/${pack.id}`}>
          <Button variant="ghost" size="sm">
            Ver detalle
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </Card>
  )
}

export default function FeaturePacks() {
  const { isAgency } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = (searchParams.get('status') as PackStatus | 'all') || 'all'

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<PackForm>(blankForm)
  const [error, setError] = useState<string | null>(null)

  const packsQuery = useQuery<FeaturePack[]>({
    queryKey: ['feature-packs', statusFilter],
    queryFn: () =>
      get<FeaturePack[]>(
        statusFilter === 'all' ? '/feature-packs' : `/feature-packs?status=${statusFilter}`,
      ),
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

  const candidatesQuery = useQuery<{ id: number; title: string; status: string }[]>({
    queryKey: ['pack-candidates', form.contract_id],
    queryFn: () =>
      get<{ id: number; title: string; status: string }[]>(
        `/feature-packs/contracts/${form.contract_id}/candidates`,
      ),
    enabled: isAgency && open && Boolean(form.contract_id),
  })

  const createPack = useMutation({
    mutationFn: (payload: unknown) => post<FeaturePack>('/feature-packs', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-packs'] })
      setOpen(false)
      setForm(blankForm())
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Error al crear el pack'),
  })

  const decidePack = useMutation({
    mutationFn: ({ id, approve, reason }: { id: number; approve: boolean; reason?: string }) =>
      post<FeaturePack>(`/feature-packs/${id}/decision`, { approve, reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feature-packs'] }),
    onError: (err) => setError(err instanceof Error ? err.message : 'Error al decidir'),
  })

  const advancePack = useMutation({
    mutationFn: ({ id, status }: { id: number; status: PackStatus }) =>
      post<FeaturePack>(`/feature-packs/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feature-packs'] }),
    onError: (err) => setError(err instanceof Error ? err.message : 'Error al avanzar'),
  })

  const packs = packsQuery.data || []

  function toggleTicket(id: number) {
    setForm((prev) => ({
      ...prev,
      ticketIds: prev.ticketIds.includes(id)
        ? prev.ticketIds.filter((item) => item !== id)
        : [...prev.ticketIds, id],
    }))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!form.contract_id) return setError('Elegí un contrato')
    if (form.ticketIds.length === 0) return setError('Elegí al menos un ticket de funcionalidad')
    createPack.mutate({
      contract_id: Number(form.contract_id),
      name: form.name.trim(),
      description: form.description.trim() || null,
      hours_estimated: Number(form.hours),
      price: Number(form.price),
      currency: form.currency,
      ticket_ids: form.ticketIds,
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={isAgency ? 'Packs de funcionalidades' : 'Mis packs'}
        subtitle={
          isAgency
            ? 'Agrupá funcionalidades nuevas, cotizalas y seguí su aprobación y facturación.'
            : 'Cotizaciones de funcionalidades nuevas que tu proveedor propuso.'
        }
        actions={
          isAgency ? (
            <Button onClick={() => { setError(null); setForm(blankForm()); setOpen(true) }}>
              <Plus className="h-4 w-4" />
              Nuevo pack
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => {
              const next = new URLSearchParams(searchParams)
              if (filter.value === 'all') next.delete('status')
              else next.set('status', filter.value)
              setSearchParams(next)
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              statusFilter === filter.value
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error && <ErrorBanner error={new Error(error)} />}
      {packsQuery.error && <ErrorBanner error={packsQuery.error} />}

      {packsQuery.isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : packs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Boxes className="h-5 w-5" />}
            title={isAgency ? 'Todavía no hay packs' : 'No hay packs'}
            description={
              isAgency
                ? 'Creá un pack a partir de tickets de funcionalidad para cotizar y facturar aparte del banco de horas.'
                : 'Cuando tu proveedor proponga funcionalidades nuevas, vas a verlas acá para aprobarlas o rechazarlas.'
            }
            action={
              isAgency ? (
                <Button onClick={() => { setError(null); setForm(blankForm()); setOpen(true) }}>
                  <Plus className="h-4 w-4" />
                  Nuevo pack
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {packs.map((pack) => (
            <PackCard key={pack.id} pack={pack} isAgency={isAgency} />
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo pack de funcionalidades">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Contrato">
            <Select
              value={form.contract_id}
              onChange={(event) =>
                setForm({ ...form, contract_id: event.target.value, ticketIds: [] })
              }
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

          <Field label="Nombre del pack">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ej: Exportaciones y reportes"
              required
            />
          </Field>

          <Field label="Alcance" hint="Qué funcionalidades incluye">
            <Textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={3}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Horas estimadas">
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={form.hours}
                onChange={(event) => setForm({ ...form, hours: event.target.value })}
                required
              />
            </Field>
            <Field label="Precio">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
                required
              />
            </Field>
            <Field label="Moneda">
              <Select
                value={form.currency}
                onChange={(event) => setForm({ ...form, currency: event.target.value })}
              >
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
                <option value="EUR">EUR</option>
              </Select>
            </Field>
          </div>

          <Field
            label="Tickets de funcionalidad"
            hint="Solo se pueden agrupar tickets que todavía no están en otro pack"
          >
            {!form.contract_id ? (
              <p className="text-xs text-slate-400">Elegí un contrato para ver sus tickets.</p>
            ) : candidatesQuery.isLoading ? (
              <Spinner className="h-4 w-4" />
            ) : (candidatesQuery.data || []).length === 0 ? (
              <p className="text-xs text-slate-400">
                Este contrato no tiene tickets de funcionalidad libres.
              </p>
            ) : (
              <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {(candidatesQuery.data || []).map((ticket) => (
                  <label
                    key={ticket.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      checked={form.ticketIds.includes(ticket.id)}
                      onChange={() => toggleTicket(ticket.id)}
                    />
                    <span className="truncate">
                      #{ticket.id} · {ticket.title}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createPack.isPending}>
              {createPack.isPending ? 'Creando…' : 'Crear pack'}
            </Button>
          </div>
        </form>
      </Modal>

      {isAgency && packs.some((pack) => pack.status === 'aprobado') && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900">Avanzar estado</h3>
          <p className="mb-3 mt-0.5 text-xs text-slate-500">
            Los packs aprobados por el cliente se pueden pasar a desarrollo, entrega y facturación.
          </p>
          <div className="space-y-2">
            {packs
              .filter((pack) => pack.status === 'aprobado' || pack.status === 'en_desarrollo' || pack.status === 'entregado')
              .map((pack) => (
                <div
                  key={pack.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {pack.name}
                    </div>
                    <div className="text-xs text-slate-500">{pack.client_name}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <PackStatusBadge status={pack.status} />
                    {pack.status === 'aprobado' && (
                      <Button
                        size="sm"
                        onClick={() => advancePack.mutate({ id: pack.id, status: 'en_desarrollo' })}
                      >
                        <Clock className="h-4 w-4" />
                        Desarrollo
                      </Button>
                    )}
                    {pack.status === 'en_desarrollo' && (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => advancePack.mutate({ id: pack.id, status: 'entregado' })}
                      >
                        <Check className="h-4 w-4" />
                        Entregar
                      </Button>
                    )}
                    {pack.status === 'entregado' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => advancePack.mutate({ id: pack.id, status: 'facturado' })}
                      >
                        Facturar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      {!isAgency && (
        <PendingDecisions
          packs={packs.filter((pack) => pack.status === 'propuesto')}
          onDecide={(id, approve, reason) => decidePack.mutate({ id, approve, reason })}
        />
      )}
    </div>
  )
}

function PendingDecisions({
  packs,
  onDecide,
}: {
  packs: FeaturePack[]
  onDecide: (id: number, approve: boolean, reason?: string) => void
}) {
  const [rejecting, setRejecting] = useState<FeaturePack | null>(null)
  const [reason, setReason] = useState('')

  if (packs.length === 0) return null

  return (
    <Card className="border-2 border-amber-200 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Packs esperando tu decisión</h3>
      <p className="mb-3 mt-0.5 text-xs text-slate-500">
        Aprobá o rechazá las cotizaciones de funcionalidades nuevas.
      </p>
      <div className="space-y-2">
        {packs.map((pack) => (
          <div
            key={pack.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-800">{pack.name}</div>
              <div className="text-xs text-slate-500">
                {formatHours(pack.hours_estimated)} · {formatMoney(pack.price, pack.currency)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="success" onClick={() => onDecide(pack.id, true)}>
                <Check className="h-4 w-4" />
                Aprobar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setRejecting(pack)
                  setReason('')
                }}
              >
                <X className="h-4 w-4" />
                Rechazar
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Rechazar pack"
      >
        <div className="space-y-4">
          <Field label="Motivo del rechazo">
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim()}
              onClick={() => {
                if (rejecting) onDecide(rejecting.id, false, reason.trim())
                setRejecting(null)
              }}
            >
              Rechazar pack
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
