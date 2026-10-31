"""packs mantenimiento notificaciones

Revision ID: c84ef27f5505
Revises: ef06f48b4d52
Create Date: 2026-10-20 21:44:49.254542
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'c84ef27f5505'
down_revision: str | None = 'ef06f48b4d52'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('notifications',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('type', sa.Enum('TICKET_CREADO', 'TICKET_COMENTARIO', 'TICKET_ESTADO', 'SLA_POR_VENCER', 'SLA_VENCIDO', 'BANCO_UMBRAL', 'BANCO_AGOTADO', 'PACK_PROPUESTO', 'PACK_APROBADO', 'PACK_RECHAZADO', 'MANTENIMIENTO_PENDIENTE', name='notificationtype'), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('body', sa.Text(), nullable=True),
    sa.Column('link', sa.String(length=300), nullable=True),
    sa.Column('read', sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column('email_sent', sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_notifications_user'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)
    op.create_table('feature_pack_tickets',
    sa.Column('pack_id', sa.Integer(), nullable=False),
    sa.Column('ticket_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['pack_id'], ['feature_packs.id'], name='fk_pack_tickets_pack'),
    sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], name='fk_pack_tickets_ticket'),
    sa.PrimaryKeyConstraint('pack_id', 'ticket_id')
    )
    op.add_column('feature_packs', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('feature_packs', sa.Column('currency', sa.String(length=3), nullable=False, server_default='USD'))
    op.add_column('feature_packs', sa.Column('decided_by', sa.Integer(), nullable=True))
    op.add_column('feature_packs', sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('feature_packs', sa.Column('rejection_reason', sa.Text(), nullable=True))
    op.add_column('feature_packs', sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('feature_packs', sa.Column('billed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('feature_packs', sa.Column('created_by', sa.Integer(), nullable=True))
    op.add_column('feature_packs', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True))
    op.create_foreign_key('fk_packs_created_by', 'feature_packs', 'users', ['created_by'], ['id'])
    op.create_foreign_key('fk_packs_approved_by', 'feature_packs', 'users', ['approved_by'], ['id'])
    op.create_foreign_key('fk_packs_decided_by', 'feature_packs', 'users', ['decided_by'], ['id'])
    op.add_column('maintenance_runs', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True))
    op.create_foreign_key('fk_maintenance_runs_user', 'maintenance_runs', 'users', ['completed_by'], ['id'])
    op.add_column('maintenance_tasks', sa.Column('estimated_hours', sa.Numeric(precision=6, scale=2), nullable=True))
    op.add_column('maintenance_tasks', sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('maintenance_tasks', sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('maintenance_tasks', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True))
    op.alter_column('maintenance_tasks', 'name',
               existing_type=sa.VARCHAR(length=160),
               nullable=False)
    maintenancerecurrence = sa.Enum(
        'SEMANAL', 'MENSUAL', 'TRIMESTRAL', name='maintenancerecurrence'
    )
    maintenancerecurrence.create(op.get_bind(), checkfirst=True)
    op.alter_column('maintenance_tasks', 'recurrence',
               existing_type=sa.VARCHAR(length=40),
               type_=maintenancerecurrence,
               existing_nullable=True,
               postgresql_using='UPPER(recurrence)::maintenancerecurrence')


def downgrade() -> None:
    op.alter_column('maintenance_tasks', 'recurrence',
               existing_type=sa.Enum('SEMANAL', 'MENSUAL', 'TRIMESTRAL', name='maintenancerecurrence'),
               type_=sa.VARCHAR(length=40),
               existing_nullable=True,
               postgresql_using='LOWER(recurrence::text)')
    op.alter_column('maintenance_tasks', 'name',
               existing_type=sa.VARCHAR(length=160),
               nullable=True)
    op.drop_column('maintenance_tasks', 'created_at')
    op.drop_column('maintenance_tasks', 'last_run_at')
    op.drop_column('maintenance_tasks', 'active')
    op.drop_column('maintenance_tasks', 'estimated_hours')
    op.drop_constraint('fk_maintenance_runs_user', 'maintenance_runs', type_='foreignkey')
    op.drop_column('maintenance_runs', 'created_at')
    op.drop_constraint('fk_packs_decided_by', 'feature_packs', type_='foreignkey')
    op.drop_constraint('fk_packs_approved_by', 'feature_packs', type_='foreignkey')
    op.drop_constraint('fk_packs_created_by', 'feature_packs', type_='foreignkey')
    op.drop_column('feature_packs', 'created_at')
    op.drop_column('feature_packs', 'created_by')
    op.drop_column('feature_packs', 'billed_at')
    op.drop_column('feature_packs', 'delivered_at')
    op.drop_column('feature_packs', 'rejection_reason')
    op.drop_column('feature_packs', 'decided_at')
    op.drop_column('feature_packs', 'decided_by')
    op.drop_column('feature_packs', 'currency')
    op.drop_column('feature_packs', 'description')
    op.drop_table('feature_pack_tickets')
    op.drop_index(op.f('ix_notifications_user_id'), table_name='notifications')
    op.drop_table('notifications')
    sa.Enum(name='notificationtype').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='maintenancerecurrence').drop(op.get_bind(), checkfirst=True)
