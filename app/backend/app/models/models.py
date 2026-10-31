from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
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
    RECHAZADO = "rechazado"
    EN_DESARROLLO = "en_desarrollo"
    ENTREGADO = "entregado"
    FACTURADO = "facturado"


class MaintenanceRecurrence(str, enum.Enum):
    SEMANAL = "semanal"
    MENSUAL = "mensual"
    TRIMESTRAL = "trimestral"


class NotificationType(str, enum.Enum):
    TICKET_CREADO = "ticket_creado"
    TICKET_COMENTARIO = "ticket_comentario"
    TICKET_ESTADO = "ticket_estado"
    SLA_POR_VENCER = "sla_por_vencer"
    SLA_VENCIDO = "sla_vencido"
    BANCO_UMBRAL = "banco_umbral"
    BANCO_AGOTADO = "banco_agotado"
    PACK_PROPUESTO = "pack_propuesto"
    PACK_APROBADO = "pack_aprobado"
    PACK_RECHAZADO = "pack_rechazado"
    MANTENIMIENTO_PENDIENTE = "mantenimiento_pendiente"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    TECNICO = "tecnico"
    CLIENTE = "cliente"


class Clients(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    contacts = Column(JSON)

    applications = relationship("Applications", back_populates="client")


class Applications(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text)

    client = relationship("Clients", back_populates="applications")
    contracts = relationship("Contracts", back_populates="application")


class Plans(Base):
    __tablename__ = "plans"

    id = Column(Integer, primary_key=True)
    name = Column(String(80), nullable=False)
    window_coverage = Column(JSON, nullable=False)
    sla_by_severity = Column(JSON, nullable=False)
    response_sla_by_severity = Column(JSON, nullable=True)
    hours_bank_default = Column(Numeric(6, 2), nullable=False)
    what_covers = Column(JSON)


class Contracts(Base):
    __tablename__ = "contracts"

    id = Column(Integer, primary_key=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False, index=True)
    hours_bank_month = Column(Numeric(6, 2), nullable=False)
    cut_date_day = Column(Integer, nullable=False, default=1)
    currency = Column(String(3), nullable=False, default="USD")
    hourly_rate_extra = Column(Numeric(10, 2), nullable=False, default=0)
    timezone = Column(String(64), nullable=False, default="America/Argentina/Buenos_Aires")
    state = Column(String(20), nullable=False, default="activo")

    application = relationship("Applications", back_populates="contracts")
    plan = relationship("Plans")
    cycles = relationship("HourBankCycles", back_populates="contract")


class HourBankCycles(Base):
    __tablename__ = "hour_bank_cycles"
    __table_args__ = (UniqueConstraint("contract_id", "month", name="uq_cycle_contract_month"),)

    id = Column(Integer, primary_key=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False, index=True)
    month = Column(String(7), nullable=False)  # YYYY-MM del inicio del ciclo
    hours_assigned = Column(Numeric(6, 2), nullable=False)
    hours_consumed = Column(Numeric(6, 2), nullable=False, default=0)
    closed = Column(Boolean, nullable=False, default=False)

    contract = relationship("Contracts", back_populates="cycles")


class HourBankAdjustments(Base):
    __tablename__ = "hour_bank_adjustments"

    id = Column(Integer, primary_key=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False, index=True)
    cycle_id = Column(Integer, ForeignKey("hour_bank_cycles.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    hours = Column(Numeric(6, 2), nullable=False)
    note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Tickets(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False, index=True)
    type = Column(Enum(TicketType), nullable=False)
    severity = Column(Enum(TicketSeverity), nullable=True)
    status = Column(Enum(TicketStatus), default=TicketStatus.ABIERTO)
    title = Column(String(200))
    description = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    opened_at = Column(DateTime(timezone=True))
    response_deadline = Column(DateTime(timezone=True), nullable=True)
    sla_deadline = Column(DateTime(timezone=True), nullable=True)
    first_response_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    contract = relationship("Contracts")
    creator = relationship("Users", foreign_keys=[created_by])
    assignee = relationship("Users", foreign_keys=[assigned_to])
    comments = relationship(
        "TicketComments",
        back_populates="ticket",
        order_by="TicketComments.created_at",
        cascade="all, delete-orphan",
    )
    time_logs = relationship(
        "TicketTimeLogs",
        back_populates="ticket",
        order_by="TicketTimeLogs.logged_at",
        cascade="all, delete-orphan",
    )
    attachments = relationship(
        "TicketAttachments",
        back_populates="ticket",
        order_by="TicketAttachments.created_at",
        cascade="all, delete-orphan",
    )
    packs = relationship(
        "FeaturePacks",
        secondary="feature_pack_tickets",
        back_populates="tickets",
    )


class TicketTimeLogs(Base):
    __tablename__ = "ticket_time_logs"

    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    hours = Column(Numeric(6, 2))
    logged_at = Column(DateTime(timezone=True))
    note = Column(Text)

    ticket = relationship("Tickets", back_populates="time_logs")
    user = relationship("Users")


class TicketComments(Base):
    __tablename__ = "ticket_comments"

    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    body = Column(Text, nullable=False)
    internal = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    ticket = relationship("Tickets", back_populates="comments")
    author = relationship("Users")


class TicketAttachments(Base):
    __tablename__ = "ticket_attachments"

    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    filename = Column(String(255), nullable=False)
    content_type = Column(String(120))
    size = Column(Integer, nullable=False, default=0)
    storage_path = Column(String(500), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    ticket = relationship("Tickets", back_populates="attachments")
    author = relationship("Users")


class FeaturePacks(Base):
    __tablename__ = "feature_packs"

    id = Column(Integer, primary_key=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False, index=True)
    name = Column(String(160))
    description = Column(Text)
    status = Column(Enum(PackStatus), default=PackStatus.PROPUESTO)
    hours_estimated = Column(Numeric(6, 2))
    hours_real = Column(Numeric(6, 2), default=0)
    price = Column(Numeric(12, 2))
    currency = Column(String(3), nullable=False, default="USD")
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    decided_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    billed_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    contract = relationship("Contracts")
    approver = relationship("Users", foreign_keys=[approved_by])
    decider = relationship("Users", foreign_keys=[decided_by])
    creator = relationship("Users", foreign_keys=[created_by])
    tickets = relationship("Tickets", secondary="feature_pack_tickets", back_populates="packs")


class FeaturePackTickets(Base):
    __tablename__ = "feature_pack_tickets"

    pack_id = Column(
        Integer, ForeignKey("feature_packs.id"), primary_key=True
    )
    ticket_id = Column(Integer, ForeignKey("tickets.id"), primary_key=True)


class MaintenanceTasks(Base):
    __tablename__ = "maintenance_tasks"

    id = Column(Integer, primary_key=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False, index=True)
    name = Column(String(160), nullable=False)
    recurrence = Column(Enum(MaintenanceRecurrence), default=MaintenanceRecurrence.MENSUAL)
    checklist = Column(JSON)
    estimated_hours = Column(Numeric(6, 2), nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    contract = relationship("Contracts")


class MaintenanceRuns(Base):
    __tablename__ = "maintenance_runs"

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("maintenance_tasks.id"), nullable=False, index=True)
    run_at = Column(DateTime(timezone=True))
    completed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    hours = Column(Numeric(6, 2))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    task = relationship("MaintenanceTasks")
    user = relationship("Users")


class Notifications(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(Enum(NotificationType), nullable=False)
    title = Column(String(200), nullable=False)
    body = Column(Text)
    link = Column(String(300))
    read = Column(Boolean, nullable=False, default=False)
    email_sent = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("Users")


class Users(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    role = Column(Enum(UserRole), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    email = Column(String(160), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    hashed_password = Column(String(200), nullable=False)
