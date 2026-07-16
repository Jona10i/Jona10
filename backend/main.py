"""
NetPulse FastAPI backend
Endpoints mirror the contract defined in src/lib/api.ts
Expanded with full CRUD, stats, and filtering endpoints.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="NetPulse API", version="0.1.0")

# Allow requests from the Vite dev server and the served frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory store (replace with TimescaleDB via SQLAlchemy in production) ───
_devices: dict[str, dict] = {}
_checks: dict[str, dict] = {}
_events: list[dict] = []
_alerts: dict[str, dict] = {}
_rules: dict[str, dict] = {}
_metrics: dict[str, list[dict]] = {}  # check_id -> list of {t, latencyMs, status}


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    """System health check."""
    return {"status": "ok", "timestamp": _now_ms()}


# ── System Stats ──────────────────────────────────────────────────────────────
@app.get("/stats")
async def system_stats():
    """Overall system statistics."""
    checks = list(_checks.values())
    devices = list(_devices.values())
    alerts = list(_alerts.values())
    
    # Aggregate status
    status_counts = {"up": 0, "degraded": 0, "down": 0, "unknown": 0}
    for check in checks:
        status_counts[check.get("status", "unknown")] += 1
    
    active_alerts = [a for a in alerts if a.get("state") != "resolved"]
    
    # Avg uptime
    uptimes = [c.get("uptimePct", 100) for c in checks if c.get("uptimePct")]
    avg_uptime = sum(uptimes) / len(uptimes) if uptimes else 100.0
    
    # Avg latency
    latencies = [
        c.get("latencyMs") for c in checks 
        if c.get("latencyMs") is not None
    ]
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
class DeviceIn(BaseModel):
    name: str
    kind: str
    host: str
    tags: list[str] = []
    location: Optional[str] = None
    notes: Optional[str] = None


class DeviceOut(DeviceIn):
    id: str
    createdAt: int


@app.get("/devices")
async def list_devices(tag: Optional[str] = None, kind: Optional[str] = None):
    """List all devices, optionally filtered by tag or kind."""
    devices = list(_devices.values())
    
    if tag:
        devices = [d for d in devices if tag in d.get("tags", [])]
    if kind:
        devices = [d for d in devices if d.get("kind") == kind]
    
    return {"devices": devices}


@app.get("/devices/{device_id}")
async def get_device(device_id: str):
    """Get a single device by ID."""
    if device_id not in _devices:
        raise HTTPException(404, "Device not found")
    device = _devices[device_id]
    
    # Attach check stats
    device_checks = [c for c in _checks.values() if c.get("deviceId") == device_id]
    device["checks_count"] = len(device_checks)
    device["checks"] = device_checks
    
    return {"device": device}


@app.post("/devices", status_code=201)
async def create_device(body: DeviceIn):
    """Create a new device."""
    device = {
        "id": f"d{uuid.uuid4().hex[:8]}",
        "createdAt": _now_ms(),
        **body.model_dump(),
    }
    _devices[device["id"]] = device
    
    # Log event
    _events.append({
        "id": f"e{uuid.uuid4().hex[:8]}",
        "t": _now_ms(),
        "source": "api",
        "severity": "info",
        "deviceId": device["id"],
        "message": f"Device created: {device['name']}",
    })
    
    return {"device": device}


@app.patch("/devices/{device_id}")
async def update_device(device_id: str, body: dict[str, Any]):
    """Update a device."""
    if device_id not in _devices:
        raise HTTPException(404, "Device not found")
    _devices[device_id].update(body)
    return {"device": _devices[device_id]}


@app.delete("/devices/{device_id}", status_code=204)
async def delete_device(device_id: str):
    """Delete a device and its associated checks."""
    if device_id not in _devices:
        raise HTTPException(404, "Device not found")
    del _devices[device_id]
    # Remove associated checks and metrics
    to_remove = [cid for cid, c in _checks.items() if c["deviceId"] == device_id]
    for cid in to_remove:
        del _checks[cid]
        if cid in _metrics:
            del _metrics[cid]


# ── Checks ────────────────────────────────────────────────────────────────────
class CheckIn(BaseModel):
    deviceId: str
    type: str
    target: str
    interval: int = 30
    warnMs: int = 200
    critMs: int = 600
    timeoutMs: int = 5000
    enabled: bool = True


@app.get("/checks")
async def list_checks(
    device_id: Optional[str] = None,
    enabled: Optional[bool] = None,
    status: Optional[str] = None,
):
    """List checks with optional filtering."""
    checks = list(_checks.values())
    
    if device_id:
        checks = [c for c in checks if c["deviceId"] == device_id]
    if enabled is not None:
        checks = [c for c in checks if c.get("enabled") == enabled]
    if status:
        checks = [c for c in checks if c.get("status") == status]
    
    return {"checks": checks}


@app.get("/checks/{check_id}")
async def get_check(check_id: str):
    """Get a single check by ID with recent metrics."""
    if check_id not in _checks:
        raise HTTPException(404, "Check not found")
    
    check = _checks[check_id].copy()
    # Attach recent metrics
    check["recent_metrics"] = _metrics.get(check_id, [])[-20:]
    
    return {"check": check}


@app.post("/checks", status_code=201)
async def create_check(body: CheckIn):
    """Create a new check."""
    # Verify device exists
    if body.deviceId not in _devices:
        raise HTTPException(400, "Device not found")
    
    check = {
        "id": f"c{uuid.uuid4().hex[:8]}",
        "status": "unknown",
        "latencyMs": None,
        "lastCheckedAt": None,
        "nextDueAt": 0,
        "consecutiveFailures": 0,
        "totalChecks": 0,
        "failedChecks": 0,
        "uptimePct": 100.0,
        **body.model_dump(),
    }
    _checks[check["id"]] = check
    _metrics[check["id"]] = []
    
    # Log event
    _events.append({
        "id": f"e{uuid.uuid4().hex[:8]}",
        "t": _now_ms(),
        "source": "api",
        "severity": "info",
        "deviceId": body.deviceId,
        "checkId": check["id"],
        "message": f"Check created: {body.type} on {_devices[body.deviceId]['name']}",
    })
    
    return {"check": check}


@app.patch("/checks/{check_id}")
async def update_check(check_id: str, body: dict[str, Any]):
    """Update a check (e.g., interval, thresholds, enabled)."""
    if check_id not in _checks:
        raise HTTPException(404, "Check not found")
    _checks[check_id].update(body)
    return {"check": _checks[check_id]}


@app.delete("/checks/{check_id}", status_code=204)
async def delete_check(check_id: str):
    """Delete a check and its metrics."""
    if check_id not in _checks:
        raise HTTPException(404, "Check not found")
    del _checks[check_id]
    if check_id in _metrics:
        del _metrics[check_id]


# ── Metrics / Timeseries ──────────────────────────────────────────────────────
@app.get("/checks/{check_id}/metrics")
async def get_check_metrics(
    check_id: str,
    limit: int = Query(100, ge=1, le=1000),
):
    """Get historical metrics for a check."""
    if check_id not in _checks:
        raise HTTPException(404, "Check not found")
    
    metrics = _metrics.get(check_id, [])
    # Return last N samples
    return {"metrics": metrics[-limit:]}


@app.post("/checks/{check_id}/metrics")
async def record_check_metric(check_id: str, body: dict[str, Any]):
    """Record a new metric sample (called by the engine)."""
    if check_id not in _checks:
        raise HTTPException(404, "Check not found")
    
    metric = {
        "t": body.get("t", _now_ms()),
        "latencyMs": body.get("latencyMs"),
        "status": body.get("status", "unknown"),
    }
    
    if check_id not in _metrics:
        _metrics[check_id] = []
    
    _metrics[check_id].append(metric)
    
    # Keep only last 1000 samples per check in memory
    if len(_metrics[check_id]) > 1000:
        _metrics[check_id] = _metrics[check_id][-1000:]
    
    return {"metric": metric}


# ── Events ────────────────────────────────────────────────────────────────────
@app.get("/events")
async def list_events(
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    severity: Optional[str] = None,
    source: Optional[str] = None,
    device_id: Optional[str] = None,
):
    """List events with filtering and pagination."""
    events = _events.copy()
    
    # Filter
    if severity:
        events = [e for e in events if e.get("severity") == severity]
    if source:
        events = [e for e in events if e.get("source") == source]
    if device_id:
        events = [e for e in events if e.get("deviceId") == device_id]
    
    # Reverse to show newest first
    events = list(reversed(events))
    
    # Paginate
    total = len(events)
    events = events[offset : offset + limit]
    
    return {
        "events": events,
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@app.post("/events")
async def create_event(body: dict[str, Any]):
    """Create a new event (called by the engine or API)."""
    event = {
        "id": f"e{uuid.uuid4().hex[:8]}",
        "t": body.get("t", _now_ms()),
        "source": body.get("source", "api"),
        "severity": body.get("severity", "info"),
        "deviceId": body.get("deviceId"),
        "checkId": body.get("checkId"),
        "message": body.get("message", ""),
    }
    _events.append(event)
    return {"event": event}


@app.delete("/events", status_code=204)
async def clear_events():
    """Clear all events."""
    _events.clear()


# ── Alerts ────────────────────────────────────────────────────────────────────
@app.get("/alerts")
async def list_alerts(
    state: Optional[str] = None,
    severity: Optional[str] = None,
    device_id: Optional[str] = None,
):
    """List alerts with filtering."""
    alerts = list(_alerts.values())
    
    if state:
        alerts = [a for a in alerts if a.get("state") == state]
    if severity:
        alerts = [a for a in alerts if a.get("severity") == severity]
    if device_id:
        alerts = [a for a in alerts if a.get("deviceId") == device_id]
    
    return {"alerts": alerts}


@app.get("/alerts/{alert_id}")
async def get_alert(alert_id: str):
    """Get a single alert by ID."""
    if alert_id not in _alerts:
        raise HTTPException(404, "Alert not found")
    return {"alert": _alerts[alert_id]}


@app.post("/alerts", status_code=201)
async def create_alert(body: dict[str, Any]):
    """Create a new alert (called by the engine)."""
    alert = {
        "id": f"al{uuid.uuid4().hex[:8]}",
        "ruleId": body.get("ruleId"),
        "ruleName": body.get("ruleName"),
        "deviceId": body.get("deviceId"),
        "checkId": body.get("checkId"),
        "severity": body.get("severity", "warn"),
        "state": body.get("state", "firing"),
        "openedAt": body.get("openedAt", _now_ms()),
        "message": body.get("message"),
        "channels": body.get("channels", []),
    }
    _alerts[alert["id"]] = alert
    return {"alert": alert}


@app.patch("/alerts/{alert_id}/ack")
async def ack_alert(alert_id: str):
    """Acknowledge an alert."""
    if alert_id not in _alerts:
        raise HTTPException(404, "Alert not found")
    _alerts[alert_id]["state"] = "acknowledged"
    _alerts[alert_id]["ackedAt"] = _now_ms()
    
    # Log event
    _events.append({
        "id": f"e{uuid.uuid4().hex[:8]}",
        "t": _now_ms(),
        "source": "api",
        "severity": "info",
        "message": f"Alert acknowledged: {_alerts[alert_id]['ruleName']}",
    })
    
    return {"alert": _alerts[alert_id]}


@app.patch("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str):
    """Resolve an alert."""
    if alert_id not in _alerts:
        raise HTTPException(404, "Alert not found")
    _alerts[alert_id]["state"] = "resolved"
    _alerts[alert_id]["resolvedAt"] = _now_ms()
    
    # Log event
    _events.append({
        "id": f"e{uuid.uuid4().hex[:8]}",
        "t": _now_ms(),
        "source": "api",
        "severity": "info",
        "message": f"Alert resolved: {_alerts[alert_id]['ruleName']}",
    })
    
    return {"alert": _alerts[alert_id]}


@app.delete("/alerts")
async def clear_resolved_alerts():
    """Clear all resolved alerts."""
    to_remove = [aid for aid, a in _alerts.items() if a.get("state") == "resolved"]
    for aid in to_remove:
        del _alerts[aid]
    return {"cleared": len(to_remove)}


# ── Alert Rules ───────────────────────────────────────────────────────────────
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


@app.get("/alert-rules")
async def list_rules(enabled: Optional[bool] = None):
    """List alert rules, optionally filtered by enabled state."""
    rules = list(_rules.values())
    
    if enabled is not None:
        rules = [r for r in rules if r.get("enabled") == enabled]
    
    return {"rules": rules}


@app.get("/alert-rules/{rule_id}")
async def get_rule(rule_id: str):
    """Get a single rule by ID."""
    if rule_id not in _rules:
        raise HTTPException(404, "Rule not found")
    return {"rule": _rules[rule_id]}


@app.post("/alert-rules", status_code=201)
async def create_rule(body: RuleIn):
    """Create a new alert rule."""
    rule = {"id": f"r{uuid.uuid4().hex[:8]}", **body.model_dump()}
    _rules[rule["id"]] = rule
    
    # Log event
    _events.append({
        "id": f"e{uuid.uuid4().hex[:8]}",
        "t": _now_ms(),
        "source": "api",
        "severity": "info",
        "message": f"Alert rule created: {rule['name']}",
    })
    
    return {"rule": rule}


@app.patch("/alert-rules/{rule_id}")
async def patch_rule(rule_id: str, body: dict[str, Any]):
    """Update an alert rule."""
    if rule_id not in _rules:
        raise HTTPException(404, "Rule not found")
    _rules[rule_id].update(body)
    return {"rule": _rules[rule_id]}


@app.post("/alert-rules/{rule_id}/toggle")
async def toggle_rule(rule_id: str):
    """Toggle a rule's enabled state."""
    if rule_id not in _rules:
        raise HTTPException(404, "Rule not found")
    _rules[rule_id]["enabled"] = not _rules[rule_id].get("enabled", True)
    return {"rule": _rules[rule_id]}


@app.delete("/alert-rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: str):
    """Delete an alert rule."""
    if rule_id not in _rules:
        raise HTTPException(404, "Rule not found")
    del _rules[rule_id]


# ── OpenAPI docs ──────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    """API root — visit /docs for interactive Swagger UI."""
    return {
        "title": "NetPulse API",
        "version": "0.1.0",
        "docs": "/docs",
        "openapi": "/openapi.json",
    }
