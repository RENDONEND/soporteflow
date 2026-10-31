import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'

import { get, post } from '../lib/api'
import { timeLeft } from '../lib/format'
import type { NotificationList } from '../lib/types'
import { cn } from './ui'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const notificationsQuery = useQuery<NotificationList>({
    queryKey: ['notifications'],
    queryFn: () => get<NotificationList>('/notifications?limit=15'),
    refetchInterval: 60_000,
  })

  const markRead = useMutation({
    mutationFn: (id: number) => post(`/notifications/${id}/read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAll = useMutation({
    mutationFn: () => post('/notifications/read-all', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const unread = notificationsQuery.data?.unread || 0
  const items = notificationsQuery.data?.items || []

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        title="Notificaciones"
        aria-label="Notificaciones"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-foreground">Notificaciones</span>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="text-xs font-medium text-primary hover:opacity-80"
              >
                Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notificationsQuery.isLoading ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sin novedades</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (!item.read) markRead.mutate(item.id)
                    if (item.link) navigate(item.link)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-3 py-2.5 text-left transition hover:bg-secondary',
                    !item.read && 'bg-primary/5',
                  )}
                >
                  <span className="flex w-full items-center gap-2">
                    {!item.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    <span className="flex-1 truncate text-sm font-medium text-foreground">
                      {item.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {timeLeft(item.created_at)?.replace('hace ', '')}
                    </span>
                  </span>
                  {item.body && (
                    <span className="line-clamp-2 pl-3.5 text-xs text-muted-foreground">{item.body}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
