#!/usr/bin/env bash
# SoporteFlow — limpieza segura.
# Por defecto NO borra la base de datos: son contratos, horas y facturación.
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE=(docker compose)

usage() {
  cat <<'EOF'
Uso: ./clean.sh [opción]

  (sin opción)   Detiene y elimina contenedores y red. CONSERVA la base de datos.
  --data         Elimina además el volumen de Postgres y las imágenes del proyecto.
                 Pide escribir BORRAR. Para automatizar: --data --yes
  -h, --help     Esta ayuda
EOF
}

remove_project_data() {
  # --rmi local borra solo las imágenes construidas por este proyecto,
  # nunca postgres:16-alpine (que puede estar compartida con otros).
  "${COMPOSE[@]}" down -v --rmi local --remove-orphans
}

case "${1:-}" in
  ""|--keep-data)
    "${COMPOSE[@]}" down --remove-orphans
    echo "✓ Contenedores detenidos. Base de datos conservada."
    echo "  Para borrar también los datos: ./clean.sh --data"
    ;;
  --data)
    if [ "${2:-}" != "--yes" ]; then
      printf 'Esto BORRA contratos, tickets y horas de forma irreversible.\n'
      printf 'Escribí BORRAR para continuar: '
      read -r answer
      if [ "$answer" != "BORRAR" ]; then
        echo "Cancelado. No se borró nada."
        exit 1
      fi
    fi
    remove_project_data
    echo "✓ Proyecto eliminado, incluido el volumen pgdata."
    echo "  El archivo .env se conserva; borralo a mano si ya no lo necesitás."
    ;;
  -h|--help)
    usage
    ;;
  *)
    echo "error: opción desconocida: $1" >&2
    usage >&2
    exit 2
    ;;
esac
