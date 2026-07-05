"""
NetPulse FastAPI backend
Endpoints mirror the contract defined in src/lib/api.ts
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="NetPulse API", version="0.1.0")

# Allow requests from the Vite dev server and the served frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
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


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Devices ───────────────────────────────────────────────────────────────────
class DeviceIn(BaseModel):
    name: str
    kind: str
    host: str
    tags: list[str] = []
    location: Optional[str] = None
    notes: Optional[str] = None


@app.get("/devices")
async def list_devices():
    return {"devices": list(_devices.values())}


@app.post("/devices", status_code=201)
async def create_device(body: DeviceIn):
    device = {
        "id": f"d{uuid.uuid4().hex[:8]}",
        "createdAt": _now_ms(),
        **body.model_dump(),
    }
    _devices[device["id"]] = device
    return {"device": device}


@app.delete("/devices/{device_id}", status_code=204)
async def delete_device(device_id: str):
    if device_id not in _devices:
        raise HTTPException(404, "Device not found")
    del _devices[device_id]
    # Remove associated checks
    to_remove = [cid for cid, c in _checks.items() if c["deviceId"] == device_id]
    for cid in to_remove:
        del _checks[cid]


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
async def list_checks(device_id: Optional[str] = None):
    checks = list(_checks.values())
    if device_id:
        checks = [c for c in checks if c["deviceId"] == device_id]
    return {"checks": checks}


@app.post("/checks", status_code=201)
async def create_check(body: CheckIn):
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
    return {"check": check}


@app.patch("/checks/{check_id}")
async def update_check(check_id: str, body: dict[str, Any]):
    if check_id not in _checks:
        raise HTTPException(404, "Check not found")
    _checks[check_id].update(body)
    return {"check": _checks[check_id]}


@app.delete("/checks/{check_id}", status_code=204)
async def delete_check(check_id: str):
    if check_id not in _checks:
        raise HTTPException(404, "Check not found")
    del _checks[check_id]


# ── Events ────────────────────────────────────────────────────────────────────
@app.get("/events")
async def list_events(limit: int = 200):
    return {"events": _events[:limit]}


# ── Alerts ────────────────────────────────────────────────────────────────────
@app.get("/alerts")
async def list_alerts():
    return {"alerts": list(_alerts.values())}


@app.patch("/alerts/{alert_id}/ack")
async def ack_alert(alert_id: str):
    if alert_id not in _alerts:
        raise HTTPException(404, "Alert not found")
    _alerts[alert_id]["state"] = "acknowledged"
    _alerts[alert_id]["ackedAt"] = _now_ms()
    return {"alert": _alerts[alert_id]}


@app.patch("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str):
    if alert_id not in _alerts:
        raise HTTPException(404, "Alert not found")
    _alerts[alert_id]["state"] = "resolved"
    _alerts[alert_id]["resolvedAt"] = _now_ms()
    return {"alert": _alerts[alert_id]}


# ── Alert rules ───────────────────────────────────────────────────────────────
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
async def list_rules():
    return {"rules": list(_rules.values())}


@app.post("/alert-rules", status_code=201)
async def create_rule(body: RuleIn):
    rule = {"id": f"r{uuid.uuid4().hex[:8]}", **body.model_dump()}
    _rules[rule["id"]] = rule
    return {"rule": rule}


@app.delete("/alert-rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: str):
    if rule_id not in _rules:
        raise HTTPException(404, "Rule not found")
    del _rules[rule_id]


@app.patch("/alert-rules/{rule_id}")
async def patch_rule(rule_id: str, body: dict[str, Any]):
    if rule_id not in _rules:
        raise HTTPException(404, "Rule not found")
    _rules[rule_id].update(body)
    return {"rule": _rules[rule_id]}
