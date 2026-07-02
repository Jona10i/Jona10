// Domain model — mirrors the FastAPI/TimescaleDB schema described in ARCHITECTURE.md,
// but lives client-side so the demo can run standalone with a deterministic simulator.

export type CheckType = 'ping' | 'http' | 'snmp' | 'port' | 'mqtt';
export type Status = 'up' | 'degraded' | 'down' | 'unknown';
export type Severity = 'info' | 'warn' | 'critical';
export type DeviceKind =
  | 'router'
  | 'switch'
  | 'load-balancer'
  | 'api'
  | 'database'
  | 'cache'
  | 'iot-gateway'
  | 'sensor'
  | 'worker';

export type IntervalSec = 10 | 30 | 60 | 300 | 900 | 3600;

export interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  host: string;
  tags: string[];
  location?: string;
  notes?: string;
  createdAt: number;
}

export interface Check {
  id: string;
  deviceId: string;
  type: CheckType;
  target: string;           // e.g. "10.0.0.1", "https://api/health", "1.3.6.1.2.1.1.3.0"
  interval: IntervalSec;
  warnMs: number;
  critMs: number;
  timeoutMs: number;
  enabled: boolean;

  // Live-derived state (updated by the engine each tick)
  status: Status;
  latencyMs: number | null;
  lastCheckedAt: number | null;
  nextDueAt: number;
  consecutiveFailures: number;
  totalChecks: number;
  failedChecks: number;
  uptimePct: number;        // rolling window
}

export interface MetricPoint {
  t: number;                // epoch ms
  latencyMs: number | null; // null = timeout / down
  status: Status;
}

export interface EventLog {
  id: string;
  t: number;
  source: 'engine' | 'check' | 'alert' | 'user';
  severity: Severity;
  deviceId?: string;
  checkId?: string;
  message: string;
}

export type AlertChannel = 'email' | 'slack' | 'webhook';

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  // matcher
  deviceId?: string;              // undefined = any
  checkType?: CheckType;          // undefined = any
  // trigger
  metric: 'latency' | 'status';
  op: '>' | '<' | '=='; 
  threshold: number | Status;     // ms for latency, Status for status
  forSec: number;                 // sustained duration
  severity: Severity;
  channels: AlertChannel[];
}

export type AlertState = 'firing' | 'acknowledged' | 'resolved';

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  deviceId: string;
  checkId: string;
  severity: Severity;
  state: AlertState;
  openedAt: number;
  ackedAt?: number;
  resolvedAt?: number;
  message: string;
  channels: AlertChannel[];
}

// Fault injection modes used by the simulator to make demos reproducible.
export type FaultMode = 'none' | 'down' | 'slow';
