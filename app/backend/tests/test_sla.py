from datetime import datetime, timezone

import pytest

from app.services.sla_engine import (
    add_working_hours,
    calcular_vencimiento,
    coverage_hours_per_day,
    is_working_time,
)

BASICO = {
    "window_coverage": {
        "timezone": "UTC",
        "days": [0, 1, 2, 3, 4],
        "start_hour": 9,
        "end_hour": 18,
        "holidays": [],
    },
    "sla_by_severity": {"critico": 9, "alto": 18, "normal": 27, "bajo": 36},
}

PREMIUM = {
    "window_coverage": {
        "timezone": "UTC",
        "days": [0, 1, 2, 3, 4, 5, 6],
        "start_hour": 0,
        "end_hour": 24,
        "holidays": [],
    },
    "sla_by_severity": {"critico": 1, "alto": 2, "normal": 4, "bajo": 8},
}


def utc(*args) -> datetime:
    return datetime(*args, tzinfo=timezone.utc)


def test_coverage_hours_per_day():
    assert coverage_hours_per_day(BASICO["window_coverage"]) == pytest.approx(9)
    assert coverage_hours_per_day(PREMIUM["window_coverage"]) == pytest.approx(24)


def test_working_time_boundaries():
    window = BASICO["window_coverage"]
    assert is_working_time(utc(2026, 10, 19, 9, 0), window) is True
    assert is_working_time(utc(2026, 10, 19, 17, 59), window) is True
    assert is_working_time(utc(2026, 10, 19, 18, 0), window) is False
    assert is_working_time(utc(2026, 10, 17, 12, 0), window) is False  # sábado
    assert is_working_time(utc(2026, 10, 19, 8, 59), window) is False


def test_critico_una_jornada_desde_media_manana():
    # 9 h de cobertura desde lunes 10:00: 8 h del lunes + 1 h del martes
    assert calcular_vencimiento(utc(2026, 10, 19, 10, 0), "critico", BASICO) == utc(
        2026, 10, 20, 10, 0
    )


def test_normal_tres_jornadas():
    # 27 h = 8 (lunes) + 9 (martes) + 9 (miércoles) + 1 (jueves)
    assert calcular_vencimiento(utc(2026, 10, 19, 10, 0), "normal", BASICO) == utc(
        2026, 10, 22, 10, 0
    )


def test_alto_dos_jornadas_desde_apertura():
    assert calcular_vencimiento(utc(2026, 10, 19, 9, 0), "alto", BASICO) == utc(
        2026, 10, 20, 18, 0
    )


def test_viernes_antes_del_cierre_cruza_el_fin_de_semana():
    # Viernes 17:00: 1 h del viernes + 8 h del lunes
    assert calcular_vencimiento(utc(2026, 10, 23, 17, 0), "critico", BASICO) == utc(
        2026, 10, 26, 17, 0
    )


def test_apertura_justo_al_cierre_pasa_al_lunes():
    assert calcular_vencimiento(utc(2026, 10, 23, 18, 0), "critico", BASICO) == utc(
        2026, 10, 26, 18, 0
    )


def test_apertura_fuera_de_horario_un_sabado():
    # Sábado 12:00 -> arranca lunes 9:00; 27 h -> miércoles 18:00
    assert calcular_vencimiento(utc(2026, 10, 17, 12, 0), "normal", BASICO) == utc(
        2026, 10, 21, 18, 0
    )


def test_feriado_se_salta():
    plan = {
        "window_coverage": {
            "timezone": "UTC",
            "days": [0, 1, 2, 3, 4],
            "start_hour": 9,
            "end_hour": 18,
            "holidays": ["2026-10-19"],
        },
        "sla_by_severity": {"critico": 9},
    }
    # El lunes es feriado: la jornada completa corre el martes
    assert calcular_vencimiento(utc(2026, 10, 19, 10, 0), "critico", plan) == utc(
        2026, 10, 20, 18, 0
    )


def test_premium_24_7_es_reloj_corrido():
    assert calcular_vencimiento(utc(2026, 10, 19, 10, 0), "critico", PREMIUM) == utc(
        2026, 10, 19, 11, 0
    )
    assert calcular_vencimiento(utc(2026, 10, 23, 22, 0), "normal", PREMIUM) == utc(
        2026, 10, 24, 2, 0
    )


def test_medias_horas():
    assert add_working_hours(utc(2026, 10, 19, 10, 0), 0.5, BASICO["window_coverage"]) == utc(
        2026, 10, 19, 10, 30
    )


def test_fecha_naive_se_asume_utc():
    naive = datetime(2026, 10, 19, 10, 0)
    assert calcular_vencimiento(naive, "critico", BASICO) == utc(2026, 10, 20, 10, 0)


def test_severidad_desconocida_usa_default():
    # 72 h de cobertura: 8 del lunes + 7 jornadas completas + 1 h del jueves
    assert calcular_vencimiento(utc(2026, 10, 19, 10, 0), "inexistente", BASICO) == utc(
        2026, 10, 29, 10, 0
    )
