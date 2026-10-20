#!/usr/bin/env bash
set -e

export DB_PASSWORD=${DB_PASSWORD:-soporteflow}
export JWT_SECRET=${JWT_SECRET:-change-me}
export SMTP_HOST=${SMTP_HOST:-}

echo "[SoporteFlow] Iniciando proyecto..."
docker compose up -d --build

echo "[SoporteFlow] Esperando base de datos..."
until docker compose exec -T db pg_isready -U soporteflow >/dev/null 2>&1; do
  sleep 2
done

echo "[SoporteFlow] Inicializando esquema de base de datos..."
docker compose exec -T app python -c "
from app.db.session import engine, Base
from app.models import models
Base.metadata.create_all(bind=engine)
print('Esquema creado')
"

echo "[SoporteFlow] Sembrando planes por defecto..."
docker compose exec -T app python -c "
from app.db.session import SessionLocal
from app.models.models import Plans
db = SessionLocal()
if not db.query(Plans).first():
    plans = [
        {'name':'Básico','window_coverage':{'timezone':'America/Argentina/Buenos_Aires','days':[0,1,2,3,4],'start_hour':9,'end_hour':18},'sla_by_severity':{'critico':24,'normal':72},'hours_bank_default':30},
        {'name':'Prioritario','window_coverage':{'timezone':'America/Argentina/Buenos_Aires','days':[0,1,2,3,4,5],'start_hour':8,'end_hour':20},'sla_by_severity':{'critico':4,'normal':24},'hours_bank_default':60},
        {'name':'Premium','window_coverage':{'timezone':'America/Argentina/Buenos_Aires','days':[0,1,2,3,4,5,6],'start_hour':0,'end_hour':24},'sla_by_severity':{'critico':1,'normal':4},'hours_bank_default':120},
    ]
    for p in plans:
        db.add(Plans(**p))
    db.commit()
    print('Planes sembrados')
else:
    print('Planes ya existen')
"

echo "[SoporteFlow] Salud de servicios:"
docker compose ps

echo "[SoporteFlow] API disponible en http://127.0.0.1:8000"
echo "[SoporteFlow] Logs:"
docker compose logs -f app
