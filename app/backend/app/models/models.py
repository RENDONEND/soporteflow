from sqlalchemy import Column, Integer, String, Text, JSON, DateTime, ForeignKey, Enum, Numeric, Boolean
from sqlalchemy.orm import relationship
from app.db.session import Base
import enum

class PlanCoverageType(str, enum.Enum):
    BASICO = "basico"
    PRIORITARIO = "prioritario"
    PREMIUM = "premium"

class TicketType(str, enum.Enum):
    SOPORTE = "soporte"
    FUNCIONALIDAD = "funcionalidad"

class TicketSeverity(str, enum.Enum):
    CRITICO = "critico"
    ALTO = "alto"
    NORMAL = "normal"
    BAJO = "bajo"

class TicketStatus(str, enum.Enum):
    ABIERTO = "abierto"
    EN_PROGRESO = "en_progreso"
    ESPERANDO_CLIENTE = "esperando_cliente"
    RESUELTO = "resuelto"
    CERRADO = "cerrado"

class PackStatus(str, enum.Enum):
    PROPUESTO = "propuesto"
    APROBADO = "aprobado"
    EN_DESARROLLO = "en_desarrollo"
    ENTREGADO = "entregado"
    FACTURADO = "facturado"

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    TECNICO = "tecnico"
    CLIENTE = "cliente"

class Clients(Base):
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    contacts = Column(JSON)

class Applications(Base):
    __tablename__ = "applications"
    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"))
    name = Column(String, nullable=False)
    description = Column(Text)

class Plans(Base):
    __tablename__ = "plans"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    window_coverage = Column(JSON)
    sla_by_severity = Column(JSON)
    hours_bank_default = Column(Integer)
    what_covers = Column(JSON)

class Contracts(Base):
    __tablename__ = "contracts"
    id = Column(Integer, primary_key=True)
    application_id = Column(Integer, ForeignKey("applications.id"))
    plan_id = Column(Integer, ForeignKey("plans.id"))
    hours_bank_month = Column(Integer)
    cut_date_day = Column(Integer)
    currency = Column(String, default="USD")
    hourly_rate_extra = Column(Numeric)
    timezone = Column(String, default="America/Argentina/Buenos_Aires")
    state = Column(String, default="activo")

class HourBankCycles(Base):
    __tablename__ = "hour_bank_cycles"
    id = Column(Integer, primary_key=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"))
    month = Column(String)  # YYYY-MM
    hours_assigned = Column(Numeric)
    hours_consumed = Column(Numeric, default=0)
    closed = Column(Boolean, default=False)

class Tickets(Base):
    __tablename__ = "tickets"
    id = Column(Integer, primary_key=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"))
    type = Column(Enum(TicketType))
    severity = Column(Enum(TicketSeverity), nullable=True)
    status = Column(Enum(TicketStatus), default=TicketStatus.ABIERTO)
    title = Column(String)
    description = Column(Text)
    created_by = Column(Integer)
    opened_at = Column(DateTime)
    sla_deadline = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)

class TicketTimeLogs(Base):
    __tablename__ = "ticket_time_logs"
    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"))
    user_id = Column(Integer)
    hours = Column(Numeric)
    logged_at = Column(DateTime)
    note = Column(Text)

class FeaturePacks(Base):
    __tablename__ = "feature_packs"
    id = Column(Integer, primary_key=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"))
    name = Column(String)
    status = Column(Enum(PackStatus), default=PackStatus.PROPUESTO)
    hours_estimated = Column(Numeric)
    hours_real = Column(Numeric, default=0)
    price = Column(Numeric)
    approved_by = Column(Integer, nullable=True)
    approved_at = Column(DateTime, nullable=True)

class MaintenanceTasks(Base):
    __tablename__ = "maintenance_tasks"
    id = Column(Integer, primary_key=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"))
    name = Column(String)
    recurrence = Column(String)
    checklist = Column(JSON)

class MaintenanceRuns(Base):
    __tablename__ = "maintenance_runs"
    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("maintenance_tasks.id"))
    run_at = Column(DateTime)
    completed_by = Column(Integer)
    hours = Column(Numeric)
    notes = Column(Text)

class Users(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    role = Column(Enum(UserRole))
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    email = Column(String, unique=True)
    name = Column(String)
    hashed_password = Column(String)
