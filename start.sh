#!/usr/bin/env bash
# SoporteFlow — punto de entrada único.
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE=(docker compose)
PROJECT_URL="http://127.0.0.1:8000"

usage() {
  cat <<'EOF'
SoporteFlow — gestión de soporte y mantenimiento

Uso: ./start.sh [comando]

  (sin comando)   Levanta todo: DB, migraciones, semilla, API y scheduler
  test            Ejecuta pytest en un contenedor (sin tocar la base real)
  migrate         Aplica migraciones pendientes
  seed            Crea planes por defecto y el admin inicial (idempotente)
  status          Estado de los contenedores
  logs            Logs de la API en vivo
  stop            Detiene los contenedores (conserva los datos)
  credentials     Muestra el usuario admin y su contraseña (.env)
  shell           Shell dentro del contenedor de la API
  help            Esta ayuda

La primera ejecución crea .env con secretos aleatorios.
Los datos viven en el volumen Docker `pgdata` y NO se borran con stop.
Para borrarlos: ./clean.sh --data (pide confirmación).
EOF
}

ensure_env() {
  if [ ! -f .env ]; then
    umask 077
    {
      echo "DB_PASSWORD=$(openssl rand -hex 16)"
      echo "JWT_SECRET=$(openssl rand -hex 32)"
      echo "ADMIN_EMAIL=admin@soporteflow.local"
      echo "ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
      echo "CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173"
      echo "SMTP_HOST="
    } > .env
    echo "▸ .env creado con secretos aleatorios (no lo subas al repo)."
  fi
}

env_value() {
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | head -n1
}

wait_db() {
  echo "▸ Esperando a Postgres…"
  for _ in $(seq 1 60); do
    if "${COMPOSE[@]}" exec -T db pg_isready -U soporteflow >/dev/null 2>&1; then
      echo "  Postgres listo."
      return 0
    fi
    sleep 2
  done
  echo "error: Postgres no respondió a tiempo" >&2
  return 1
}

wait_app() {
  echo "▸ Esperando a la API…"
  for _ in $(seq 1 40); do
    if "${COMPOSE[@]}" exec -T app python -c \
      "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" >/dev/null 2>&1; then
      echo "  API lista."
      return 0
    fi
    sleep 2
  done
  echo "error: la API no respondió a tiempo. Revisá: ./start.sh logs" >&2
  return 1
}

up() {
  ensure_env
  echo "▸ Construyendo y levantando la base de datos…"
  "${COMPOSE[@]}" up -d --build db
  wait_db

  echo "▸ Construyendo imagen de la aplicación…"
  "${COMPOSE[@]}" build app scheduler

  echo "▸ Aplicando migraciones…"
  "${COMPOSE[@]}" run --rm app alembic upgrade head

  echo "▸ Sembrando datos iniciales…"
  "${COMPOSE[@]}" run --rm app python -m app.seed

  echo "▸ Levantando API y scheduler…"
  "${COMPOSE[@]}" up -d app scheduler
  wait_app

  echo
  echo "✓ SoporteFlow disponible en $PROJECT_URL"
  echo "  Docs interactivas:      $PROJECT_URL/docs"
  echo "  Admin:                  $(env_value ADMIN_EMAIL)"
  echo "  Contraseña:             $(env_value ADMIN_PASSWORD)"
  echo "  (guardadas en .env; cambialas cuando quieras)"
  echo
  echo "▸ Logs (Ctrl+C deja la app corriendo):"
  "${COMPOSE[@]}" logs -f --tail=50 app
}

case "${1:-up}" in
  up|"")              up ;;
  test)
    ensure_env
    echo "▸ Ejecutando pruebas en Docker (SQLite, sin tocar Postgres)…"
    "${COMPOSE[@]}" --profile test build test
    exec "${COMPOSE[@]}" --profile test run --rm test
    ;;
  migrate)   ensure_env; "${COMPOSE[@]}" run --rm app alembic upgrade head ;;
  seed)      ensure_env; "${COMPOSE[@]}" run --rm app python -m app.seed ;;
  status)    "${COMPOSE[@]}" ps ;;
  logs)      exec "${COMPOSE[@]}" logs -f --tail=100 app ;;
  stop)      "${COMPOSE[@]}" stop ;;
  credentials)
    echo "Usuario:    $(env_value ADMIN_EMAIL)"
    echo "Contraseña: $(env_value ADMIN_PASSWORD)"
    ;;
  shell)     ensure_env; exec "${COMPOSE[@]}" exec app bash ;;
  -h|--help|help) usage ;;
  *)
    echo "error: comando desconocido: $1" >&2
    usage >&2
    exit 2
    ;;
esac
