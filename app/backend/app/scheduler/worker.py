"""Scheduler: cierre de ciclos de banco de horas y preparación del ciclo vigente."""

import logging

from apscheduler.schedulers.blocking import BlockingScheduler

from app.db.session import SessionLocal
from app.services import hour_bank

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("soporteflow.scheduler")


def run_once() -> dict:
    db = SessionLocal()
    try:
        result = hour_bank.run_maintenance(db)
        db.commit()
        log.info("banco de horas: %s ciclos cerrados, %s creados", result["closed"], result["created"])
        return result
    except Exception:
        db.rollback()
        log.exception("falló el mantenimiento del banco de horas")
        raise
    finally:
        db.close()


def main() -> None:
    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(
        run_once,
        "interval",
        minutes=60,
        id="hour-bank-maintenance",
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
