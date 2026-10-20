"""Scheduler: banco de horas y monitoreo de SLA."""

import logging

from apscheduler.schedulers.blocking import BlockingScheduler

from app.db.session import SessionLocal
from app.services import hour_bank
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
        db.commit()
        log.info(
            "banco: %s cerrados, %s creados · SLA: %s abiertos, %s vencidos, %s por vencer",
            bank["closed"],
            bank["created"],
            sla["open_with_sla"],
            len(sla["breached"]),
            len(sla["warning"]),
        )
        if sla["breached"]:
            log.warning("tickets con SLA vencido: %s", sla["breached"])
        if sla["response_overdue"]:
            log.warning("primera respuesta vencida: %s", sla["response_overdue"])
        return {"bank": bank, "sla": sla}
    except Exception:
        db.rollback()
        log.exception("falló el mantenimiento programado")
        raise
    finally:
        db.close()


def main() -> None:
    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(
        run_once,
        "interval",
        minutes=15,
        id="tick",
        coalesce=True,
        max_instances=1,
    )
    run_once()
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("scheduler detenido")


if __name__ == "__main__":
    main()
