from datetime import datetime
from app.services.sla_engine import calcular_vencimiento

def test_sla_basic():
    plan = {
        "window_coverage": {"timezone":"UTC","days":[0,1,2,3,4],"start_hour":9,"end_hour":18},
        "sla_by_severity": {"critico":24,"normal":72}
    }
    apertura = datetime(2025,10,10,10,0,0)
    venc = calcular_vencimiento(apertura, "normal", plan)
    assert venc > apertura
    print("OK", venc)

if __name__ == "__main__":
    test_sla_basic()
