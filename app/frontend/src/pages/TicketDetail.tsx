import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Boxes,
  CalendarClock,
  Clock,
  Download,
  FileUp,
  MessageSquare,
  Package,
  Paperclip,
  Send,
  Timer,
  UserRound,
} from 'lucide-react'

import { downloadFile, get, patch, post } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  SEVERITY_LABELS,
  STATUS_LABELS,
  formatBytes,
  formatDate,
  formatHours,
  formatMoney,
  timeLeft,
} from '../lib/format'
import type { Ticket, TicketSeverity, TicketStatus, User } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
  cn,
} from '../components/ui'
import {
  PackStatusBadge,
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

export default function TicketDetail() {
  const { id } = useParams()
  const ticketId = Number(id)
  const { isAgency, isAdmin } = useAuth()
  const queryClient = useQueryClient()

  const [comment, setComment] = useState('')
  const [internal, setInternal] = useState(false)
  const [hours, setHours] = useState('')
  const [note, setNote] = useState('')
  const [commentError, setCommentError] = useState<unknown>(null)
  const [logError, setLogError] = useState<unknown>(null)
  const [uploadError, setUploadError] = useState<unknown>(null)

  const ticketQuery = useQuery<Ticket>({
    queryKey: ['ticket', ticketId],
    queryFn: () => get<Ticket>(`/tickets/${ticketId}`),
    enabled: Number.isFinite(ticketId),
  })

  const usersQuery = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => get<User[]>('/users'),
    enabled: isAdmin,
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] })
    queryClient.invalidateQueries({ queryKey: ['tickets'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['contract-tickets'] })
    if (ticketQuery.data) {
      queryClient.invalidateQueries({ queryKey: ['bank', ticketQuery.data.contract_id] })
    }
  }

  const addComment = useMutation({
    mutationFn: () =>
      post<Ticket>(`/tickets/${ticketId}/comments`, {
        body: comment.trim(),
        internal,
      }),
    onSuccess: () => {
      setComment('')
      setInternal(false)
      invalidate()
    },
    onError: (error) => setCommentError(error),
  })

  const addTimeLog = useMutation({
    mutationFn: () =>
      post<Ticket>(`/tickets/${ticketId}/time-logs`, {
        hours: Number(hours),
        note: note.trim() || null,
      }),
    onSuccess: () => {
      setHours('')
      setNote('')
      invalidate()
    },
    onError: (error) => setLogError(error),
  })

  const updateTicket = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      patch<Ticket>(`/tickets/${ticketId}`, payload),
    onSuccess: () => invalidate(),
  })

  const [uploading, setUploading] = useState(false)

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadError(null)
    const form = new FormData()
    form.append('file', file)
    try {
      await post(`/tickets/${ticketId}/attachments`, form)
      invalidate()
    } catch (error) {
      setUploadError(error)
    } finally {
      setUploading(false)
    }
  }

  function handleComment(event: FormEvent) {
    event.preventDefault()
    setCommentError(null)
    if (!comment.trim()) return
    addComment.mutate()
  }

  function handleTimeLog(event: FormEvent) {
    event.preventDefault()
    setLogError(null)
    if (!hours || Number(hours) <= 0) return
    addTimeLog.mutate()
  }

  if (ticketQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (ticketQuery.error || !ticketQuery.data) {
    return (
      <div className="space-y-4">
        <Link
          to="/tickets"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a tickets
        </Link>
        <ErrorBanner error={ticketQuery.error || 'Ticket no encontrado'} />
      </div>
    )
  }

  const ticket = ticketQuery.data
  const agentUsers = (usersQuery.data || []).filter((user) => user.role !== 'cliente')

  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/tickets"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a tickets
        </Link>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={ticket.status} />
            <TypeBadge type={ticket.type} />
            <SeverityBadge severity={ticket.severity} />
            <SlaBadge
              state={ticket.resolution_state}
              deadline={ticket.resolution_deadline}
              showCountdown
            />
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            #{ticket.id} · {ticket.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {ticket.client_name} · {ticket.application_name} · Plan {ticket.plan_name}
          </p>
        </div>

        {isAgency && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={ticket.status}
              onChange={(event) =>
                updateTicket.mutate({ status: event.target.value as TicketStatus })
              }
              disabled={updateTicket.isPending}
              className="w-44"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
            <Select
              value={ticket.severity || ''}
              onChange={(event) =>
                updateTicket.mutate({ severity: event.target.value as TicketSeverity })
              }
              disabled={updateTicket.isPending || ticket.type === 'funcionalidad'}
              className="w-36"
            >
              {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            {isAdmin && (
              <Select
                value={ticket.assigned_to ? String(ticket.assigned_to) : ''}
                onChange={(event) =>
                  updateTicket.mutate({
                    assigned_to: event.target.value ? Number(event.target.value) : null,
                  })
                }
                disabled={updateTicket.isPending}
                className="w-48"
              >
                <option value="">Sin asignar</option>
                {agentUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        )}
      </div>

      {updateTicket.error && <ErrorBanner error={updateTicket.error} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Descripción</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {ticket.description || 'Sin descripción.'}
            </p>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5">
              <MessageSquare className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900">
                Conversación
                <span className="ml-1.5 font-normal text-slate-400">
                  ({ticket.comments.length})
                </span>
              </h2>
            </div>

            {ticket.comments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">
                Todavía no hay mensajes. Escribí el primero.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {ticket.comments.map((item) => (
                  <li
                    key={item.id}
                    className={cn('px-5 py-4', item.internal && 'bg-amber-50/50')}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {item.user_name || 'Sistema'}
                      </span>
                      {item.internal && (
                        <Badge tone="bg-amber-100 text-amber-800 ring-amber-600/20">
                          Nota interna
                        </Badge>
                      )}
                      <span className="text-xs text-slate-400">
                        {formatDate(item.created_at, ticket.timezone)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {item.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleComment} className="space-y-3 border-t border-slate-200 px-5 py-4">
              <Textarea
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Escribí una respuesta…"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {isAgency ? (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={internal}
                      onChange={(event) => setInternal(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Nota interna (el cliente no la ve)
                  </label>
                ) : (
                  <span className="text-xs text-slate-500">
                    El equipo recibe una notificación con tu mensaje.
                  </span>
                )}
                <Button
                  type="submit"
                  size="sm"
                  loading={addComment.isPending}
                  disabled={!comment.trim()}
                >
                  <Send className="h-3.5 w-3.5" /> Enviar
                </Button>
              </div>
              <ErrorBanner error={commentError} />
            </form>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5">
              <Paperclip className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900">
                Adjuntos
                <span className="ml-1.5 font-normal text-slate-400">
                  ({ticket.attachments.length})
                </span>
              </h2>
            </div>
            <div className="space-y-3 px-5 py-4">
              {ticket.attachments.length > 0 ? (
                <ul className="space-y-2">
                  {ticket.attachments.map((attachment) => (
                    <li
                      key={attachment.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {attachment.filename}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatBytes(attachment.size)} · {attachment.user_name} ·{' '}
                          {formatDate(attachment.created_at, ticket.timezone)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          downloadFile(
                            `/tickets/${ticket.id}/attachments/${attachment.id}`,
                            attachment.filename,
                          ).catch(setUploadError)
                        }
                        title="Descargar"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No hay archivos adjuntos.</p>
              )}

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-400 hover:text-indigo-700">
                <FileUp className="h-4 w-4" />
                {uploading ? 'Subiendo…' : 'Adjuntar archivo'}
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) handleUpload(file)
                    event.target.value = ''
                  }}
                />
              </label>
              <p className="text-xs text-slate-500">Tamaño máximo: 10 MB por archivo.</p>
              <ErrorBanner error={uploadError} />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">SLA</h2>
            <div className="mt-3 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Primera respuesta
                  </p>
                  <SlaBadge state={ticket.response_state} />
                </div>
                <p className="mt-1 text-sm text-slate-800">
                  {ticket.first_response_at
                    ? formatDate(ticket.first_response_at, ticket.timezone)
                    : 'Pendiente'}
                </p>
                <p className="text-xs text-slate-500">
                  Límite: {formatDate(ticket.response_deadline, ticket.timezone)}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Resolución
                  </p>
                  <SlaBadge state={ticket.resolution_state} />
                </div>
                <p className="mt-1 text-sm text-slate-800">
                  {ticket.resolved_at
                    ? formatDate(ticket.resolved_at, ticket.timezone)
                    : 'Pendiente'}
                </p>
                <p className="text-xs text-slate-500">
                  Límite: {formatDate(ticket.resolution_deadline, ticket.timezone)}
                </p>
                {timeLeft(ticket.resolution_deadline) &&
                  (ticket.resolution_state === 'ok' ||
                    ticket.resolution_state === 'warning') && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <Timer className="h-3.5 w-3.5" />
                      {timeLeft(ticket.resolution_deadline)}
                    </p>
                  )}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Detalle</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Apertura</dt>
                <dd className="text-right text-slate-800">
                  {formatDate(ticket.opened_at, ticket.timezone)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Creado por</dt>
                <dd className="text-right text-slate-800">
                  {ticket.created_by_name || '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Asignado</dt>
                <dd className="text-right text-slate-800">
                  {ticket.assigned_to_name || 'Sin asignar'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Horas imputadas</dt>
                <dd className="text-right font-medium text-slate-800">
                  {formatHours(ticket.hours_logged)}
                </dd>
              </div>
            </dl>
            <Link
              to={`/contracts/${ticket.contract_id}`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              <CalendarClock className="h-4 w-4" /> Ver contrato y banco
            </Link>
          </Card>

          {ticket.type === 'funcionalidad' && (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900">Pack de funcionalidad</h2>
              </div>
              {ticket.packs.length === 0 ? (
                <>
                  <p className="mt-1 text-xs text-slate-500">
                    Este ticket no está en ningún pack. Según RF-37 no se puede cerrar hasta
                    vincularlo a un pack aprobado por el cliente.
                  </p>
                  <Link
                    to="/feature-packs"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    <Boxes className="h-4 w-4" /> Ir a packs
                  </Link>
                </>
              ) : (
                <div className="mt-3 space-y-2">
                  {ticket.packs.map((pack) => (
                    <Link
                      key={pack.id}
                      to={`/feature-packs/${pack.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 transition hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{pack.name}</p>
                        <p className="text-xs text-slate-500">
                          {formatMoney(pack.price, pack.currency)} ·{' '}
                          {formatHours(pack.hours_estimated)}
                        </p>
                      </div>
                      <PackStatusBadge status={pack.status} />
                    </Link>
                  ))}
                  {!ticket.closable && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      El pack todavía no está aprobado por el cliente: no se puede cerrar el
                      ticket (RF-37).
                    </p>
                  )}
                </div>
              )}
            </Card>
          )}

          {isAgency && (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900">Imputar horas</h2>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {ticket.type === 'soporte'
                  ? 'Descuenta del banco de horas del ciclo vigente.'
                  : 'Los tickets de funcionalidad no descuentan banco.'}
              </p>

              {ticket.time_logs.length > 0 && (
                <ul className="mt-3 space-y-2 border-b border-slate-100 pb-3">
                  {ticket.time_logs.map((log) => (
                    <li key={log.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800">
                          {formatHours(log.hours)}
                          {log.note && (
                            <span className="text-slate-500"> · {log.note}</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">
                          {log.user_name} · {formatDate(log.logged_at, ticket.timezone)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={handleTimeLog} className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Horas">
                    <Input
                      type="number"
                      min="0.25"
                      max="24"
                      step="0.25"
                      required
                      value={hours}
                      onChange={(event) => setHours(event.target.value)}
                      placeholder="1.5"
                    />
                  </Field>
                  <Field label="Detalle">
                    <Input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Opcional"
                    />
                  </Field>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  loading={addTimeLog.isPending}
                  disabled={!hours || Number(hours) <= 0}
                  className="w-full"
                >
                  <UserRound className="h-3.5 w-3.5" /> Registrar consumo
                </Button>
                <ErrorBanner error={logError} />
              </form>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
