import type { Alert, AlertRule, Check, Device, EventLog, MetricPoint } from './types'

function uid(prefix: string, n: number) {
  return `${prefix}${n}`
}

const now = Date.now()

// ── Devices ──────────────────────────────────────────────────────────────────
export const SEED_DEVICES: Device[] = [
  { id: 'd1', name: 'Edge Router 01', kind: 'router', host: '10.0.0.1', tags: ['prod', 'critical', 'network'], location: 'DC1 / Rack A1', createdAt: now - 9e6 },
  { id: 'd2', name: 'Core Switch 01', kind: 'switch', host: '10.0.0.2', tags: ['prod', 'network'], location: 'DC1 / Rack A2', createdAt: now - 9e6 },
  { id: 'd3', name: 'Auth API', kind: 'api', host: 'auth.internal', tags: ['prod', 'critical', 'api'], location: 'DC1', createdAt: now - 8e6 },
  { id: 'd4', name: 'Payments API', kind: 'api', host: 'payments.internal', tags: ['prod', 'critical', 'api', 'pci'], location: 'DC1', createdAt: now - 8e6 },
  { id: 'd5', name: 'Primary DB', kind: 'database', host: '10.0.1.10', tags: ['prod', 'critical', 'db'], location: 'DC1 / Rack B1', createdAt: now - 7e6 },
  { id: 'd6', name: 'Redis Cache', kind: 'cache', host: '10.0.1.20', tags: ['prod', 'cache'], location: 'DC1 / Rack B2', createdAt: now - 7e6 },
  { id: 'd7', name: 'Load Balancer', kind: 'load-balancer', host: '10.0.0.10', tags: ['prod', 'critical', 'network'], location: 'DC1', createdAt: now - 8e6 },
  { id: 'd8', name: 'IoT Gateway', kind: 'iot-gateway', host: 'iotgw.internal', tags: ['prod', 'iot'], location: 'DC2', createdAt: now - 5e6 },
  { id: 'd9', name: 'Worker Node 01', kind: 'worker', host: '10.0.2.1', tags: ['prod', 'worker'], location: 'DC1 / Rack C1', createdAt: now - 6e6 },
  { id: 'd10', name: 'Temp Sensor A3', kind: 'sensor', host: '192.168.50.3', tags: ['staging', 'iot'], location: 'DC2 / Floor Sensor', createdAt: now - 3e6 },
]

// ── Checks ────────────────────────────────────────────────────────────────────
export const SEED_CHECKS: Check[] = [
  // d1 Edge Router
  { id: 'c1', deviceId: 'd1', type: 'ping', target: '10.0.0.1', interval: 10, warnMs: 20, critMs: 100, timeoutMs: 2000, enabled: true, status: 'up', latencyMs: 4, lastCheckedAt: now - 8000, nextDueAt: now + 2000, consecutiveFailures: 0, totalChecks: 820, failedChecks: 3, uptimePct: 99.6 },
  { id: 'c2', deviceId: 'd1', type: 'snmp', target: '10.0.0.1 1.3.6.1.2.1.1.3.0', interval: 60, warnMs: 50, critMs: 200, timeoutMs: 5000, enabled: true, status: 'up', latencyMs: 12, lastCheckedAt: now - 40000, nextDueAt: now + 20000, consecutiveFailures: 0, totalChecks: 140, failedChecks: 0, uptimePct: 100 },
  // d2 Core Switch
  { id: 'c3', deviceId: 'd2', type: 'ping', target: '10.0.0.2', interval: 10, warnMs: 10, critMs: 50, timeoutMs: 2000, enabled: true, status: 'up', latencyMs: 1, lastCheckedAt: now - 9000, nextDueAt: now + 1000, consecutiveFailures: 0, totalChecks: 810, failedChecks: 1, uptimePct: 99.9 },
  // d3 Auth API
  { id: 'c4', deviceId: 'd3', type: 'http', target: 'https://auth.internal/health', interval: 30, warnMs: 200, critMs: 600, timeoutMs: 5000, enabled: true, status: 'up', latencyMs: 45, lastCheckedAt: now - 15000, nextDueAt: now + 15000, consecutiveFailures: 0, totalChecks: 280, failedChecks: 4, uptimePct: 98.6 },
  { id: 'c5', deviceId: 'd3', type: 'port', target: 'auth.internal:443', interval: 60, warnMs: 100, critMs: 300, timeoutMs: 3000, enabled: true, status: 'up', latencyMs: 20, lastCheckedAt: now - 30000, nextDueAt: now + 30000, consecutiveFailures: 0, totalChecks: 140, failedChecks: 2, uptimePct: 98.6 },
  // d4 Payments API
  { id: 'c6', deviceId: 'd4', type: 'http', target: 'https://payments.internal/ping', interval: 10, warnMs: 150, critMs: 400, timeoutMs: 5000, enabled: true, status: 'degraded', latencyMs: 210, lastCheckedAt: now - 5000, nextDueAt: now + 5000, consecutiveFailures: 2, totalChecks: 860, failedChecks: 18, uptimePct: 97.9 },
  { id: 'c7', deviceId: 'd4', type: 'port', target: 'payments.internal:443', interval: 30, warnMs: 80, critMs: 250, timeoutMs: 3000, enabled: true, status: 'up', latencyMs: 22, lastCheckedAt: now - 10000, nextDueAt: now + 20000, consecutiveFailures: 0, totalChecks: 290, failedChecks: 5, uptimePct: 98.3 },
  // d5 Primary DB
  { id: 'c8', deviceId: 'd5', type: 'port', target: '10.0.1.10:5432', interval: 30, warnMs: 30, critMs: 100, timeoutMs: 3000, enabled: true, status: 'up', latencyMs: 8, lastCheckedAt: now - 12000, nextDueAt: now + 18000, consecutiveFailures: 0, totalChecks: 275, failedChecks: 0, uptimePct: 100 },
  { id: 'c9', deviceId: 'd5', type: 'ping', target: '10.0.1.10', interval: 10, warnMs: 10, critMs: 40, timeoutMs: 2000, enabled: true, status: 'up', latencyMs: 3, lastCheckedAt: now - 4000, nextDueAt: now + 6000, consecutiveFailures: 0, totalChecks: 800, failedChecks: 0, uptimePct: 100 },
  // d6 Redis Cache
  { id: 'c10', deviceId: 'd6', type: 'port', target: '10.0.1.20:6379', interval: 30, warnMs: 15, critMs: 60, timeoutMs: 2000, enabled: true, status: 'up', latencyMs: 5, lastCheckedAt: now - 8000, nextDueAt: now + 22000, consecutiveFailures: 0, totalChecks: 270, failedChecks: 2, uptimePct: 99.3 },
  // d7 Load Balancer
  { id: 'c11', deviceId: 'd7', type: 'http', target: 'http://10.0.0.10/healthz', interval: 10, warnMs: 100, critMs: 300, timeoutMs: 4000, enabled: true, status: 'up', latencyMs: 18, lastCheckedAt: now - 7000, nextDueAt: now + 3000, consecutiveFailures: 0, totalChecks: 840, failedChecks: 6, uptimePct: 99.3 },
  { id: 'c12', deviceId: 'd7', type: 'ping', target: '10.0.0.10', interval: 10, warnMs: 5, critMs: 30, timeoutMs: 2000, enabled: true, status: 'up', latencyMs: 2, lastCheckedAt: now - 9000, nextDueAt: now + 1000, consecutiveFailures: 0, totalChecks: 830, failedChecks: 1, uptimePct: 99.9 },
  // d8 IoT Gateway
  { id: 'c13', deviceId: 'd8', type: 'mqtt', target: 'iotgw.internal:1883', interval: 60, warnMs: 200, critMs: 800, timeoutMs: 8000, enabled: true, status: 'up', latencyMs: 55, lastCheckedAt: now - 45000, nextDueAt: now + 15000, consecutiveFailures: 0, totalChecks: 85, failedChecks: 3, uptimePct: 96.5 },
  // d9 Worker
  { id: 'c14', deviceId: 'd9', type: 'http', target: 'http://10.0.2.1:8080/status', interval: 30, warnMs: 300, critMs: 900, timeoutMs: 5000, enabled: true, status: 'down', latencyMs: null, lastCheckedAt: now - 20000, nextDueAt: now + 10000, consecutiveFailures: 5, totalChecks: 260, failedChecks: 12, uptimePct: 95.4 },
  // d10 Sensor
  { id: 'c15', deviceId: 'd10', type: 'ping', target: '192.168.50.3', interval: 300, warnMs: 50, critMs: 200, timeoutMs: 4000, enabled: false, status: 'unknown', latencyMs: null, lastCheckedAt: null, nextDueAt: 0, consecutiveFailures: 0, totalChecks: 0, failedChecks: 0, uptimePct: 100 },
]

// ── Metrics (last ~40 points per check) ───────────────────────────────────────
function syntheticMetrics(checkId: string, base: number, jitter: number, downChance: number): MetricPoint[] {
  const pts: MetricPoint[] = []
  for (let i = 40; i >= 0; i--) {
    const t = now - i * 15000
    const isDown = Math.random() < downChance
    const latencyMs = isDown ? null : Math.max(1, base + (Math.random() - 0.5) * jitter * 2)
    const status = isDown ? 'down' : latencyMs! > base * 2 ? 'degraded' : 'up'
    pts.push({ t, latencyMs, status })
  }
  return pts
}

export const SEED_METRICS: Record<string, MetricPoint[]> = {
  c1: syntheticMetrics('c1', 4, 3, 0.01),
  c2: syntheticMetrics('c2', 12, 5, 0.0),
  c3: syntheticMetrics('c3', 1, 0.5, 0.005),
  c4: syntheticMetrics('c4', 45, 30, 0.03),
  c5: syntheticMetrics('c5', 20, 10, 0.01),
  c6: syntheticMetrics('c6', 210, 80, 0.04),
  c7: syntheticMetrics('c7', 22, 10, 0.01),
  c8: syntheticMetrics('c8', 8, 4, 0.0),
  c9: syntheticMetrics('c9', 3, 1, 0.0),
  c10: syntheticMetrics('c10', 5, 3, 0.01),
  c11: syntheticMetrics('c11', 18, 8, 0.01),
  c12: syntheticMetrics('c12', 2, 1, 0.005),
  c13: syntheticMetrics('c13', 55, 40, 0.04),
  c14: syntheticMetrics('c14', 300, 200, 0.15),
  c15: [],
}

// ── Events ────────────────────────────────────────────────────────────────────
export const SEED_EVENTS: EventLog[] = [
  { id: 'e1', t: now - 600000, source: 'check', severity: 'critical', deviceId: 'd9', checkId: 'c14', message: 'Worker Node 01 HTTP check timed out (consecutive failures: 5)' },
  { id: 'e2', t: now - 595000, source: 'alert', severity: 'critical', deviceId: 'd9', checkId: 'c14', message: 'Alert fired: Worker down — Worker Node 01' },
  { id: 'e3', t: now - 400000, source: 'check', severity: 'warn', deviceId: 'd4', checkId: 'c6', message: 'Payments API latency elevated: 210ms (warn threshold: 150ms)' },
  { id: 'e4', t: now - 380000, source: 'alert', severity: 'warn', deviceId: 'd4', checkId: 'c6', message: 'Alert fired: Payments latency high — Payments API' },
  { id: 'e5', t: now - 200000, source: 'check', severity: 'info', deviceId: 'd3', checkId: 'c4', message: 'Auth API recovered from elevated latency' },
  { id: 'e6', t: now - 120000, source: 'engine', severity: 'info', message: 'Monitoring engine started — 14 active checks across 10 devices' },
  { id: 'e7', t: now - 60000, source: 'check', severity: 'info', deviceId: 'd6', checkId: 'c10', message: 'Redis Cache port check passed (5ms)' },
  { id: 'e8', t: now - 30000, source: 'check', severity: 'warn', deviceId: 'd8', checkId: 'c13', message: 'IoT Gateway MQTT response slow: 55ms' },
]

// ── Alert rules ───────────────────────────────────────────────────────────────
export const SEED_ALERT_RULES: AlertRule[] = [
  { id: 'r1', name: 'Any check down', enabled: true, metric: 'status', op: '==', threshold: 'down', forSec: 30, severity: 'critical', channels: ['slack', 'email'] },
  { id: 'r2', name: 'Payments latency high', enabled: true, deviceId: 'd4', checkType: 'http', metric: 'latency', op: '>', threshold: 150, forSec: 60, severity: 'warn', channels: ['slack'] },
  { id: 'r3', name: 'Auth API latency critical', enabled: true, deviceId: 'd3', metric: 'latency', op: '>', threshold: 400, forSec: 30, severity: 'critical', channels: ['slack', 'email', 'webhook'] },
  { id: 'r4', name: 'DB port unreachable', enabled: true, deviceId: 'd5', checkType: 'port', metric: 'status', op: '==', threshold: 'down', forSec: 10, severity: 'critical', channels: ['email', 'webhook'] },
]

// ── Alerts ────────────────────────────────────────────────────────────────────
export const SEED_ALERTS: Alert[] = [
  {
    id: 'al1', ruleId: 'r1', ruleName: 'Any check down',
    deviceId: 'd9', checkId: 'c14', severity: 'critical', state: 'firing',
    openedAt: now - 600000, message: 'Worker Node 01 HTTP check is down (5 consecutive failures)',
    channels: ['slack', 'email'],
  },
  {
    id: 'al2', ruleId: 'r2', ruleName: 'Payments latency high',
    deviceId: 'd4', checkId: 'c6', severity: 'warn', state: 'acknowledged',
    openedAt: now - 400000, ackedAt: now - 300000,
    message: 'Payments API HTTP latency exceeded 150ms threshold (currently 210ms)',
    channels: ['slack'],
  },
  {
    id: 'al3', ruleId: 'r3', ruleName: 'Auth API latency critical',
    deviceId: 'd3', checkId: 'c4', severity: 'critical', state: 'resolved',
    openedAt: now - 7200000, resolvedAt: now - 3600000,
    message: 'Auth API latency exceeded 400ms for >30s',
    channels: ['slack', 'email', 'webhook'],
  },
]

// ── Seed function ─────────────────────────────────────────────────────────────
export function seed() {
  return {
    devices: SEED_DEVICES,
    checks: SEED_CHECKS,
    events: SEED_EVENTS,
    alerts: SEED_ALERTS,
    alertRules: SEED_ALERT_RULES,
    metrics: SEED_METRICS,
  }
}
