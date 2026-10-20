import type { ReactNode } from 'react'

import {
  SEVERITY_LABELS,
  SEVERITY_TONES,
  SLA_LABELS,
  SLA_TONES,
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
  timeLeft,
} from '../lib/format'
import type { SlaState, TicketSeverity, TicketStatus, TicketType } from '../lib/types'
import { Badge } from './ui'

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
}

export function SeverityBadge({ severity }: { severity: TicketSeverity | null }) {
  if (!severity) {
    return <Badge tone="bg-slate-100 text-slate-500 ring-slate-400/20">Sin severidad</Badge>
  }
  return <Badge tone={SEVERITY_TONES[severity]}>{SEVERITY_LABELS[severity]}</Badge>
}

export function TypeBadge({ type }: { type: TicketType }) {
  return (
    <Badge
      tone={
        type === 'soporte'
          ? 'bg-violet-50 text-violet-700 ring-violet-600/20'
          : 'bg-cyan-50 text-cyan-700 ring-cyan-600/20'
      }
    >
      {TYPE_LABELS[type]}
    </Badge>
  )
}

export function SlaBadge({
  state,
  deadline,
  showCountdown = false,
}: {
  state: SlaState
  deadline?: string | null
  showCountdown?: boolean
}): ReactNode {
  const countdown = showCountdown && (state === 'ok' || state === 'warning')
    ? timeLeft(deadline || null)
    : null
  return (
    <Badge tone={SLA_TONES[state]}>
      {SLA_LABELS[state]}
      {countdown && <span className="font-normal opacity-80">· {countdown}</span>}
    </Badge>
  )
}
