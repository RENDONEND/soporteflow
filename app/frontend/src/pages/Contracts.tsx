import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, FileText, Search } from 'lucide-react'

import { get } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDay, formatHours } from '../lib/format'
import type { Contract, HourBank } from '../lib/types'
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  Progress,
  Spinner,
} from '../components/ui'

function BankCell({ contractId }: { contractId: number }) {
  const { data, isLoading } = useQuery<HourBank>({
    queryKey: ['bank', contractId],
    queryFn: () => get<HourBank>(`/contracts/${contractId}/hour-bank`),
  })

  if (isLoading) return <span className="text-xs text-slate-400">…</span>
  if (!data) return <span className="text-xs text-slate-400">—</span>

  return (
    <div className="w-36">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-800">
          {formatHours(data.hours_remaining)}
        </span>
        <span className="text-slate-500">de {formatHours(data.hours_assigned)}</span>
      </div>
      <Progress
        value={data.percent_used}
        tone={
          data.alert === 'agotado'
            ? 'bg-rose-500'
            : data.alert === 'umbral'
              ? 'bg-amber-500'
              : 'bg-indigo-500'
        }
        className="mt-1 h-1.5"
      />
    </div>
  )
}

function BankSummary({ contractId }: { contractId: number }) {
  const { data } = useQuery<HourBank>({
    queryKey: ['bank', contractId],
    queryFn: () => get<HourBank>(`/contracts/${contractId}/hour-bank`),
  })
  if (!data) return <p className="text-sm text-slate-500">Cargando banco…</p>
  return (
    <div>
      <div className="flex items-end justify-between">
        <p className="text-2xl font-semibold text-slate-900">
          {formatHours(data.hours_remaining)}
        </p>
        <p className="text-xs text-slate-500">de {formatHours(data.hours_assigned)}</p>
      </div>
      <Progress
        value={data.percent_used}
        tone={
          data.alert === 'agotado'
            ? 'bg-rose-500'
            : data.alert === 'umbral'
              ? 'bg-amber-500'
              : 'bg-indigo-500'
        }
        className="mt-2"
      />
      <p className="mt-2 text-xs text-slate-500">
        Ciclo {data.cycle} · {formatDay(data.period_start)} a {formatDay(data.period_end)}
      </p>
    </div>
  )
}

export default function Contracts() {
  const { isAgency } = useAuth()
  const [search, setSearch] = useState('')

  const contractsQuery = useQuery<Contract[]>({
    queryKey: ['contracts'],
    queryFn: () => get<Contract[]>('/contracts'),
  })

  const contracts = useMemo(() => {
    const list = contractsQuery.data || []
    if (!search.trim()) return list
    const term = search.toLowerCase()
    return list.filter((contract) => {
      const client = contract.application?.client?.name || ''
      const application = contract.application?.name || ''
      const plan = contract.plan?.name || ''
      return `${client} ${application} ${plan}`.toLowerCase().includes(term)
    })
  }, [contractsQuery.data, search])

  return (
    <div className="space-y-5">
      <PageHeader
        title={isAgency ? 'Contratos' : 'Mi servicio'}
        subtitle={
          isAgency
            ? 'Planes, banco de horas y fechas de corte de cada aplicación.'
            : 'Tu plan, las horas disponibles y cuándo se renueva.'
        }
      />

      {isAgency && (
        <Card className="p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por cliente, aplicación o plan…"
              className="pl-9"
            />
          </div>
        </Card>
      )}

      {contractsQuery.error && <ErrorBanner error={contractsQuery.error} />}

      {contractsQuery.isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : contracts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title={search ? 'Sin resultados' : 'No hay contratos activos'}
            description={
              search
                ? 'Probá con otro término.'
                : isAgency
                  ? 'Entrá a un cliente, creá una aplicación y asignale un plan.'
                  : 'La agencia todavía no activó un servicio para vos.'
            }
            action={
              isAgency &&
              !search && (
                <Link
                  to="/clients"
                  className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Ir a clientes <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )
            }
          />
        </Card>
      ) : isAgency ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Cliente / aplicación</th>
                  <th className="px-3 py-2.5 font-medium">Plan</th>
                  <th className="px-3 py-2.5 font-medium">Banco actual</th>
                  <th className="px-3 py-2.5 font-medium">Corte</th>
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contracts.map((contract) => (
                  <tr key={contract.id} className="group transition hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link
                        to={`/contracts/${contract.id}`}
                        className="font-medium text-slate-900 group-hover:text-indigo-700"
                      >
                        {contract.application?.client?.name || '—'}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {contract.application?.name || `Aplicación #${contract.application_id}`}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {contract.plan?.name || '—'}
                      <p className="text-xs text-slate-500">
                        {formatHours(contract.hours_bank_month)} / mes
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      {contract.state === 'activo' ? (
                        <BankCell contractId={contract.id} />
                      ) : (
                        <span className="text-xs text-slate-400">Archivado</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-600">Día {contract.cut_date_day}</td>
                    <td className="px-3 py-3">
                      <Badge
                        tone={
                          contract.state === 'activo'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                            : 'bg-slate-100 text-slate-500 ring-slate-400/20'
                        }
                      >
                        {contract.state === 'activo' ? 'Activo' : 'Archivado'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={`/contracts/${contract.id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Ver <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {contracts.map((contract) => (
            <Card key={contract.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {contract.application?.name}
                  </p>
                  <p className="mt-0.5 text-lg font-semibold text-slate-900">
                    Plan {contract.plan?.name}
                  </p>
                </div>
                <Badge
                  tone={
                    contract.state === 'activo'
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                      : 'bg-slate-100 text-slate-500 ring-slate-400/20'
                  }
                >
                  {contract.state === 'activo' ? 'Activo' : 'Archivado'}
                </Badge>
              </div>
              <div className="mt-4">
                {contract.state === 'activo' ? (
                  <BankSummary contractId={contract.id} />
                ) : (
                  <p className="text-sm text-slate-500">Contrato archivado.</p>
                )}
              </div>
              <Link
                to={`/contracts/${contract.id}`}
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Ver detalle <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
