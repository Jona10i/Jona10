"""
NetPulse FastAPI backend with SQLAlchemy + TimescaleDB persistence.
Simplified version using proper FastAPI Depends pattern.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Generator, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from models import (
    Alert,
    AlertRule,
    Base,
    Check,
    Device,
    Event,
    Metric,
)

# Database setup
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "changeme")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql://postgres:{POSTGRES_PASSWORD}@timescaledb:5432/netpulse",
)

# Create engine
try:
    engine = create_engine(
        DATABASE_URL,
        echo=False,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 10},
    )
    # Initialize tables
    Base.metadata.create_all(engine)
    print("✅ Database initialized")
except Exception as e:
    print(f"⚠️  Database initialization warning: {e}")
    engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Get database session for dependency injection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


app = FastAPI(title="NetPulse API", version="0.2.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _gen_id(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4().hex[:8]}"


# ── Pydantic Models ───────────────────────────────────────────────────────────
class DeviceIn(BaseModel):
    name: str
    kind: str
    host: str
    tags: list[str] = []
    location: Optional[str] = None
    notes: Optional[str] = None


class CheckIn(BaseModel):
    deviceId: str
    type: str
    target: str
    interval: int = 30
    warnMs: int = 200
    critMs: int = 600
    timeoutMs: int = 5000
    enabled: bool = True


class MetricIn(BaseModel):
    t: Optional[int] = None
    latencyMs: Optional[float] = None
    status: str = "unknown"


class EventIn(BaseModel):
    severity: str = "info"
    source: str = "api"
    deviceId: Optional[str] = None
    checkId: Optional[str] = None
    message: str


class AlertIn(BaseModel):
    ruleId: Optional[str] = None
    ruleName: Optional[str] = None
    deviceId: Optional[str] = None
    checkId: Optional[str] = None
    severity: str = "warn"
    state: str = "firing"
    message: str
    channels: list[str] = []


class RuleIn(BaseModel):
    name: str
    enabled: bool = True
    deviceId: Optional[str] = None
    checkType: Optional[str] = None
    metric: str
    op: str
    threshold: Any
    forSec: int = 30
    severity: str
    channels: list[str] = ["slack"]


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    """System health check."""
    return {"status": "ok", "timestamp": _now_ms()}


# ── System Stats ──────────────────────────────────────────────────────────────
@app.get("/stats")
async def system_stats(db: Session = Depends(get_db)):
    """Overall system statistics."""
    devices = db.query(Device).all()
    checks = db.query(Check).all()
    alerts = db.query(Alert).all()

    # Aggregate status
    status_counts = {"up": 0, "degraded": 0, "down": 0, "unknown": 0}
    for check in checks:
        status_counts[check.status] += 1

    active_alerts = [a for a in alerts if a.state != "resolved"]

    # Avg uptime
    uptimes = [c.uptime_pct for c in checks if c.uptime_pct]
    avg_uptime = sum(uptimes) / len(uptimes) if uptimes else 100.0

    # Avg latency
    latencies = [c.latency_ms for c in checks if c.latency_ms is not None]
    avg_latency = sum(latencies) / len(latencies) if latencies else 0.0

    return {
        "devices": len(devices),
        "checks": len(checks),
        "status_counts": status_counts,
        "active_alerts": len(active_alerts),
        "total_alerts": len(alerts),
        "avg_uptime_pct": avg_uptime,
        "avg_latency_ms": avg_latency,
    }


# ── Devices ───────────────────────────────────────────────────────────────────
@app.get("/devices")
async def list_devices(
    tag: Optional[str] = None,
    kind: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List all devices, optionally filtered."""
    query = db.query(Device)

    if tag:
        query = query.filter(Device.tags.contains(tag))
    if kind:
        query = query.filter(Device.kind == kind)

    devices = query.all()
    return {"devices": [d.to_dict() for d in devices]}


@app.get("/devices/{device_id}")
async def get_device(device_id: str, db: Session = Depends(get_db)):
    """Get device with attached checks."""
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(404, "Device not found")

    device_dict = device.to_dict()
    device_dict["checks_count"] = len(device.checks)
    device_dict["checks"] = [c.to_dict() for c in device.checks]
    return {"device": device_dict}


@app.post("/devices", status_code=201)
async def create_device(body: DeviceIn, db: Session = Depends(get_db)):
    """Create a new device."""
    device_id = _gen_id("d")
    device = Device(
        id=device_id,
        name=body.name,
        kind=body.kind,
        host=body.host,
        tags=",".join(body.tags) if body.tags else None,
        location=body.location,
        notes=body.notes,
    )
    db.add(device)
    db.commit()

    # Log event
    event = Event(
        id=_gen_id("e"),
        device_id=device_id,
        source="api",
        severity="info",
        message=f"Device created: {body.name}",
    )
    db.add(event)
    db.commit()

    return {"device": device.to_dict()}


@app.patch("/devices/{device_id}")
async def update_device(device_id: str, body: dict[str, Any], db: Session = Depends(get_db)):
    """Update a device."""
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(404, "Device not found")

    for key, value in body.items():
        if key == "tags" and isinstance(value, list):
            device.tags = ",".join(value)
        elif hasattr(device, key):
            setattr(device, key, value)

    db.commit()
    return {"device": device.to_dict()}


@app.delete("/devices/{device_id}", status_code=204)
async def delete_device(device_id: str, db: Session = Depends(get_db)):
    """Delete a device (cascade deletes checks/metrics)."""
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(404, "Device not found")
    db.delete(device)
    db.commit()


# ── Checks ────────────────────────────────────────────────────────────────────
@app.get("/checks")
async def list_checks(
    device_id: Optional[str] = None,
    enabled: Optional[bool] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List checks with optional filtering."""
    query = db.query(Check)

    if device_id:
        query = query.filter(Check.device_id == device_id)
    if enabled is not None:
        query = query.filter(Check.enabled == enabled)
    if status:
        query = query.filter(Check.status == status)

    checks = query.all()
    return {"checks": [c.to_dict() for c in checks]}


@app.get("/checks/{check_id}")
async def get_check(check_id: str, db: Session = Depends(get_db)):
    """Get check with recent metrics."""
    check = db.query(Check).filter(Check.id == check_id).first()
    if not check:
        raise HTTPException(404, "Check not found")

    check_dict = check.to_dict()
    recent_metrics = db.query(Metric).filter(Metric.check_id == check_id).order_by(Metric.t.desc()).limit(20).all()
    check_dict["recent_metrics"] = [m.to_dict() for m in reversed(recent_metrics)]
    return {"check": check_dict}


@app.post("/checks", status_code=201)
async def create_check(body: CheckIn, db: Session = Depends(get_db)):
    """Create a new check."""
    # Verify device exists
    device = db.query(Device).filter(Device.id == body.deviceId).first()
    if not device:
        raise HTTPException(400, "Device not found")

    check_id = _gen_id("c")
    check = Check(
        id=check_id,
        device_id=body.deviceId,
        type=body.type,
        target=body.target,
        interval=body.interval,
        warn_ms=body.warnMs,
        crit_ms=body.critMs,
        timeout_ms=body.timeoutMs,
        enabled=body.enabled,
        status="unknown",
        uptime_pct=100.0,
    )
    db.add(check)
    db.commit()

    # Log event
    event = Event(
        id=_gen_id("e"),
        device_id=body.deviceId,
        check_id=check_id,
        source="api",
        severity="info",
        message=f"Check created: {body.type} on {device.name}",
    )
    db.add(event)
    db.commit()

    return {"check": check.to_dict()}


@app.patch("/checks/{check_id}")
async def update_check(check_id: str, body: dict[str, Any], db: Session = Depends(get_db)):
    """Update a check."""
    check = db.query(Check).filter(Check.id == check_id).first()
    if not check:
        raise HTTPException(404, "Check not found")

    # Map camelCase keys to snake_case
    key_map = {
        "warnMs": "warn_ms",
        "critMs": "crit_ms",
        "timeoutMs": "timeout_ms",
        "lastCheckedAt": "last_checked_at",
        "nextDueAt": "next_due_at",
        "consecutiveFailures": "consecutive_failures",
        "totalChecks": "total_checks",
        "failedChecks": "failed_checks",
        "uptimePct": "uptime_pct",
    }

    for key, value in body.items():
        col_name = key_map.get(key, key)
        if hasattr(check, col_name):
            setattr(check, col_name, value)

    db.commit()
    return {"check": check.to_dict()}


@app.delete("/checks/{check_id}", status_code=204)
async def delete_check(check_id: str, db: Session = Depends(get_db)):
    """Delete a check (cascade deletes metrics)."""
    check = db.query(Check).filter(Check.id == check_id).first()
    if not check:
        raise HTTPException(404, "Check not found")
    db.delete(check)
    db.commit()


# ── Metrics ───────────────────────────────────────────────────────────────────
@app.get("/checks/{check_id}/metrics")
async def get_check_metrics(
    check_id: str,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Get historical metrics for a check."""
    check = db.query(Check).filter(Check.id == check_id).first()
    if not check:
        raise HTTPException(404, "Check not found")

    metrics = db.query(Metric).filter(Metric.check_id == check_id).order_by(Metric.t.desc()).limit(limit).all()
    return {"metrics": [m.to_dict() for m in reversed(metrics)]}


@app.post("/checks/{check_id}/metrics")
async def record_check_metric(check_id: str, body: MetricIn, db: Session = Depends(get_db)):
    """Record a new metric sample."""
    check = db.query(Check).filter(Check.id == check_id).first()
    if not check:
        raise HTTPException(404, "Check not found")

    metric = Metric(
        check_id=check_id,
        latency_ms=body.latencyMs,
        status=body.status,
    )
    db.add(metric)
    db.commit()

    return {"metric": metric.to_dict()}


# ── Events ────────────────────────────────────────────────────────────────────
@app.get("/events")
async def list_events(
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    severity: Optional[str] = None,
    source: Optional[str] = None,
    device_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List events with filtering and pagination."""
    query = db.query(Event)

    if severity:
        query = query.filter(Event.severity == severity)
    if source:
        query = query.filter(Event.source == source)
    if device_id:
        query = query.filter(Event.device_id == device_id)

    total = query.count()
    events = query.order_by(Event.t.desc()).offset(offset).limit(limit).all()

    return {
        "events": [e.to_dict() for e in events],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@app.post("/events")
async def create_event(body: EventIn, db: Session = Depends(get_db)):
    """Create a new event."""
    event = Event(
        id=_gen_id("e"),
        device_id=body.deviceId,
        check_id=body.checkId,
        source=body.source,
        severity=body.severity,
        message=body.message,
    )
    db.add(event)
    db.commit()
    return {"event": event.to_dict()}


@app.delete("/events", status_code=204)
async def clear_events(db: Session = Depends(get_db)):
    """Clear all events."""
    db.query(Event).delete()
    db.commit()


# ── Alerts ────────────────────────────────────────────────────────────────────
@app.get("/alerts")
async def list_alerts(
    state: Optional[str] = None,
    severity: Optional[str] = None,
    device_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List alerts with filtering."""
    query = db.query(Alert)

    if state:
        query = query.filter(Alert.state == state)
    if severity:
        query = query.filter(Alert.severity == severity)
    if device_id:
        query = query.filter(Alert.device_id == device_id)

    alerts = query.all()
    return {"alerts": [a.to_dict() for a in alerts]}


@app.get("/alerts/{alert_id}")
async def get_alert(alert_id: str, db: Session = Depends(get_db)):
    """Get a single alert by ID."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(404, "Alert not found")
    return {"alert": alert.to_dict()}


@app.post("/alerts", status_code=201)
async def create_alert(body: AlertIn, db: Session = Depends(get_db)):
    """Create a new alert."""
    alert = Alert(
        id=_gen_id("al"),
        rule_id=body.ruleId,
        rule_name=body.ruleName,
        device_id=body.deviceId,
        check_id=body.checkId,
        severity=body.severity,
        state=body.state,
        message=body.message,
        channels=",".join(body.channels) if body.channels else None,
    )
    db.add(alert)
    db.commit()
    return {"alert": alert.to_dict()}


@app.patch("/alerts/{alert_id}/ack")
async def ack_alert(alert_id: str, db: Session = Depends(get_db)):
    """Acknowledge an alert."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(404, "Alert not found")

    alert.state = "acknowledged"
    alert.acked_at = datetime.now(timezone.utc)
    db.commit()

    # Log event
    event = Event(
        id=_gen_id("e"),
        source="api",
        severity="info",
        message=f"Alert acknowledged: {alert.rule_name}",
    )
    db.add(event)
    db.commit()

    return {"alert": alert.to_dict()}


@app.patch("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, db: Session = Depends(get_db)):
    """Resolve an alert."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(404, "Alert not found")

    alert.state = "resolved"
    alert.resolved_at = datetime.now(timezone.utc)
    db.commit()

    # Log event
    event = Event(
        id=_gen_id("e"),
        source="api",
        severity="info",
        message=f"Alert resolved: {alert.rule_name}",
    )
    db.add(event)
    db.commit()

    return {"alert": alert.to_dict()}


@app.delete("/alerts")
async def clear_resolved_alerts(db: Session = Depends(get_db)):
    """Clear all resolved alerts."""
    result = db.query(Alert).filter(Alert.state == "resolved").delete()
    db.commit()
    return {"cleared": result}


# ── Alert Rules ───────────────────────────────────────────────────────────────
@app.get("/alert-rules")
async def list_rules(enabled: Optional[bool] = None, db: Session = Depends(get_db)):
    """List alert rules."""
    query = db.query(AlertRule)
    if enabled is not None:
        query = query.filter(AlertRule.enabled == enabled)
    rules = query.all()
    return {"rules": [r.to_dict() for r in rules]}


@app.get("/alert-rules/{rule_id}")
async def get_rule(rule_id: str, db: Session = Depends(get_db)):
    """Get a single rule by ID."""
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    return {"rule": rule.to_dict()}


@app.post("/alert-rules", status_code=201)
async def create_rule(body: RuleIn, db: Session = Depends(get_db)):
    """Create a new alert rule."""
    rule = AlertRule(
        id=_gen_id("r"),
        name=body.name,
        enabled=body.enabled,
        device_id=body.deviceId,
        check_type=body.checkType,
        metric=body.metric,
        op=body.op,
        threshold=str(body.threshold),
        for_sec=body.forSec,
        severity=body.severity,
        channels=",".join(body.channels) if body.channels else None,
    )
    db.add(rule)
    db.commit()

    # Log event
    event = Event(
        id=_gen_id("e"),
        source="api",
        severity="info",
        message=f"Alert rule created: {body.name}",
    )
    db.add(event)
    db.commit()

    return {"rule": rule.to_dict()}


@app.patch("/alert-rules/{rule_id}")
async def patch_rule(rule_id: str, body: dict[str, Any], db: Session = Depends(get_db)):
    """Update an alert rule."""
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")

    for key, value in body.items():
        if key == "channels" and isinstance(value, list):
            rule.channels = ",".join(value)
        elif hasattr(rule, key):
            setattr(rule, key, value)

    db.commit()
    return {"rule": rule.to_dict()}


@app.post("/alert-rules/{rule_id}/toggle")
async def toggle_rule(rule_id: str, db: Session = Depends(get_db)):
    """Toggle a rule's enabled state."""
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    rule.enabled = not rule.enabled
    db.commit()
    return {"rule": rule.to_dict()}


@app.delete("/alert-rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: str, db: Session = Depends(get_db)):
    """Delete an alert rule."""
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()


# ── OpenAPI ───────────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    """API root — visit /docs for Swagger UI."""
    return {
        "title": "NetPulse API",
        "version": "0.2.0",
        "storage": "TimescaleDB",
        "docs": "/docs",
        "openapi": "/openapi.json",
    }
