# SoporteFlow — Plan de Proyecto Completo

> **Versión:** 1.0 · **Nombre de trabajo:** *SoporteFlow* (renombrable)
> **Alcance confirmado:** uso interno de tu agencia + portal para tus clientes (no se vende a otras agencias). Horas del banco mensual: **se pierden si no se usan** (úsalas o piérdelas, sin acumulación entre meses).
> **Destinatario:** Agente CLI con Spec Kit (Spec-Driven Development) sobre Ubuntu + Docker

---

## 0. El problema real, dicho en limpio

Tu agencia entrega proyectos y después queda la pregunta de "¿quién sostiene esto en el tiempo?". Hoy ese seguimiento vive en tu cabeza, en WhatsApp y en una hoja de cálculo. Eso falla de formas concretas:

- No hay dónde ver, de un vistazo, cuántas horas del banco mensual de un cliente ya se consumieron.
- Un ticket de "se me cayó el login" y un ticket de "quiero agregar un módulo de reportes" terminan mezclados, cuando el primero es mantenimiento (va contra el banco de horas) y el segundo es una **funcionalidad nueva que escala la app** (se cotiza aparte, por fuera del banco).
- No existe un lugar donde el cliente vea, sin preguntarte, qué plan tiene contratado, qué cubre, cuántas horas le quedan este mes y en qué estado están sus tickets.
- No hay un mecanismo que te avise cuándo estás por incumplir el tiempo de respuesta que le prometiste a un cliente Premium.

**SoporteFlow** es el sistema que resuelve exactamente eso: un tablero interno para tu equipo y un portal para cada cliente, construidos alrededor de tres piezas que vos ya definiste en tu modelo de negocio: **banco de horas**, **tickets de soporte vs. tickets de funcionalidad (packs)**, y **planes escalonados con SLA**.

---

## 1. El modelo de negocio, traducido a reglas de sistema

Esta sección convierte lo que describiste en reglas concretas que el software pueda aplicar. Es la parte más importante del plan — todo lo demás es consecuencia de esto.

### 1.1 Tipos de contrato por aplicación del cliente
Cada cliente puede tener una o más aplicaciones bajo soporte, y **cada aplicación tiene su propio contrato** (un mismo cliente podría tener dos apps en planes distintos). Un contrato define:
- **Plan de soporte**: Básico, Prioritario o Premium (§1.3).
- **Banco de horas mensual**: cantidad de horas incluidas por mes (tu ejemplo: 60 h), dedicadas a **mantenimiento preventivo** y a **tickets de soporte** (incidentes dentro de lo ya entregado).
- **Fecha de corte mensual** y **moneda/tarifa** para lo que se cobre fuera del banco.

### 1.2 Banco de horas — regla de "úsalas o piérdelas"
- Cada contrato acumula horas disponibles al inicio de cada ciclo mensual (ej. 60 h el día 1).
- Cada tarea de mantenimiento preventivo y cada ticket de soporte resuelto **descuenta** horas del banco del mes en curso.
- Al cerrar el ciclo (fin de mes), **las horas no usadas se pierden** — el banco no acumula remanente al mes siguiente. El sistema debe dejar esto clarísimo en el portal del cliente ("te quedan 12 h este mes, se reinician el día X") para que nadie se sorprenda.
- Si un cliente se queda sin horas **antes** de fin de mes, el sistema no bloquea el trabajo automáticamente: genera una alerta para que tu equipo decida (seguir y facturar el excedente como hora extra, o esperar al próximo ciclo) — esto se resuelve como ajuste manual, no como regla rígida, porque es una decisión comercial tuya caso por caso.

### 1.3 Tres planes escalonados (Básico / Prioritario / Premium)
La diferencia entre planes, según lo que describiste, es **tiempo de respuesta y cobertura horaria**, no solo el precio. Cada plan se configura (no se hardcodea) con estos campos:

| Campo del plan | Ejemplo Básico | Ejemplo Prioritario | Ejemplo Premium |
|---|---|---|---|
| Ventana de cobertura | Lun–Vie, horario laboral | Lun–Sáb, horario extendido | 24/7 |
| Tiempo de respuesta — crítico | 1 día hábil | 4 horas | 1 hora |
| Tiempo de respuesta — normal | 3 días hábiles | 1 día hábil | 4 horas |
| Horas de banco incluidas | menos | medio | más |
| ¿Incluye mantenimiento preventivo? | Sí (básico) | Sí (ampliado) | Sí (completo + monitoreo activo) |
| ¿Incluye desarrollo de nuevas funcionalidades dentro del plan? | No (siempre por fuera, vía packs) | No | Opcional: algunas horas del banco se pueden destinar a funcionalidades menores, si así lo define el contrato |

**Importante:** estos valores son un punto de partida editable — el sistema debe permitirte crear, duplicar y ajustar planes libremente desde un panel de configuración, no quedar fijos en el código (tú vas a querer afinar esto con el tiempo).

### 1.4 Dos tipos de ticket, con reglas de facturación distintas
Esta es la distinción que mencionaste como clave:

| Tipo de ticket | Qué es | Cómo se cobra |
|---|---|---|
| **Soporte / incidente** | Algo que ya existía y dejó de funcionar como debía (un bug, una caída, un error) | Descuenta horas del **banco de horas** del mes, dentro de lo cubierto por el plan |
| **Funcionalidad nueva** | El cliente quiere **agregar o escalar** algo que no existía | **Nunca** sale del banco de horas. Se agrupa en un **pack** (ver §1.5), se cotiza aparte, el cliente lo aprueba, y se factura por separado |

El sistema debe **obligar** a clasificar cada ticket como uno de los dos tipos al crearlo (con una recomendación automática simple: si el ticket menciona "agregar", "nuevo módulo", "quiero que también haga X" se sugiere "Funcionalidad nueva"; esto es solo una ayuda, la clasificación final la confirma un humano de tu equipo).

### 1.5 Packs de funcionalidades (tus "sprints" de alcance)
- Un **pack** agrupa una o varias funcionalidades nuevas relacionadas (puede ser un ticket aislado o varios juntos — vos decidís el alcance de cada pack).
- Cada pack tiene: lista de funcionalidades incluidas, estimación de horas, precio cotizado, estado (`Propuesto` → `Aprobado por el cliente` → `En desarrollo` → `Entregado` → `Facturado`).
- El cliente ve el pack en su portal, con el detalle de qué incluye y el precio, y lo **aprueba o lo rechaza** desde ahí (queda registrado quién aprobó y cuándo — esto te cubre si después hay una discusión sobre el alcance).
- Las horas de un pack **no tocan el banco de horas** del contrato de mantenimiento; se registran y facturan de forma independiente.

### 1.6 Mantenimiento preventivo
Tareas recurrentes que tu equipo ejecuta sin que el cliente las pida — actualizaciones de dependencias, verificación de backups, revisión de certificados/dominios, chequeos de salud del sistema. Cada tarea:
- Tiene una recurrencia (semanal, mensual, trimestral).
- Al completarse, descuenta horas del banco igual que un ticket de soporte.
- Queda en un historial visible para el cliente, como evidencia de que "alguien está cuidando su sistema" — esto es, en sí mismo, parte del valor que vendés con el plan.

---

## 2. Usuarios y roles

| Rol | Qué hace |
|---|---|
| **Admin de agencia** | Configura planes, crea contratos, gestiona precios, ve todo |
| **Técnico de agencia** | Atiende tickets, registra horas, ejecuta mantenimiento preventivo, arma packs |
| **Cliente (contacto principal)** | Ve su(s) contrato(s), banco de horas, abre tickets, aprueba/rechaza packs, descarga reportes mensuales |
| **Cliente (usuario secundario, opcional v2)** | Puede abrir tickets pero no ver facturación ni aprobar packs |

---

## 3. Requisitos funcionales

### 3.1 Clientes, aplicaciones y contratos
| ID | Requisito | Fase |
|---|---|---|
| RF-01 | Alta de cliente con uno o más contactos | MVP |
| RF-02 | Alta de aplicación/producto bajo soporte, asociada a un cliente | MVP |
| RF-03 | Contrato por aplicación: plan asignado, horas de banco, fecha de corte, tarifa de hora extra/funcionalidad | MVP |
| RF-04 | Historial de cambios de plan (si un cliente sube de Básico a Premium, queda registrado desde cuándo) | v1 |
| RF-05 | Archivar cliente/aplicación sin perder el historial | v1 |

### 3.2 Planes de soporte (configurables)
| ID | Requisito | Fase |
|---|---|---|
| RF-10 | CRUD de planes: nombre, ventana de cobertura, tiempos de respuesta por severidad, horas de banco por defecto, qué cubre | MVP |
| RF-11 | Duplicar un plan existente como punto de partida para crear uno nuevo | v1 |
| RF-12 | Vincular un plan a una **plantilla de precio** (mensual fijo + tarifa de hora extra) | MVP |

### 3.3 Banco de horas
| ID | Requisito | Fase |
|---|---|---|
| RF-20 | Saldo de horas del mes en curso, visible para agencia y cliente | MVP |
| RF-21 | Descuento automático de horas al cerrar un ticket de soporte o completar mantenimiento preventivo, con registro de quién y cuánto tiempo | MVP |
| RF-22 | Reinicio automático del banco en la fecha de corte de cada contrato, **sin arrastrar remanente** (regla confirmada: se pierde lo no usado) | MVP |
| RF-23 | Alerta cuando el banco baja de un umbral (ej. 20% restante) — aviso interno y, opcionalmente, al cliente | MVP |
| RF-24 | Si el banco llega a cero antes de fin de mes: no bloquea, genera alerta para decisión manual del equipo (hora extra o esperar) | MVP |
| RF-25 | Historial de consumo del banco, mes a mes, exportable | v1 |

### 3.4 Tickets
| ID | Requisito | Fase |
|---|---|---|
| RF-30 | Crear ticket desde el portal del cliente o desde el panel interno, con tipo obligatorio: **Soporte** o **Funcionalidad nueva** | MVP |
| RF-31 | Sugerencia automática (no vinculante) del tipo de ticket según palabras clave del título/descripción | v1 |
| RF-32 | Severidad del ticket (crítico/alto/normal/bajo) para tickets de soporte, que determina el SLA aplicable | MVP |
| RF-33 | Estado del ticket: `Abierto` → `En progreso` → `Esperando al cliente` → `Resuelto` → `Cerrado` | MVP |
| RF-34 | Registro de tiempo trabajado por ticket (quién, cuánto, cuándo), que alimenta el descuento del banco de horas | MVP |
| RF-35 | Adjuntos (capturas, logs) en el ticket | MVP |
| RF-36 | Comentarios/hilo de conversación visible para el cliente, con opción de notas internas solo para el equipo | MVP |
| RF-37 | Un ticket de tipo "Funcionalidad nueva" no puede cerrarse sin estar vinculado a un pack | v1 |

### 3.5 SLA y escalamiento
| ID | Requisito | Fase |
|---|---|---|
| RF-40 | Al abrir un ticket de soporte, calcular automáticamente el plazo de primera respuesta y de resolución según el plan del contrato y la severidad, **respetando la ventana de cobertura** (un ticket abierto fuera de horario de un plan Básico no empieza a correr el reloj hasta que empiece la cobertura) | MVP |
| RF-41 | Contador visible de tiempo restante/vencido por ticket, con color (verde/ámbar/rojo) | MVP |
| RF-42 | Notificación interna cuando un ticket está por vencer su SLA (ej. al 80% del plazo) | MVP |
| RF-43 | Registro de incumplimientos de SLA para reporte interno (para que sepas si un plan te está quedando corto operativamente) | v1 |
| RF-44 | Respuesta automática al cliente cuando abre un ticket fuera de la ventana de cobertura de su plan, indicando cuándo se lo atenderá | v1 |

### 3.6 Packs de funcionalidades
| ID | Requisito | Fase |
|---|---|---|
| RF-50 | Crear un pack a partir de uno o varios tickets de tipo "Funcionalidad nueva" | MVP |
| RF-51 | Definir alcance, estimación de horas y precio del pack | MVP |
| RF-52 | Enviar el pack al cliente para aprobación, con detalle visible en su portal | MVP |
| RF-53 | Registro de aprobación/rechazo (quién, cuándo) | MVP |
| RF-54 | Estado del pack: `Propuesto` → `Aprobado` → `En desarrollo` → `Entregado` → `Facturado` | MVP |
| RF-55 | Registro de horas reales trabajadas en el pack vs. estimadas (para que aprendas a cotizar mejor con el tiempo) | v1 |

### 3.7 Mantenimiento preventivo
| ID | Requisito | Fase |
|---|---|---|
| RF-60 | Definir tareas recurrentes por contrato (nombre, recurrencia, checklist de pasos) | MVP |
| RF-61 | Calendario/lista de tareas pendientes del mes, por técnico y por cliente | MVP |
| RF-62 | Marcar tarea como completada, con registro de horas (descuenta del banco) | MVP |
| RF-63 | Historial de mantenimiento visible para el cliente, como evidencia del trabajo preventivo realizado | v1 |

### 3.8 Portal del cliente
| ID | Requisito | Fase |
|---|---|---|
| RF-70 | Resumen: plan contratado, qué cubre, horas restantes del mes, fecha de reinicio | MVP |
| RF-71 | Listado de sus tickets con estado y SLA | MVP |
| RF-72 | Abrir nuevo ticket (soporte o funcionalidad) | MVP |
| RF-73 | Ver y aprobar/rechazar packs pendientes | MVP |
| RF-74 | Descargar reporte mensual (horas consumidas, mantenimiento realizado, tickets resueltos) | v1 |
| RF-75 | Historial de facturación de packs (no reemplaza tu sistema contable, solo referencia) | v1 |

### 3.9 Reportes internos
| ID | Requisito | Fase |
|---|---|---|
| RF-80 | Reporte mensual por cliente: horas consumidas vs. contratadas, tickets por tipo, cumplimiento de SLA | MVP |
| RF-81 | Vista de carga de trabajo por técnico | v1 |
| RF-82 | Rentabilidad aproximada por contrato (horas de banco entregadas vs. lo cobrado mensual) — alerta si un cliente consume sistemáticamente de más | v2 |

### 3.10 No funcionales
| ID | Requisito |
|---|---|
| RNF-01 | Autenticación con roles (agencia/cliente) y aislamiento: un cliente solo ve sus propios datos |
| RNF-02 | Cálculo de SLA correcto por zona horaria y ventana de cobertura configurable por plan |
| RNF-03 | Notificaciones por email (y opcionalmente webhook/Slack interno) para alertas de SLA y de banco de horas |
| RNF-04 | Exportar reportes en PDF/CSV |
| RNF-05 | Auditoría: quién hizo qué y cuándo en tickets, packs y horas registradas |
| RNF-06 | Autoalojable en tu propio servidor vía Docker, sin depender de un tercero |

---

## 4. Arquitectura

### 4.1 Decisión de stack (con una diferencia consciente respecto a tus otros proyectos)

En tus proyectos anteriores de esta conversación usaste Python + Rust + React/shadcn + Docker, con Rust para el cómputo pesado (análisis de audio, PDF, morfología). **Aquí no hay cómputo pesado** — SoporteFlow es, en esencia, gestión de datos relacionales (clientes, contratos, tickets, horas) con reglas de negocio y cálculo de fechas/SLA. Meter Rust acá añadiría una segunda cadena de herramientas sin ninguna ganancia medible. Por eso:

| Capa | Tecnología | Motivo |
|---|---|---|
| Backend | **Python 3.12 + FastAPI** | Igual que tus otros proyectos, por consistencia y porque el equipo ya lo conoce |
| Base de datos | **PostgreSQL** (no SQLite) | A diferencia de tus apps locales de un solo usuario, esta es multiusuario (tu equipo + varios clientes accediendo a la vez) y maneja datos de facturación — Postgres da concurrencia real y las garantías que esto necesita |
| Frontend | **React + Vite + TypeScript + Tailwind v4 + shadcn/ui** | Mismo criterio que tus otros proyectos |
| Notificaciones | Cola de tareas en Postgres (o Redis si el volumen de notificaciones crece) + envío de email vía SMTP/proveedor transaccional | Mantenimiento de SLA necesita trabajos programados (revisar vencimientos cada pocos minutos) |
| Despliegue | Docker Compose, autoalojado en tu propio servidor | Pediste "una app", no un producto SaaS para terceros — esto se ajusta a eso |

> Si en el futuro quisieras ofrecerlo a otras agencias como producto, el cambio principal sería introducir una capa de **tenant** (cada agencia con sus propios clientes aislados) — el modelo de datos de abajo ya deja un `agency_id` previsto para eso, pero no se construye multi-tenant completo ahora porque confirmaste que es solo para tu uso.

### 4.2 Diagrama lógico

```
┌─────────────────────── Navegador ───────────────────────┐
│  Panel interno (agencia)        Portal del cliente        │
│  React + Vite + TS · Tailwind v4 · shadcn/ui · TanStack   │
└───────────────▲───────────────────────────▲───────────────┘
                │ REST /api                  │ REST /api (mismo backend, rol distinto)
┌───────────────┴─────────────────────────────┴───────────────┐
│              Backend (FastAPI + Uvicorn)                     │
│  Auth (JWT + roles) · Clientes/Contratos · Planes             │
│  Tickets · Packs · Banco de horas · Mantenimiento preventivo  │
│  Motor de SLA (ventanas de cobertura, cálculo de plazos)       │
│  Programador de tareas (vencimientos de SLA, cierre de mes,   │
│  reinicio de banco de horas, recordatorios de mantenimiento)   │
│  Notificaciones (email) · Reportes (PDF/CSV)                   │
└───────────────┬───────────────────────────────────────────────┘
                 ▼
          PostgreSQL (datos) · Volumen de adjuntos
```

### 4.3 Motor de SLA — el componente más delicado
El cálculo de "cuándo vence este ticket" no es una simple suma de horas: debe respetar la **ventana de cobertura del plan** (ej. un ticket Básico abierto un viernes a las 18:00 fuera de horario laboral no empieza a correr hasta el lunes a primera hora) y la **zona horaria** del cliente. Esto se implementa como un módulo propio (`sla_engine.py`) con:
- Calendario de cobertura por plan (días y horas hábiles, feriados opcionales).
- Función `calcular_vencimiento(fecha_apertura, severidad, plan) -> fecha_limite`.
- Casos de prueba explícitos para los bordes (abrir justo al cierre de la ventana, abrir en feriado, plan 24/7 sin restricciones).

---

## 5. Modelo de datos (resumen)

| Tabla | Campos principales |
|---|---|
| `clients` | id, nombre, contactos |
| `applications` | id, client_id, nombre, descripción |
| `plans` | id, nombre, ventana_cobertura (JSON), sla_por_severidad (JSON), horas_banco_default, qué_cubre |
| `contracts` | id, application_id, plan_id, horas_banco_mes, fecha_corte, tarifa_hora_extra, estado |
| `hour_bank_cycles` | id, contract_id, mes, horas_asignadas, horas_consumidas, cerrado (bool) |
| `tickets` | id, contract_id, tipo (soporte/funcionalidad), severidad, estado, título, descripción, creado_por, fecha_apertura, fecha_límite_sla, fecha_resolución |
| `ticket_time_logs` | id, ticket_id, usuario_id, horas, fecha, nota |
| `ticket_comments` | id, ticket_id, autor, texto, visible_cliente (bool) |
| `feature_packs` | id, contract_id, nombre, estado, horas_estimadas, horas_reales, precio, aprobado_por, fecha_aprobación |
| `feature_pack_tickets` | pack_id, ticket_id (relación muchos a muchos) |
| `maintenance_tasks` | id, contract_id, nombre, recurrencia, checklist (JSON) |
| `maintenance_runs` | id, task_id, fecha, completado_por, horas, notas |
| `users` | id, rol (agencia/cliente), client_id (si aplica), email, nombre |
| `sla_breaches` | id, ticket_id, plazo, fecha_incumplimiento |
| `audit_log` | id, entidad, acción, usuario_id, fecha, detalle (JSON) |

---

## 6. API (resumen por módulo)

| Módulo | Rutas principales |
|---|---|
| Auth | `POST /auth/login`, `GET /auth/me` |
| Clientes/contratos | `GET/POST /clients`, `GET/POST /clients/{id}/applications`, `GET/POST /applications/{id}/contracts` |
| Planes | `GET/POST/PUT /plans` |
| Banco de horas | `GET /contracts/{id}/hour-bank`, `GET /contracts/{id}/hour-bank/history` |
| Tickets | `GET/POST /tickets`, `PATCH /tickets/{id}`, `POST /tickets/{id}/time-logs`, `POST /tickets/{id}/comments` |
| Packs | `GET/POST /feature-packs`, `POST /feature-packs/{id}/approve`, `POST /feature-packs/{id}/reject` |
| Mantenimiento | `GET/POST /maintenance-tasks`, `POST /maintenance-tasks/{id}/runs` |
| Reportes | `GET /contracts/{id}/report?month=YYYY-MM`, `GET /reports/sla-breaches` |

---

## 7. Frontend — mapa de pantallas (React + shadcn/ui)

| Pantalla (panel interno) | Componentes shadcn clave |
|---|---|
| Tablero de tickets | `Table`/Data Table con filtros, `Badge` de SLA (verde/ámbar/rojo), `Tabs` por estado |
| Detalle de ticket | `Card`, hilo de comentarios, formulario de registro de horas (`Form`+`Input`), `Select` de estado |
| Clientes y contratos | `Table`, `Sheet` para alta/edición, `Tabs` por aplicación |
| Planes | `Table` + editor de ventana de cobertura y SLA por severidad |
| Banco de horas | `Progress` (consumido vs. disponible), `Chart` de histórico mensual |
| Packs de funcionalidades | `Card` por pack con estado, `AlertDialog` para aprobar/rechazar |
| Mantenimiento preventivo | Calendario/lista con `Checkbox` por tarea, `Badge` de recurrencia |
| Reportes | `Chart`, exportar a PDF/CSV |

| Pantalla (portal cliente) | Componentes shadcn clave |
|---|---|
| Resumen del plan | `Card` con plan, horas restantes (`Progress`), fecha de reinicio |
| Mis tickets | `Table` simplificada, botón "Nuevo ticket" (`Dialog` con `Form`) |
| Packs pendientes | `Card` con detalle y botones aprobar/rechazar |
| Historial de mantenimiento | Lista de tareas realizadas, como evidencia de valor entregado |

---

## 8. Infraestructura Docker

```yaml
name: SoporteFlow
services:
  app:
    build: { context: ., dockerfile: app/infra/Dockerfile }
    ports: [ "127.0.0.1:8000:8000" ]
    environment:
      DATABASE_URL: postgresql://soporteflow:${DB_PASSWORD}@db:5432/soporteflow
      SMTP_HOST: ${SMTP_HOST}
    depends_on: [ db ]
    restart: unless-stopped
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: soporteflow
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: soporteflow
    volumes: [ "pgdata:/var/lib/postgresql/data" ]
  scheduler:
    build: { context: ., dockerfile: app/infra/Dockerfile }
    command: ["python", "-m", "app.scheduler.worker"]  # vence SLA, cierra bancos de hora, recuerda mantenimiento
    depends_on: [ db ]

volumes:
  pgdata:
```

`start.sh` levanta todo y espera *healthcheck*; `clean.sh` por defecto **no borra la base de datos** (son tus contratos y tu facturación histórica), solo con `--data` y confirmación explícita se borra, igual que en tus otros proyectos.

---

## 9. Pruebas
- **Motor de SLA**: casos de borde de ventana de cobertura (fuera de horario, feriados, plan 24/7).
- **Banco de horas**: cierre de mes sin arrastre, alerta al llegar al umbral, consumo correcto al registrar horas en ticket y en mantenimiento.
- **Clasificación de tickets**: un ticket de "funcionalidad nueva" no puede cerrarse sin pack asociado.
- **Portal del cliente**: aislamiento — un cliente nunca puede ver datos de otro.
- **Reportes**: totales de horas consumidas cuadran contra la suma de `ticket_time_logs` + `maintenance_runs` del mes.

---

## 10. Hoja de ruta por fases

**Fase 0 — Cimientos:** repo, Docker con FastAPI + Postgres + React/shadcn, auth con roles, `start.sh`/`clean.sh`.

**Fase 1 — Núcleo comercial:** clientes, aplicaciones, contratos, planes configurables, banco de horas con reinicio mensual sin arrastre.

**Fase 2 — Tickets y SLA:** tickets de soporte vs. funcionalidad, motor de SLA con ventanas de cobertura, alertas de vencimiento, registro de horas que descuenta el banco.

**Fase 3 — Packs de funcionalidades:** creación, cotización, aprobación por el cliente, vínculo con tickets.

**Fase 4 — Mantenimiento preventivo y portal del cliente:** tareas recurrentes, historial visible, resumen de plan y banco de horas para el cliente.

**Fase 5 — Reportes y pulido:** reportes mensuales exportables, alertas de rentabilidad, auditoría completa.

---

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| El motor de SLA calcula mal por errores de zona horaria/feriados | Pruebas exhaustivas de casos borde desde la Fase 2, antes de usarlo con clientes reales |
| Confusión del cliente con "úsalas o piérdelas" | Mostrarlo de forma explícita y constante en el portal, no solo al final del mes |
| Mezcla accidental de ticket de soporte con uno de funcionalidad | Clasificación obligatoria al crear el ticket + revisión humana antes de cerrar |
| El sistema se vuelve una segunda fuente de verdad desincronizada de tu contabilidad real | Los reportes de facturación son **referencia**, no reemplazan tu sistema contable — dejarlo explícito en la Fase 5 |

---

## 12. Prompt operativo para el agente CLI

```text
ROL: Arquitecto Full-Stack + DevOps. Herramientas: Spec Kit, Docker, Ubuntu.
PROYECTO: SoporteFlow — gestión de soporte/mantenimiento post-entrega para una agencia de software.
Uso interno de la agencia + portal para sus clientes. NO es multi-tenant ni SaaS para terceros.

REGLAS DE NEGOCIO FIJAS (no inventar otras):
- Banco de horas mensual por contrato: se reinicia cada mes SIN arrastrar remanente (úsalas o piérdelas).
- Dos tipos de ticket: Soporte (descuenta banco de horas) y Funcionalidad nueva (NUNCA descuenta banco,
  se agrupa en un "pack" cotizado y facturado aparte, que el cliente aprueba desde su portal).
- Planes configurables (no hardcodeados): ventana de cobertura horaria + tiempo de respuesta por severidad
  + horas de banco incluidas. Ejemplo de partida: Básico/Prioritario/Premium.
- Mantenimiento preventivo: tareas recurrentes que también descuentan del banco de horas al completarse.

STACK FIJO:
- Backend: Python 3.12 + FastAPI + PostgreSQL (no Rust: esta app no tiene cómputo pesado).
- Frontend: React + Vite + TS + Tailwind v4 + shadcn/ui, panel interno + portal del cliente (mismo backend, rol distinto).
- Scheduler separado para vencimientos de SLA, cierre mensual del banco de horas, recordatorios de mantenimiento.
- Docker Compose (app + db + scheduler), autoalojado. start.sh / clean.sh (clean.sh NO borra la base de
  datos por defecto; requiere --data y confirmación).

TAREA INICIAL:
a) Fase 0 y Fase 1 completas: clientes, aplicaciones, contratos, planes configurables, banco de horas
   con reinicio mensual correcto.
b) Diseñar el motor de SLA (sla_engine.py) con pruebas de los casos borde de ventana de cobertura
   ANTES de integrarlo a los tickets.
c) Reportar: estructura creada, decisiones tomadas, siguiente paso.
```

---

### Cierre

El negocio que describiste ya tenía la lógica correcta — banco de horas para lo recurrente, tickets separados para lo que escala, planes que se diferencian por tiempo de respuesta. Lo que faltaba era un sistema que la aplicara sin que dependiera de que vos te acuerdes de todo. Las dos decisiones que confirmaste (uso interno, horas que se pierden si no se usan) ya están reflejadas en las reglas de negocio del §1 y en el modelo de datos — el siguiente paso real es la Fase 0 y, dentro de ella, construir y probar bien el motor de SLA del §4.3 antes de que ningún cliente dependa de sus plazos.

---

## 13. Script de inicio automático

`start.sh` inicializa todo el proyecto de forma automática:

- Levanta `docker compose up -d --build`.
- Espera salud de Postgres.
- Crea esquema con `Base.metadata.create_all`.
- Siembra planes por defecto Básico/Prioritario/Premium.
- Muestra estado y logs de la API.

Uso:
```bash
cd soporteflow
chmod +x start.sh
./start.sh
```

Variables de entorno opcionales: `DB_PASSWORD`, `JWT_SECRET`, `SMTP_HOST`.

`clean.sh` mantiene base de datos a menos que se pase `--data` con confirmación.
