"""
SQLAlchemy models for NetPulse.
Designed for TimescaleDB with proper time-series and relational schema.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker

Base = declarative_base()


class Device(Base):
    __tablename__ = "devices"

    id = Column(String(16), primary_key=True)
    name = Column(String(255), nullable=False)
    kind = Column(String(50), nullable=False)  # server, router, database, etc.
    host = Column(String(255), nullable=False)
    location = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    tags = Column(String(1000), nullable=True)  # JSON or comma-separated
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    checks = relationship("Check", back_populates="device", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="device", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="device", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "host": self.host,
            "location": self.location,
            "notes": self.notes,
            "tags": self.tags.split(",") if self.tags else [],
            "createdAt": int(self.created_at.timestamp() * 1000),
        }


class Check(Base):
    __tablename__ = "checks"

    id = Column(String(16), primary_key=True)
    device_id = Column(String(16), ForeignKey("devices.id"), nullable=False)
    type = Column(String(50), nullable=False)  # http, tcp, icmp, snmp, mqtt, etc.
    target = Column(String(512), nullable=False)  # URL, IP, host:port, etc.
    interval = Column(Integer, default=30, nullable=False)  # seconds
    warn_ms = Column(Integer, default=200, nullable=False)
    crit_ms = Column(Integer, default=600, nullable=False)
    timeout_ms = Column(Integer, default=5000, nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    status = Column(String(20), default="unknown", nullable=False)  # up, degraded, down, unknown
    latency_ms = Column(Float, nullable=True)
    last_checked_at = Column(DateTime(timezone=True), nullable=True)
    next_due_at = Column(DateTime(timezone=True), nullable=True)
    consecutive_failures = Column(Integer, default=0, nullable=False)
    total_checks = Column(Integer, default=0, nullable=False)
    failed_checks = Column(Integer, default=0, nullable=False)
    uptime_pct = Column(Float, default=100.0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    device = relationship("Device", back_populates="checks")
    metrics = relationship("Metric", back_populates="check", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="check", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "deviceId": self.device_id,
            "type": self.type,
            "target": self.target,
            "interval": self.interval,
            "warnMs": self.warn_ms,
            "critMs": self.crit_ms,
            "timeoutMs": self.timeout_ms,
            "enabled": self.enabled,
            "status": self.status,
            "latencyMs": self.latency_ms,
            "lastCheckedAt": int(self.last_checked_at.timestamp() * 1000) if self.last_checked_at else None,
            "nextDueAt": int(self.next_due_at.timestamp() * 1000) if self.next_due_at else None,
            "consecutiveFailures": self.consecutive_failures,
            "totalChecks": self.total_checks,
            "failedChecks": self.failed_checks,
            "uptimePct": self.uptime_pct,
        }


class Metric(Base):
    __tablename__ = "metrics"
    __table_args__ = {"timescaledb_hypertable": {"time_column_name": "t"}}

    id = Column(Integer, primary_key=True, autoincrement=True)
    check_id = Column(String(16), ForeignKey("checks.id"), nullable=False)
    t = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    latency_ms = Column(Float, nullable=True)
    status = Column(String(20), default="unknown", nullable=False)

    # Relationships
    check = relationship("Check", back_populates="metrics")

    def to_dict(self):
        return {
            "t": int(self.t.timestamp() * 1000),
            "latencyMs": self.latency_ms,
            "status": self.status,
        }


class Event(Base):
    __tablename__ = "events"

    id = Column(String(16), primary_key=True)
    device_id = Column(String(16), ForeignKey("devices.id"), nullable=True)
    check_id = Column(String(16), ForeignKey("checks.id"), nullable=True)
    t = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    source = Column(String(50), default="api", nullable=False)  # api, engine, check, alert, user
    severity = Column(String(20), default="info", nullable=False)  # info, warn, critical
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    device = relationship("Device", back_populates="events")

    def to_dict(self):
        return {
            "id": self.id,
            "t": int(self.t.timestamp() * 1000),
            "source": self.source,
            "severity": self.severity,
            "deviceId": self.device_id,
            "checkId": self.check_id,
            "message": self.message,
        }


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String(16), primary_key=True)
    rule_id = Column(String(16), nullable=True)
    rule_name = Column(String(255), nullable=True)
    device_id = Column(String(16), ForeignKey("devices.id"), nullable=True)
    check_id = Column(String(16), ForeignKey("checks.id"), nullable=True)
    severity = Column(String(20), default="warn", nullable=False)  # info, warn, critical
    state = Column(String(20), default="firing", nullable=False)  # firing, acknowledged, resolved
    opened_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    acked_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    message = Column(Text, nullable=False)
    channels = Column(String(1000), nullable=True)  # JSON or comma-separated: slack, email, webhook
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    device = relationship("Device", back_populates="alerts")
    check = relationship("Check", back_populates="alerts")

    def to_dict(self):
        return {
            "id": self.id,
            "ruleId": self.rule_id,
            "ruleName": self.rule_name,
            "deviceId": self.device_id,
            "checkId": self.check_id,
            "severity": self.severity,
            "state": self.state,
            "openedAt": int(self.opened_at.timestamp() * 1000),
            "ackedAt": int(self.acked_at.timestamp() * 1000) if self.acked_at else None,
            "resolvedAt": int(self.resolved_at.timestamp() * 1000) if self.resolved_at else None,
            "message": self.message,
            "channels": self.channels.split(",") if self.channels else [],
        }


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id = Column(String(16), primary_key=True)
    name = Column(String(255), nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    device_id = Column(String(16), nullable=True)
    check_type = Column(String(50), nullable=True)
    metric = Column(String(50), nullable=False)  # status, latency, uptime, etc.
    op = Column(String(10), nullable=False)  # ==, !=, >, <, >=, <=
    threshold = Column(String(255), nullable=False)  # JSON: "down", 600, etc.
    for_sec = Column(Integer, default=30, nullable=False)
    severity = Column(String(20), default="warn", nullable=False)
    channels = Column(String(1000), nullable=True)  # slack, email, webhook
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "enabled": self.enabled,
            "deviceId": self.device_id,
            "checkType": self.check_type,
            "metric": self.metric,
            "op": self.op,
            "threshold": self.threshold,
            "forSec": self.for_sec,
            "severity": self.severity,
            "channels": self.channels.split(",") if self.channels else [],
        }


def init_db(database_url: str):
    """Initialize database engine and create tables."""
    from sqlalchemy import create_engine
    engine = create_engine(database_url, echo=False, pool_pre_ping=True)
    try:
        Base.metadata.create_all(engine)
    except Exception as e:
        print(f"Error creating tables: {e}")
    return engine


def get_session(engine):
    """Create a session factory."""
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=engine)
    return Session()
