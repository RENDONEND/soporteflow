import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

import { Button } from '../components/ui'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Compass className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-slate-900">Página no encontrada</h1>
      <p className="mt-1 text-sm text-slate-500">
        La dirección que abriste no existe o cambió de lugar.
      </p>
      <Link to="/" className="mt-4">
        <Button variant="secondary">Volver al resumen</Button>
      </Link>
    </div>
  )
}
