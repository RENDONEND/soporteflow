# SoporteFlow

Gestión de soporte post-entrega para una agencia: clientes, aplicaciones,
contratos, planes con SLA, banco de horas mensual y (más adelante) tickets,
packs y portal del cliente.

**Estado:** Fase 0 (cimientos) y Fase 1 (núcleo comercial) implementadas.
Tickets, packs, mantenimiento y frontend están pendientes (ver §Roadmap).

## Requisito

- Docker + Docker Compose. Nada más.

## Arranque

```bash
./start.sh
```

La primera ejecución:

1. genera `.env` con `DB_PASSWORD`, `JWT_SECRET` y `ADMIN_PASSWORD` aleatorios;
2. construye y levanta Postgres;
3. aplica migraciones Alembic;
4. siembra los planes Básico/Prioritario/Premium y el usuario admin;
5. levanta la API y el scheduler;
6. imprime la URL, el usuario admin y su contraseña.

- API: <http://127.0.0.1:8000>
- Docs interactivas: <http://127.0.0.1:8000/docs>
- Credenciales: `./start.sh credentials` (o `.env`)

## Comandos

| Comando | Qué hace |
|---|---|
| `./start.sh` | Levanta todo (idempotente) |
| `./start.sh test` | pytest en Docker con SQLite, sin tocar datos reales |
| `./start.sh migrate` | Aplica migraciones pendientes |
| `./start.sh seed` | Planes y admin (no duplica si ya existen) |
| `./start.sh logs` / `status` / `stop` | Operación diaria |
| `./start.sh credentials` | Muestra el admin y su contraseña |
| `./clean.sh` | Detiene contenedores y **conserva** la base |
| `./clean.sh --data` | Borra también el volumen (pide escribir `BORRAR`) |

## Roles y autenticación

JWT con `Authorization: Bearer <token>`.

| Rol | Permisos |
|---|---|
| `admin` | Todo: planes, clientes, aplicaciones, contratos, consumo de horas, usuarios |
| `tecnico` | Lectura de todo + registrar consumo de horas |
| `cliente` | Solo lectura de su propio cliente, aplicaciones, contratos y banco de horas |

Aislamiento: un usuario `cliente` con `client_id` distinto recibe `403` en
cualquier recurso ajeno. Cubierto por tests.

## API (resumen)

| Método | Ruta | Rol |
|---|---|---|
| `POST` | `/auth/login` | público |
| `GET` | `/auth/me` | autenticado |
| `GET/POST` | `/users` | admin |
| `GET/POST` | `/clients` | lectura autenticado · alta admin |
| `GET/PUT` | `/clients/{id}` | lectura con aislamiento · edición admin |
| `GET/POST` | `/clients/{id}/applications` | lectura con aislamiento · alta admin |
| `GET/PUT` | `/applications/{id}` | ídem |
| `GET/POST` | `/applications/{id}/contracts` | ídem |
| `GET/PUT` | `/contracts`, `/contracts/{id}` | ídem |
| `GET/POST/PUT` | `/plans`, `/plans/{id}` | lectura autenticado · escritura admin |
| `POST` | `/plans/{id}/duplicate` | admin |
| `GET` | `/contracts/{id}/hour-bank` | lectura con aislamiento |
| `GET` | `/contracts/{id}/hour-bank/history` | lectura con aislamiento |
| `POST` | `/contracts/{id}/hour-bank/consume` | admin/técnico |

Ejemplo:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@soporteflow.local","password":"<la de .env>"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

curl -s http://127.0.0.1:8000/plans -H "Authorization: Bearer $TOKEN"
```

## Banco de horas

- Cada contrato define `hours_bank_month` y `cut_date_day`.
- El ciclo va de `cut_date_day` de un mes al mismo día del siguiente (con ajuste
  en meses cortos) y se identifica como `YYYY-MM`.
- **No arrastra remanente:** al cerrar el ciclo, el siguiente arranca con las
  horas completas del contrato.
- `hours_remaining <= 0` → alerta `agotado`; `<= 20%` → alerta `umbral`.
- El scheduler revisa cada hora: cierra ciclos vencidos y crea el vigente.
- Cada consumo manual queda registrado en `hour_bank_adjustments` (quién,
  cuánto, cuándo y nota).

## SLA

`app/services/sla_engine.py` calcula vencimientos en **horas de cobertura**:
solo corre el reloj dentro de la ventana del plan y se saltan feriados.

Ejemplo: Básico (Lun–Vie 9–18) con `normal = 27` equivale a 3 días hábiles.
Premium (24/7) con `critico = 1` equivale a 1 hora de reloj.

Los planes son editables por API; los valores sembrados son un punto de
partida, no una regla fija.

## Pruebas

```bash
./start.sh test
```

Cubre: SLA (ventanas, fines de semana, feriados, 24/7), ciclos del banco
(sin arrastre, umbrales, consumo), autenticación/roles, aislamiento entre
clientes y CRUD de planes/aplicaciones/contratos.

## Roadmap

- **Fase 2:** tickets soporte vs funcionalidad, severidades, SLA integrado,
  time logs que descuentan banco, comentarios/adjuntos.
- **Fase 3:** packs cotizados con aprobación del cliente.
- **Fase 4:** mantenimiento preventivo + portal del cliente.
- **Fase 5:** reportes exportables, auditoría completa.
- **Frontend:** React + Vite + Tailwind + shadcn (hoy es un stub).

## Seguridad

- `.env` no se versiona (`.gitignore`); secretos aleatorios por instalación.
- La API escucha solo en `127.0.0.1`; para exponerla usa un reverse proxy con
  TLS.
- CORS restringido por `CORS_ORIGINS`.
- Contenedor sin root (`appuser`).
- Para producción: rotá `ADMIN_PASSWORD` después del primer login, configurá
  SMTP y serví el frontend desde el mismo origen.
