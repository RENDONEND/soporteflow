import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Building2, Plus, Search } from 'lucide-react'

import { get, post } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Application, Client, Contract } from '../lib/types'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
} from '../components/ui'

export default function Clients() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<unknown>(null)

  const clientsQuery = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => get<Client[]>('/clients'),
  })
  const applicationsQuery = useQuery<Application[]>({
    queryKey: ['applications'],
    queryFn: () => get<Application[]>('/applications'),
  })
  const contractsQuery = useQuery<Contract[]>({
    queryKey: ['contracts'],
    queryFn: () => get<Contract[]>('/contracts'),
  })

  const createClient = useMutation({
    mutationFn: (payload: unknown) => post<Client>('/clients', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setOpen(false)
      setName('')
      setEmail('')
      setPhone('')
      setError(null)
    },
    onError: (err) => setError(err),
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const contacts: Record<string, string> = {}
    if (email.trim()) contacts.email = email.trim()
    if (phone.trim()) contacts.phone = phone.trim()
    createClient.mutate({ name: name.trim(), contacts })
  }

  const applicationsByClient = useMemo(() => {
    const map = new Map<number, Application[]>()
    for (const application of applicationsQuery.data || []) {
      const list = map.get(application.client_id) || []
      list.push(application)
      map.set(application.client_id, list)
    }
    return map
  }, [applicationsQuery.data])

  const activeContractsByApp = useMemo(() => {
    const map = new Map<number, Contract>()
    for (const contract of contractsQuery.data || []) {
      if (contract.state === 'activo') map.set(contract.application_id, contract)
    }
    return map
  }, [contractsQuery.data])

  const clients = (clientsQuery.data || []).filter((client) => {
    if (!search.trim()) return true
    const term = search.toLowerCase()
    const contact = client.contacts?.email || ''
    return (
      client.name.toLowerCase().includes(term) || contact.toLowerCase().includes(term)
    )
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clientes"
        subtitle="Cada cliente, sus aplicaciones y el contrato que las cubre."
        actions={
          isAdmin && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Nuevo cliente
            </Button>
          )
        }
      />

      <Card className="p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente o email…"
            className="pl-9"
          />
        </div>
      </Card>

      {(clientsQuery.error || applicationsQuery.error) && (
        <ErrorBanner error={clientsQuery.error || applicationsQuery.error} />
      )}

      <Card>
        {clientsQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner />
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title={search ? 'No encontramos clientes' : 'Todavía no hay clientes'}
            description={
              search
                ? 'Probá con otro nombre o email.'
                : 'Cargá el primero para después crear sus aplicaciones y contratos.'
            }
            action={
              !search &&
              isAdmin && (
                <Button size="sm" onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4" /> Nuevo cliente
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Cliente</th>
                  <th className="px-3 py-2.5 font-medium">Contacto</th>
                  <th className="px-3 py-2.5 font-medium">Aplicaciones</th>
                  <th className="px-3 py-2.5 font-medium">Contratos activos</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((client) => {
                  const applications = applicationsByClient.get(client.id) || []
                  const activeContracts = applications.filter((application) =>
                    activeContractsByApp.has(application.id),
                  ).length
                  return (
                    <tr key={client.id} className="group transition hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <Link
                          to={`/clients/${client.id}`}
                          className="font-medium text-slate-900 group-hover:text-indigo-700"
                        >
                          {client.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {client.contacts?.email || '—'}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{applications.length}</td>
                      <td className="px-3 py-3 text-slate-600">{activeContracts}</td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          to={`/clients/${client.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          Ver <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo cliente"
        description="Después vas a poder agregar aplicaciones y contratos."
      >
        <form onSubmit={handleSubmit} className="space-y-4" id="new-client-form">
          <Field label="Nombre">
            <Input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Estudio Contable Pérez"
            />
          </Field>
          <Field label="Email de contacto" hint="Opcional, pero útil para el portal.">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="contacto@cliente.com"
            />
          </Field>
          <Field label="Teléfono">
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+54 11 5555-5555"
            />
          </Field>
          <ErrorBanner error={error} />
        </form>
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)} type="button">
            Cancelar
          </Button>
          <Button type="submit" form="new-client-form" loading={createClient.isPending}>
            Crear cliente
          </Button>
        </div>
      </Modal>
    </div>
  )
}
