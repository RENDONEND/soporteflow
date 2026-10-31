"""Scheduler: banco de horas, SLA y mantenimiento preventivo."""

import logging

from apscheduler.schedulers.blocking import BlockingScheduler

from app.db.session import SessionLocal
from app.services import hour_bank
from app.services.alerts import notify_bank_alerts, notify_sla_alerts
from app.services.maintenance import notify_maintenance_due
from app.services.sla_monitor import check_sla

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("soporteflow.scheduler")


def run_once() -> dict:
    db = SessionLocal()
    try:
        bank = hour_bank.run_maintenance(db)
        sla = check_sla(db)
        maintenance = notify_maintenance_due(db)
        alerts = {
            "sla": notify_sla_alerts(db, sla),
            "bank": notify_bank_alerts(db),
        }
        db.commit()
        log.info(
            "banco: %s cerrados, %s creados · SLA: %s abiertos, %s vencidos, %s por vencer"
            " · mantenimiento vencido: %s",
            bank["closed"],
            bank["created"],
            sla["open_with_sla"],
            len(sla["breached"]),
            len(sla["warning"]),
            maintenance,
        )
        log.info("avisos enviados: %s", alerts)
        if sla["breached"]:
            log.warning("tickets con SLA vencido: %s", sla["breached"])
        if sla["response_overdue"]:
            log.warning("primera respuesta vencida: %s", sla["response_overdue"])
        return {
            "bank": bank,
            "sla": sla,
            "maintenance_due": maintenance,
            "alerts": alerts,
        }
    except Exception:
        db.rollback()
        log.exception("falló el mantenimiento programado")
        raise
    finally:
        db.close()


def main() -> None:
    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(run_once, "interval", minutes=15, id="maintenance")
    log.info("scheduler iniciado (cada 15 minutos)")
    run_once()
    scheduler.start()


if __name__ == "__main__":
    main()
