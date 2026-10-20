# SoporteFlow

Gestión de soporte post-entrega para una agencia: clientes, aplicaciones,
contratos, planes con SLA, banco de horas mensual, tickets y portal del cliente.

**Estado:** Fase 0 (cimientos), Fase 1 (núcleo comercial) y Fase 2 (tickets,
SLA, banco integrado y frontend) implementadas. Packs y mantenimiento preventivo
quedan para fases siguientes (ver §Roadmap).

## Requisito

- Docker + Docker Compose. Nada más.

## Arranque

```bash
./start.sh
```

La primera ejecución:

1. genera `.env` con `DB_PASSWORD`, `JWT_SECRET` y `ADMIN_PASSWORD` aleatorios;
2. construye el frontend y la imagen de la API;
3. levanta Postgres;
4. aplica migraciones Alembic;
5. siembra los planes Básico/Prioritario/Premium y el usuario admin;
6. levanta la API y el scheduler;
7. imprime la URL, el usuario admin y su contraseña.

- Aplicación (UI + API): <http://127.0.0.1:8000>
- Docs interactivas: <http://127.0.0.1:8000/docs>
- Credenciales: `./start.sh credentials` (o `.env`)

El frontend se compila en la imagen y FastAPI sirve el SPA en el mismo origen,
así que no hay un servicio extra ni CORS en producción.

## Comandos

| Comando | Qué hace |
|---|---|
| `./start.sh` | Levanta todo (idempotente) |
| `./start.sh test` | pytest en Docker con SQLite, sin tocar datos reales |
| `./start.sh migrate` | Aplica migraciones pendientes |
| `./start.sh seed` | Planes y admin (no duplica si ya existen) |
| `./start.sh logs` / `status` / `stop` | Operación diaria |
| `./start.sh credentials` | Muestra el admin y su contraseña |
| `./clean.sh` | Detiene contenedores y **conserva** la base y los adjuntos |
| `./clean.sh --data` | Borra también volúmenes (pide escribir `BORRAR`) |

## Roles y autenticación

JWT con `Authorization: Bearer <token>`.

| Rol | Permisos |
|---|---|
| `admin` | Todo: planes, clientes, aplicaciones, contratos, usuarios, tickets, horas |
| `tecnico` | Lectura de todo, comentarios internos, estados, asignación y consumo de horas |
| `cliente` | Su propio servicio: tickets, comentarios públicos, banco y SLA en lectura |

Aislamiento: un usuario `cliente` con `client_id` distinto recibe `403` en
cualquier recurso ajeno (clientes, contratos, tickets, adjuntos, banco). Cubierto
por tests.

## API (resumen)

| Método | Ruta | Rol |
|---|---|---|
| `POST` | `/api/auth/login` | público |
| `GET` | `/api/auth/me` | autenticado |
| `GET/POST` | `/api/users` | admin |
| `GET/POST` | `/api/clients` | lectura autenticado · alta admin |
| `GET/PUT` | `/api/clients/{id}` | lectura con aislamiento · edición admin |
| `GET/POST` | `/api/clients/{id}/applications` | lectura con aislamiento · alta admin |
| `GET/PUT` | `/api/applications/{id}` | ídem |
| `GET/POST` | `/api/applications/{id}/contracts` | ídem |
| `GET/PUT` | `/api/contracts`, `/api/contracts/{id}` | ídem |
| `GET/POST/PUT` | `/api/plans`, `/api/plans/{id}` | lectura autenticado · escritura admin |
| `POST` | `/api/plans/{id}/duplicate` | admin |
| `GET` | `/api/contracts/{id}/hour-bank` | lectura con aislamiento |
| `GET` | `/api/contracts/{id}/hour-bank/history` | lectura con aislamiento |
| `POST` | `/api/contracts/{id}/hour-bank/consume` | admin/técnico |
| `GET` | `/api/dashboard` | autenticado (resumen según rol) |
| `GET/POST` | `/api/tickets` | autenticado · alta con aislamiento |
| `GET/PATCH` | `/api/tickets/{id}` | lectura con aislamiento · edición agencia |
| `POST` | `/api/tickets/{id}/comments` | autenticado (notas internas solo agencia) |
| `POST` | `/api/tickets/{id}/time-logs` | admin/técnico |
| `POST` | `/api/tickets/{id}/attachments` | autenticado con aislamiento |
| `GET` | `/api/tickets/{id}/attachments/{attachment_id}` | autenticado con aislamiento |
| `DELETE` | `/api/tickets/{id}/attachments/{attachment_id}` | admin |

Ejemplo:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@soporteflow.local","password":"<la de .env>"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

curl -s http://127.0.0.1:8000/api/plans -H "Authorization: Bearer $TOKEN"
```

## Tickets y SLA

- **Soporte:** incidente dentro de lo entregado. Lleva severidad, calcula SLA y
  descuenta banco de horas al imputar tiempo.
- **Funcionalidad:** pedido nuevo, se cotiza aparte (packs, Fase 3). No lleva
  severidad, no tiene SLA y **no descuenta banco**; igual permite registrar
  horas para medir el esfuerzo.
- Estados: `abierto → en_progreso → esperando_cliente → resuelto → cerrado`
  (se puede reabrir).
- Cada ticket de soporte guarda dos plazos calculados al crearse: **primera
  respuesta** y **resolución**. Si cambia la severidad, se recalculan.
- `first_response_at` se marca con el primer comentario de la agencia, el primer
  time log o al pasar a un estado de atención.
- Los estados de cumplimiento son `ok`, `warning` (≥80% del plazo), `breached` y
  `met`; se calculan al consultar, no se persisten.
- El scheduler cada 15 minutos revisa el banco y registra SLA vencidos/por vencer
  en el log (el envío de emails queda para más adelante).

`app/services/sla_engine.py` calcula vencimientos en **horas de cobertura**:
solo corre el reloj dentro de la ventana del plan y se saltan feriados.

Ejemplo: Básico (Lun–Vie 9–18) con `normal = 27` equivale a 3 jornadas de 9 h.
Premium (24/7) con `critico = 1` equivale a 1 hora de reloj.

Los planes guardan `sla_by_severity` (resolución) y, opcionalmente,
`response_sla_by_severity` (primera respuesta). Si este último falta, se usa el
mismo valor que resolución.

## Banco de horas

- Cada contrato define `hours_bank_month` y `cut_date_day`.
- El ciclo va de `cut_date_day` de un mes al mismo día del siguiente (con ajuste
  en meses cortos) y se identifica como `YYYY-MM`.
- **No arrastra remanente:** al cerrar el ciclo, el siguiente arranca con las
  horas completas del contrato.
- `hours_remaining <= 0` → alerta `agotado`; `<= 20%` → alerta `umbral`.
- El scheduler revisa cada 15 minutos: cierra ciclos vencidos, crea el vigente y
  monitorea SLA.
- Cada consumo queda registrado en `hour_bank_adjustments` (quién, cuánto, cuándo
  y nota), venga de un ticket o de una carga manual.
- Un contrato archivado no admite consumos nuevos (`409`); el historial y las
  consultas siguen disponibles.
- Cambiar las horas del contrato afecta al ciclo siguiente, no al vigente.

## Frontend

React 18 + Vite + TypeScript + Tailwind CSS, con componentes propios (sin
dependencia de shadcn). Incluye:

- **Agencia:** resumen con alertas, tickets con filtros y detalle (comentarios
  internos, adjuntos, time logs, estados/asignación), clientes y aplicaciones,
  contratos con banco e historial, planes editables y usuarios.
- **Cliente:** resumen del plan y saldo, tickets propios, comentarios y adjuntos,
  detalle del servicio con SLA y renovación.
- Login JWT, navegación según rol y diseño responsive.

Desarrollo con recarga en caliente:

```bash
# con la API levantada en :8000
cd app/frontend
npm install
npm run dev   # http://127.0.0.1:5173 (proxy a la API)
```

## Pruebas

```bash
./start.sh test
```

52 tests cubren: SLA (ventanas, fines de semana, feriados, 24/7, primera
respuesta), ciclos del banco (sin arrastre, umbrales, consumo), autenticación y
roles, aislamiento entre clientes, tickets (creación, severidades, estados,
comentarios internos, time logs, adjuntos), dashboard y CRUD de
planes/aplicaciones/contratos.

## Roadmap

- **Fase 3:** packs cotizados con aprobación del cliente y bloqueo de cierre de
  tickets de funcionalidad sin pack aprobado.
- **Fase 4:** mantenimiento preventivo con tareas recurrentes y mejoras del
  portal (notificaciones/emails).
- **Fase 5:** reportes exportables, auditoría completa y métricas históricas.
- **Pendientes conocidos:** envío de emails/SMTP, notificaciones push y edición
  de usuarios (hoy se crean por API/UI, sin recuperación de contraseña).

## Seguridad

- `.env` no se versiona (`.gitignore`); secretos aleatorios por instalación.
- La API escucha solo en `127.0.0.1`; para exponerla usa un reverse proxy con
  TLS.
- CORS restringido por `CORS_ORIGINS`.
- Contenedor sin root (`appuser`).
- Adjuntos limitados a 10 MB (`MAX_UPLOAD_MB`), con nombres aleatorios y descarga
  autenticada; se guardan en el volumen `uploads`.
- Para producción: rotá `ADMIN_PASSWORD` después del primer login, configurá
  SMTP y serví todo detrás de HTTPS.
