import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Clock, Gauge, LifeBuoy, ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useAuth } from '../lib/auth'
import { Button, ErrorBanner, Field, Input } from '../components/ui'

const FEATURES = [
  {
    icon: Clock,
    title: 'Banco de horas sin sorpresas',
    text: 'Consumo, saldo y reinicio mensual automático para cada contrato.',
  },
  {
    icon: ShieldCheck,
    title: 'SLA que se cumple',
    text: 'Plazos por severidad calculados sobre la ventana real de cobertura.',
  },
  {
    icon: Gauge,
    title: 'Un solo tablero',
    text: 'Tickets, clientes, contratos y planes en el mismo lugar.',
  },
]

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<unknown>(null)

  const from = (location.state as { from?: string } | null)?.from || '/'

  if (user) return <Navigate to={from} replace />

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const { handleSubmit, register, formState: { errors, isSubmitting } } = form

  async function onSubmit(data: LoginForm) {
    setError(null)
    try {
      await login(data.email.trim(), data.password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <div className="relative hidden overflow-hidden bg-slate-950 lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              'radial-gradient(900px circle at 10% 10%, rgba(124,58,237,0.35), transparent 45%), radial-gradient(700px circle at 90% 90%, rgba(79,70,229,0.25), transparent 40%)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white">SoporteFlow</p>
              <p className="text-xs text-slate-400">Soporte con SLA y horas claras</p>
            </div>
          </div>

          <h1 className="mt-16 max-w-md text-3xl font-semibold leading-tight text-white">
            El trabajo de soporte, ordenado de punta a punta.
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
            Tickets de soporte y funcionalidad separados, horas que se descuentan solas y
            vencimientos visibles antes de que sea tarde.
          </p>

          <div className="mt-10 space-y-5">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex gap-3.5">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-indigo-300 ring-1 ring-white/10">
                  <feature.icon className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{feature.title}</p>
                  <p className="mt-0.5 max-w-xs text-xs leading-relaxed text-slate-400">
                    {feature.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-500">
          Uso interno de la agencia y sus clientes.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">SoporteFlow</p>
              <p className="text-[11px] text-muted-foreground">Soporte con SLA y horas claras</p>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Ingresá a tu cuenta
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Equipo de la agencia o portal de cliente.
          </p>

          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-4">
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="vos@agencia.com"
                {...register('email')}
              />
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
            </Field>
            <Field label="Contraseña">
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register('password')}
              />
              {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
            </Field>

            <ErrorBanner error={error} />

            <Button type="submit" loading={isSubmitting} className="w-full">
              Entrar
              {!isSubmitting && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            Las credenciales iniciales se generan al instalar. Podés verlas con{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              ./start.sh credentials
            </code>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
