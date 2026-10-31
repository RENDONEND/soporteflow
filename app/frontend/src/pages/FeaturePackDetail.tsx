import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  Clock,
  Package,
  Receipt,
  X,
} from 'lucide-react'

import { get, post } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, formatHours, formatMoney } from '../lib/format'
import type { FeaturePack, PackStatus } from '../lib/types'
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Modal,
  PageHeader,
  Spinner,
  Textarea,
  cn,
} from '../components/ui'
import { PackStatusBadge, StatusBadge } from '../components/ticket-badges'

const FLOW: PackStatus[] = [
  'propuesto',
  'aprobado',
  'en_desarrollo',
  'entregado',
  'facturado',
]

const STEP_LABELS: Record<PackStatus, string> = {
  propuesto: 'Propuesto',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  en_desarrollo: 'En desarrollo',
  entregado: 'Entregado',
  facturado: 'Facturado',
}

export default function FeaturePackDetail() {
  const { id } = useParams()
  const packId = Number(id)
  const { isAgency } = useAuth()
  const queryClient = useQueryClient()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const packQuery = useQuery<FeaturePack>({
    queryKey: ['feature-pack', packId],
    queryFn: () => get<FeaturePack>(`/feature-packs/${packId}`),
    enabled: Number.isFinite(packId),
  })

  const decide = useMutation({
    mutationFn: ({ approve, reason: text }: { approve: boolean; reason?: string }) =>
      post<FeaturePack>(`/feature-packs/${packId}/decision`, { approve, reason: text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-pack', packId] })
      queryClient.invalidateQueries({ queryKey: ['feature-packs'] })
      setRejectOpen(false)
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Error'),
  })

  const advance = useMutation({
    mutationFn: (status: PackStatus) =>
      post<FeaturePack>(`/feature-packs/${packId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-pack', packId] })
      queryClient.invalidateQueries({ queryKey: ['feature-packs'] })
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Error'),
  })

  if (packQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (packQuery.error || !packQuery.data) {
    return <ErrorBanner error={packQuery.error || new Error('Pack no encontrado')} />
  }

  const pack = packQuery.data
  const currentIndex = FLOW.indexOf(pack.status)
  const isRejected = pack.status === 'rechazado'
  const nextStatus: PackStatus | null =
    pack.status === 'aprobado'
      ? 'en_desarrollo'
      : pack.status === 'en_desarrollo'
        ? 'entregado'
        : pack.status === 'entregado'
          ? 'facturado'
          : null

  return (
    <div className="space-y-5">
      <Link
        to="/feature-packs"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a packs
      </Link>

      <PageHeader
        title={pack.name}
        subtitle={`${pack.client_name} · ${pack.application_name}`}
        actions={<PackStatusBadge status={pack.status} />}
      />

      {error && <ErrorBanner error={new Error(error)} />}

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          {FLOW.map((step, index) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium',
                  !isRejected && index <= currentIndex
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-500',
                )}
              >
                {index < currentIndex && !isRejected && <Check className="h-3 w-3" />}
                {STEP_LABELS[step]}
              </div>
              {index < FLOW.length - 1 && (
                <div
                  className={cn(
                    'hidden h-px w-6 sm:block',
                    !isRejected && index < currentIndex ? 'bg-indigo-400' : 'bg-slate-200',
                  )}
                />
              )}
            </div>
          ))}
        </div>
        {isRejected && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Rechazado{pack.rejection_reason ? `: ${pack.rejection_reason}` : ''}
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">Alcance</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
            {pack.description || 'Sin descripción.'}
          </p>

          <h3 className="mt-5 text-sm font-semibold text-slate-900">
            Funcionalidades incluidas
          </h3>
          <div className="mt-2 space-y-2">
            {pack.tickets.length === 0 ? (
              <p className="text-sm text-slate-400">No hay tickets vinculados.</p>
            ) : (
              pack.tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/tickets/${ticket.id}`}
                      className="truncate text-sm font-medium text-slate-800 hover:text-indigo-600"
                    >
                      #{ticket.id} · {ticket.title}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {formatHours(ticket.hours_logged)} registradas
                    </div>
                  </div>
                  <StatusBadge status={ticket.status} />
                </div>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-slate-500">
              <Package className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Cotización</span>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Horas estimadas</dt>
                <dd className="font-semibold text-slate-800">
                  {formatHours(pack.hours_estimated)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Horas reales</dt>
                <dd className="font-semibold text-slate-800">{formatHours(pack.hours_real)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Precio</dt>
                <dd className="font-semibold text-slate-800">
                  {formatMoney(pack.price, pack.currency)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Las horas de un pack no descuentan del banco de horas: se factura aparte.
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-slate-500">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Historial</span>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li className="flex justify-between gap-2">
                <span>Creado</span>
                <span className="text-slate-800">{formatDate(pack.created_at)}</span>
              </li>
              {pack.decided_at && (
                <li className="flex justify-between gap-2">
                  <span>Decidido por</span>
                  <span className="text-slate-800">
                    {pack.decided_by_name || '—'} · {formatDate(pack.decided_at)}
                  </span>
                </li>
              )}
              {pack.delivered_at && (
                <li className="flex justify-between gap-2">
                  <span>Entregado</span>
                  <span className="text-slate-800">{formatDate(pack.delivered_at)}</span>
                </li>
              )}
              {pack.billed_at && (
                <li className="flex justify-between gap-2">
                  <span>Facturado</span>
                  <span className="text-slate-800">{formatDate(pack.billed_at)}</span>
                </li>
              )}
            </ul>
          </Card>

          {!isAgency && pack.status === 'propuesto' && (
            <Card className="space-y-2 p-5">
              <h3 className="text-sm font-semibold text-slate-900">Tu decisión</h3>
              <Button
                variant="success"
                className="w-full justify-center"
                onClick={() => decide.mutate({ approve: true })}
                disabled={decide.isPending}
              >
                <Check className="h-4 w-4" />
                Aprobar pack
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-center"
                onClick={() => {
                  setReason('')
                  setRejectOpen(true)
                }}
              >
                <X className="h-4 w-4" />
                Rechazar
              </Button>
            </Card>
          )}

          {isAgency && nextStatus && (
            <Card className="space-y-2 p-5">
              <h3 className="text-sm font-semibold text-slate-900">Avanzar</h3>
              {pack.status === 'entregado' && (
                <Link to={`/contracts/${pack.contract_id}`} className="block">
                  <Button variant="secondary" className="w-full justify-center">
                    <Receipt className="h-4 w-4" />
                    Ver contrato
                  </Button>
                </Link>
              )}
              <Button
                className="w-full justify-center"
                variant={pack.status === 'en_desarrollo' ? 'success' : 'primary'}
                onClick={() => advance.mutate(nextStatus)}
                disabled={advance.isPending}
              >
                {pack.status === 'aprobado' && 'Pasar a desarrollo'}
                {pack.status === 'en_desarrollo' && 'Marcar entregado'}
                {pack.status === 'entregado' && 'Marcar facturado'}
              </Button>
            </Card>
          )}
        </div>
      </div>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Rechazar pack">
        <div className="space-y-4">
          <Field label="Motivo del rechazo">
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim() || decide.isPending}
              onClick={() => decide.mutate({ approve: false, reason: reason.trim() })}
            >
              Rechazar pack
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
