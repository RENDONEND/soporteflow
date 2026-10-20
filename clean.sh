#!/usr/bin/env bash
set -e

PROJECT_NAME="SoporteFlow"

if [ "$1" = "--keep-data" ]; then
  docker compose down --remove-orphans
  echo "Contenedores detenidos. Base de datos preservada."
  exit 0
fi

echo "[SoporteFlow] Deteniendo y eliminando proyecto completo..."
docker compose down -v --remove-orphans

echo "[SoporteFlow] Eliminando redes e imágenes huérfanas del proyecto..."
docker network prune -f --filter "label=com.docker.compose.project=$PROJECT_NAME"
docker volume prune -f
docker image prune -f

echo "[SoporteFlow] Limpieza completa. Todo lo relacionado al proyecto eliminado."
