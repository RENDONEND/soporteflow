# Plan de ejecución — Fase 3, Fase 4 y notificaciones

## Alcance

1. **Packs de funcionalidades (Fase 3, RF-50…RF-55)**
   - `feature_packs` + `feature_pack_tickets` (N:M con tickets).
   - Crear pack desde uno o varios tickets de funcionalidad (RF-50).
   - Alcance, horas estimadas, precio (RF-51).
   - Enviar a aprobación, visible en el portal (RF-52); aprobar/rechazar con
     quién y cuándo (RF-53).
   - Estados `propuesto → aprobado → en_desarrollo → entregado → facturado` (RF-54).
   - Horas reales vs. estimadas desde los time logs de los tickets del pack (RF-55).
2. **RF-37**: un ticket de funcionalidad no se cierra si no está en un pack
   (no `propuesto`/rechazado).
3. **Mantenimiento preventivo (Fase 4, RF-60…RF-63)**
   - `maintenance_tasks` (nombre, recurrencia, checklist) por contrato (RF-60).
   - Lista/calendario de pendientes del mes (RF-61).
   - Marcar como completada con horas que descuentan banco (RF-62).
   - Historial visible para el cliente (RF-63).
4. **Notificaciones (RNF-03, RF-42)**
   - `notifications` internas + envío SMTP opcional (se apaga si no hay `SMTP_HOST`).
   - Disparadores: ticket creado, comentario del cliente, SLA por vencer/vencido,
     banco al umbral/agotado, pack aprobado/rechazado, mantenimiento vencido.

## Pasos

1. Modelos + enums (`PackStatus` ya existe) y migración Alembic.
2. Servicios: `feature_packs.py` (código, estados, horas reales),
   `maintenance.py` (recurrencia, pendientes, ejecución que consume banco),
   `notifications.py` (in-app + email).
3. Schemas y routers `/feature-packs`, `/maintenance-tasks`, `/notifications`.
4. Regla RF-37 en el cambio de estado del ticket + vínculo pack↔ticket.
5. Scheduler: notificaciones de SLA/banco y avisos de mantenimiento vencido.
6. Tests: packs (crear desde tickets, aprobar/rechazar, aislamiento de cliente),
   RF-37, mantenimiento (recurrencia, consumo, aislamiento), notificaciones en modo log.
7. Frontend: página de packs (agencia) + sección en detalle de contrato,
   mantenimiento por contrato, campana de notificaciones, "Mis packs"/
   "Mi mantenimiento" en el portal.
8. README, `.env.example`, verificación en vivo y commits.

## Decisiones

- Los packs no tocan el banco de horas (regla del plan, §1.5).
- El consumo de mantenimiento reusa `hour_bank.consume` (queda auditado en
  `hour_bank_adjustments`) y respeta la regla de contrato archivado.
- El email nunca bloquea la operación: si falla, se registra en el log.
- Notificaciones para agencia: admin + técnicos; para cliente: contactos de ese
  cliente.
