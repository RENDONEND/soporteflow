import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, UserCog } from 'lucide-react'

import { get, post } from '../lib/api'
import type { Client, Role, User } from '../lib/types'
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
} from '../components/ui'

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Administración' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'cliente', label: 'Cliente' },
]

const ROLE_TONES: Record<Role, string> = {
  admin: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  tecnico: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  cliente: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
}

export default function Users() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('tecnico')
  const [clientId, setClientId] = useState('')
  const [error, setError] = useState<unknown>(null)

  const usersQuery = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => get<User[]>('/users'),
  })
  const clientsQuery = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => get<Client[]>('/clients'),
  })

  const createUser = useMutation({
    mutationFn: (payload: unknown) => post<User>('/users', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setOpen(false)
      setName('')
      setEmail('')
      setPassword('')
      setRole('tecnico')
      setClientId('')
      setError(null)
    },
    onError: (err) => setError(err),
  })

  const clients = clientsQuery.data || []
  const clientMap = new Map(clients.map((client) => [client.id, client.name]))

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    createUser.mutate({
      name: name.trim(),
      email: email.trim(),
      password,
      role,
      client_id: role === 'cliente' ? Number(clientId) : null,
    })
  }

  const users = usersQuery.data || []
  const canSubmit = role !== 'cliente' || Boolean(clientId)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Equipo y accesos"
        subtitle="Quién puede operar el tablero y quién entra al portal de cada cliente."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo usuario
          </Button>
        }
      />

      {usersQuery.error && <ErrorBanner error={usersQuery.error} />}

      <Card>
        {usersQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner />
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={<UserCog className="h-5 w-5" />}
            title="No hay usuarios"
            description="Creá el primer acceso para tu equipo."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Usuario</th>
                  <th className="px-3 py-2.5 font-medium">Rol</th>
                  <th className="px-3 py-2.5 font-medium">Cliente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="transition hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{user.name}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={ROLE_TONES[user.role]}>
                        {ROLE_OPTIONS.find((option) => option.value === user.role)?.label ||
                          user.role}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {user.client_id
                        ? clientMap.get(user.client_id) || `Cliente #${user.client_id}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo usuario"
        description="Los usuarios cliente solo ven su propio servicio y tickets."
      >
        <form onSubmit={handleSubmit} className="space-y-4" id="new-user-form">
          <Field label="Nombre">
            <Input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre y apellido"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="persona@agencia.com"
            />
          </Field>
          <Field label="Contraseña" hint="Mínimo 8 caracteres.">
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Field label="Rol">
            <Select
              value={role}
              onChange={(event) => {
                setRole(event.target.value as Role)
                if (event.target.value !== 'cliente') setClientId('')
              }}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          {role === 'cliente' && (
            <Field label="Cliente">
              <Select
                required
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              >
                <option value="">Elegí un cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <ErrorBanner error={error} />
        </form>
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)} type="button">
            Cancelar
          </Button>
          <Button
            type="submit"
            form="new-user-form"
            loading={createUser.isPending}
            disabled={!canSubmit}
          >
            Crear usuario
          </Button>
        </div>
      </Modal>
    </div>
  )
}
