import { create } from 'zustand'
import type {
  Alert,
  AlertRule,
  Check,
  Device,
  EventLog,
  FaultMode,
  IntervalSec,
  MetricPoint,
  Severity,
  Status,
} from '../lib/types'
import { seed } from '../lib/seed'

// ── Max retained metric samples per check ────────────────────────────────────
const MAX_METRIC_PTS = 120

// ── Helpers ───────────────────────────────────────────────────────────────────
let _eid = 1000
let _aid = 1000
const eid = () => `e${_eid++}`
const aid = () => `al${_aid++}`

// ── Store type ────────────────────────────────────────────────────────────────
export type MonitorStore = {
  // Data
  devices: Device[]
  checks: Check[]
  events: EventLog[]
  alerts: Alert[]
  alertRules: AlertRule[]
  metrics: Record<string, MetricPoint[]>
  faults: Record<string, FaultMode>

  // Engine state
  running: boolean
  simSpeed: number

  // Engine controls
  setRunning: (r: boolean) => void
  setSimSpeed: (s: number) => void
  tick: () => void

  // Event actions
  clearEvents: () => void

  // Device actions
  addDevice: (d: Omit<Device, 'id' | 'createdAt'>) => void
  removeDevice: (id: string) => void

  // Check actions
  addCheck: (c: Omit<Check, 'id' | 'status' | 'latencyMs' | 'lastCheckedAt' | 'nextDueAt' | 'consecutiveFailures' | 'totalChecks' | 'failedChecks' | 'uptimePct'>) => void
  updateCheck: (id: string, patch: Partial<Pick<Check, 'interval' | 'warnMs' | 'critMs' | 'timeoutMs' | 'enabled' | 'target'>>) => void
  removeCheck: (id: string) => void
  toggleCheck: (id: string) => void

  // Alert rule actions
  get rules(): AlertRule[]
  addRule: (r: Omit<AlertRule, 'id'>) => void
  removeRule: (id: string) => void
  toggleRule: (id: string) => void

  // Alert actions
  ackAlert: (id: string) => void
  resolveAlert: (id: string) => void
  clearResolved: () => void

  // Fault injection
  injectFault: (deviceId: string, mode: FaultMode) => void
}

// ── ID counters ───────────────────────────────────────────────────────────────
let _devId = 100
let _checkId = 100
let _ruleId = 100

// ── Store ─────────────────────────────────────────────────────────────────────
const initial = seed()

export const useMonitor = create<MonitorStore>()((set, get) => ({
  devices: initial.devices,
  checks: initial.checks,
  events: initial.events,
  alerts: initial.alerts,
  alertRules: initial.alertRules,
  metrics: initial.metrics,
  faults: {},
  running: true,
  simSpeed: 1,

  // ── Engine controls ────────────────────────────────────────────────────────
  setRunning: (running) => set({ running }),
  setSimSpeed: (simSpeed) => set({ simSpeed }),

  // ── Events ────────────────────────────────────────────────────────────────
  clearEvents: () => set({ events: [] }),

  // ── Devices ───────────────────────────────────────────────────────────────
  addDevice: (d) => {
    const device: Device = { ...d, id: `d${++_devId}`, createdAt: Date.now() }
    set((s) => ({
      devices: [...s.devices, device],
      events: [
        {
          id: eid(), t: Date.now(), source: 'user', severity: 'info',
          deviceId: device.id, message: `Device added: ${device.name}`,
        },
        ...s.events,
      ],
    }))
  },

  removeDevice: (id) =>
    set((s) => ({
      devices: s.devices.filter((d) => d.id !== id),
      checks: s.checks.filter((c) => c.deviceId !== id),
    })),

  // ── Checks ────────────────────────────────────────────────────────────────
  addCheck: (c) => {
    const check: Check = {
      ...c,
      id: `c${++_checkId}`,
      status: 'unknown',
      latencyMs: null,
      lastCheckedAt: null,
      nextDueAt: 0,
      consecutiveFailures: 0,
      totalChecks: 0,
      failedChecks: 0,
      uptimePct: 100,
    }
    set((s) => ({ checks: [...s.checks, check] }))
  },

  updateCheck: (id, patch) =>
    set((s) => ({
      checks: s.checks.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  removeCheck: (id) =>
    set((s) => ({
      checks: s.checks.filter((c) => c.id !== id),
      metrics: Object.fromEntries(Object.entries(s.metrics).filter(([k]) => k !== id)),
    })),

  toggleCheck: (id) =>
    set((s) => ({
      checks: s.checks.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    })),

  // ── Alert rules ───────────────────────────────────────────────────────────
  // Getter alias used by AlertsPage: `s.rules`
  get rules() {
    return get().alertRules
  },

  addRule: (r) => {
    const rule: AlertRule = { ...r, id: `r${++_ruleId}` }
    set((s) => ({ alertRules: [...s.alertRules, rule] }))
  },

  removeRule: (id) =>
    set((s) => ({ alertRules: s.alertRules.filter((r) => r.id !== id) })),

  toggleRule: (id) =>
    set((s) => ({
      alertRules: s.alertRules.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r,
      ),
    })),

  // ── Alerts ────────────────────────────────────────────────────────────────
  ackAlert: (id) => {
    set((s) => ({
      alerts: s.alerts.map((a) =>
        a.id === id ? { ...a, state: 'acknowledged' as const, ackedAt: Date.now() } : a,
      ),
      events: [
        {
          id: eid(), t: Date.now(), source: 'user', severity: 'info',
          message: `Alert acknowledged: ${s.alerts.find((a) => a.id === id)?.ruleName ?? id}`,
        },
        ...s.events,
      ],
    }))
  },

  resolveAlert: (id) => {
    set((s) => ({
      alerts: s.alerts.map((a) =>
        a.id === id ? { ...a, state: 'resolved' as const, resolvedAt: Date.now() } : a,
      ),
      events: [
        {
          id: eid(), t: Date.now(), source: 'user', severity: 'info',
          message: `Alert resolved: ${s.alerts.find((a) => a.id === id)?.ruleName ?? id}`,
        },
        ...s.events,
      ],
    }))
  },

  clearResolved: () =>
    set((s) => ({ alerts: s.alerts.filter((a) => a.state !== 'resolved') })),

  // ── Fault injection ───────────────────────────────────────────────────────
  injectFault: (deviceId, mode) =>
    set((s) => ({
      faults: { ...s.faults, [deviceId]: mode },
      events: mode === 'none' ? s.events : [
        {
          id: eid(), t: Date.now(), source: 'user', severity: 'warn',
          deviceId,
          message: `Fault injected on ${s.devices.find((d) => d.id === deviceId)?.name ?? deviceId}: mode=${mode}`,
        },
        ...s.events,
      ],
    })),

  // ── Tick (simulation engine) ──────────────────────────────────────────────
  tick: () => {
    set((s) => {
      if (!s.running) return {}

      const now = Date.now()
      const newEvents: EventLog[] = []
      const newAlerts: Alert[] = [...s.alerts]
      const newMetrics: Record<string, MetricPoint[]> = { ...s.metrics }

      const updatedChecks = s.checks.map((c) => {
        if (!c.enabled) return c
        if (c.nextDueAt > now) return c

        const device = s.devices.find((d) => d.id === c.deviceId)
        if (!device) return c

        // Apply fault if any
        const fault: FaultMode = s.faults[c.deviceId] ?? 'none'

        // Compute simulated outcome
        let latencyMs: number | null
        let status: Status

        if (fault === 'down') {
          latencyMs = null
          status = 'down'
        } else {
          // Base success probability
          const successChance = c.type === 'mqtt' ? 0.94 : 0.97
          const success = Math.random() < successChance

          if (!success) {
            latencyMs = null
            status = 'down'
          } else {
            // Base latency by check type
            const base = c.type === 'ping' ? 4 :
              c.type === 'http' ? 40 :
              c.type === 'port' ? 8 :
              c.type === 'snmp' ? 15 :
              60 // mqtt

            const multiplier = fault === 'slow' ? 5 : 1
            latencyMs = Math.max(1, (base + (Math.random() - 0.5) * base * 0.8) * multiplier)

            status = latencyMs > c.critMs ? 'degraded' :
              latencyMs > c.warnMs ? 'degraded' : 'up'
          }
        }

        const wasDown = c.status === 'down'
        const nowDown = status === 'down'

        // Emit events on state transitions
        if (!wasDown && nowDown) {
          const sev: Severity = 'critical'
          newEvents.push({
            id: eid(), t: now, source: 'check', severity: sev,
            deviceId: device.id, checkId: c.id,
            message: `${device.name} ${c.type.toUpperCase()} check is DOWN`,
          })
          // Fire alert if matching rule
          const matchingRule = s.alertRules.find(
            (r) =>
              r.enabled &&
              r.metric === 'status' &&
              r.op === '==' &&
              r.threshold === 'down' &&
              (!r.deviceId || r.deviceId === device.id) &&
              (!r.checkType || r.checkType === c.type),
          )
          if (matchingRule) {
            newAlerts.push({
              id: aid(), ruleId: matchingRule.id, ruleName: matchingRule.name,
              deviceId: device.id, checkId: c.id, severity: matchingRule.severity,
              state: 'firing',
              openedAt: now,
              message: `${device.name} ${c.type.toUpperCase()} is down`,
              channels: matchingRule.channels,
            })
          }
        } else if (wasDown && !nowDown) {
          newEvents.push({
            id: eid(), t: now, source: 'check', severity: 'info',
            deviceId: device.id, checkId: c.id,
            message: `${device.name} ${c.type.toUpperCase()} recovered — latency ${Math.round(latencyMs ?? 0)}ms`,
          })
          // Auto-resolve firing alerts for this check
          for (let i = 0; i < newAlerts.length; i++) {
            if (newAlerts[i].checkId === c.id && newAlerts[i].state === 'firing') {
              newAlerts[i] = { ...newAlerts[i], state: 'resolved', resolvedAt: now }
            }
          }
        }

        // Emit warn events for latency spikes
        if (status === 'degraded' && latencyMs !== null && latencyMs > c.warnMs) {
          if (Math.random() < 0.15) { // don't spam
            newEvents.push({
              id: eid(), t: now, source: 'check', severity: 'warn',
              deviceId: device.id, checkId: c.id,
              message: `${device.name} ${c.type.toUpperCase()} latency ${Math.round(latencyMs)}ms (warn: ${c.warnMs}ms)`,
            })
          }
        }

        // Record metric sample
        const prev = newMetrics[c.id] ?? []
        newMetrics[c.id] = [
          ...prev.slice(-(MAX_METRIC_PTS - 1)),
          { t: now, latencyMs, status },
        ]

        const newConsec = nowDown ? c.consecutiveFailures + 1 : 0
        const newTotal = c.totalChecks + 1
        const newFailed = c.failedChecks + (nowDown ? 1 : 0)

        return {
          ...c,
          status,
          latencyMs,
          lastCheckedAt: now,
          nextDueAt: now + c.interval * 1000,
          consecutiveFailures: newConsec,
          totalChecks: newTotal,
          failedChecks: newFailed,
          uptimePct: ((newTotal - newFailed) / Math.max(newTotal, 1)) * 100,
        }
      })

      const allEvents = [...newEvents, ...s.events].slice(0, 500)

      return {
        checks: updatedChecks,
        events: allEvents,
        alerts: newAlerts,
        metrics: newMetrics,
      }
    })
  },
}))
