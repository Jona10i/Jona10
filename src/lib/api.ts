/**
 * NetPulse API client — REST endpoints for all monitoring operations
 *
 * In development, requests to /api/* are proxied to FastAPI at localhost:8000
 * via the vite.config.ts proxy.
 * In production (served by `serve`), the frontend expects the API at /api.
 */

import type { Alert, AlertRule, Check, Device, EventLog, MetricPoint } from './types'

const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status} ${res.statusText}`)
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

// ── System ────────────────────────────────────────────────────────────────────
export const api = {
  health: () => get<{ status: string; timestamp: number }>('/health'),

  stats: () =>
    get<{
      devices: number
      checks: number
      status_counts: Record<string, number>
      active_alerts: number
      total_alerts: number
      avg_uptime_pct: number
      avg_latency_ms: number
    }>('/stats'),

  // ── Devices ───────────────────────────────────────────────────────────────
  devices: {
    list: (tag?: string, kind?: string) => {
      const params = new URLSearchParams()
      if (tag) params.set('tag', tag)
      if (kind) params.set('kind', kind)
      return get<{ devices: Device[] }>(`/devices?${params}`)
    },

    get: (id: string) =>
      get<{ device: Device & { checks_count: number; checks: Check[] } }>(
        `/devices/${id}`,
      ),

    create: (d: Omit<Device, 'id' | 'createdAt'>) =>
      post<{ device: Device }>('/devices', d),

    update: (id: string, patch_: Partial<Device>) =>
      patch<{ device: Device }>(`/devices/${id}`, patch_),

    delete: (id: string) => del(`/devices/${id}`),
  },

  // ── Checks ─────────────────────────────────────────────────────────────────
  checks: {
    list: (deviceId?: string, enabled?: boolean, status?: string) => {
      const params = new URLSearchParams()
      if (deviceId) params.set('device_id', deviceId)
      if (enabled !== undefined) params.set('enabled', String(enabled))
      if (status) params.set('status', status)
      return get<{ checks: Check[] }>(`/checks?${params}`)
    },

    get: (id: string) =>
      get<{ check: Check & { recent_metrics: MetricPoint[] } }>(`/checks/${id}`),

    create: (c: Omit<
      Check,
      'id' | 'status' | 'latencyMs' | 'lastCheckedAt' | 'nextDueAt' | 'consecutiveFailures' | 'totalChecks' | 'failedChecks' | 'uptimePct'
    >) => post<{ check: Check }>('/checks', c),

    update: (id: string, patch_: Partial<Check>) =>
      patch<{ check: Check }>(`/checks/${id}`, patch_),

    delete: (id: string) => del(`/checks/${id}`),
  },

  // ── Metrics ────────────────────────────────────────────────────────────────
  metrics: {
    get: (checkId: string, limit?: number) =>
      get<{ metrics: MetricPoint[] }>(
        `/checks/${checkId}/metrics${limit ? `?limit=${limit}` : ''}`,
      ),

    record: (checkId: string, metric: { t?: number; latencyMs: number | null; status: string }) =>
      post<{ metric: MetricPoint }>(`/checks/${checkId}/metrics`, metric),
  },

  // ── Events ─────────────────────────────────────────────────────────────────
  events: {
    list: (limit?: number, offset?: number, severity?: string, source?: string, deviceId?: string) => {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      if (offset) params.set('offset', String(offset))
      if (severity) params.set('severity', severity)
      if (source) params.set('source', source)
      if (deviceId) params.set('device_id', deviceId)
      return get<{
        events: EventLog[]
        total: number
        offset: number
        limit: number
      }>(`/events?${params}`)
    },

    create: (e: Omit<EventLog, 'id'> & { t?: number }) =>
      post<{ event: EventLog }>('/events', e),

    clear: () => del('/events'),
  },

  // ── Alerts ─────────────────────────────────────────────────────────────────
  alerts: {
    list: (state?: string, severity?: string, deviceId?: string) => {
      const params = new URLSearchParams()
      if (state) params.set('state', state)
      if (severity) params.set('severity', severity)
      if (deviceId) params.set('device_id', deviceId)
      return get<{ alerts: Alert[] }>(`/alerts?${params}`)
    },

    get: (id: string) => get<{ alert: Alert }>(`/alerts/${id}`),

    create: (a: Omit<Alert, 'id' | 'openedAt'> & { openedAt?: number }) =>
      post<{ alert: Alert }>('/alerts', a),

    ack: (id: string) => patch<{ alert: Alert }>(`/alerts/${id}/ack`, {}),

    resolve: (id: string) => patch<{ alert: Alert }>(`/alerts/${id}/resolve`, {}),

    clearResolved: () => del('/alerts'),
  },

  // ── Alert rules ────────────────────────────────────────────────────────────
  rules: {
    list: (enabled?: boolean) => {
      const params = new URLSearchParams()
      if (enabled !== undefined) params.set('enabled', String(enabled))
      return get<{ rules: AlertRule[] }>(`/alert-rules?${params}`)
    },

    get: (id: string) => get<{ rule: AlertRule }>(`/alert-rules/${id}`),

    create: (r: Omit<AlertRule, 'id'>) =>
      post<{ rule: AlertRule }>('/alert-rules', r),

    update: (id: string, patch_: Partial<AlertRule>) =>
      patch<{ rule: AlertRule }>(`/alert-rules/${id}`, patch_),

    toggle: (id: string) =>
      post<{ rule: AlertRule }>(`/alert-rules/${id}/toggle`, {}),

    delete: (id: string) => del(`/alert-rules/${id}`),
  },
}
