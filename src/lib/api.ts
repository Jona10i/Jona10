/**
 * NetPulse API client
 *
 * In development, requests to /api/* are proxied to FastAPI at localhost:8000
 * via the vite.config.ts proxy.
 * In production (served by `serve`), the frontend expects the API at /api.
 */

import type { Alert, AlertRule, Check, Device, EventLog } from './types'

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

// ── Health ────────────────────────────────────────────────────────────────────
export const api = {
  health: () => get<{ status: string }>('/health'),

  // ── Devices ───────────────────────────────────────────────────────────────
  devices: {
    list: () => get<{ devices: Device[] }>('/devices'),
    create: (d: Omit<Device, 'id' | 'createdAt'>) =>
      post<{ device: Device }>('/devices', d),
    remove: (id: string) => del(`/devices/${id}`),
  },

  // ── Checks ────────────────────────────────────────────────────────────────
  checks: {
    list: (deviceId?: string) =>
      get<{ checks: Check[] }>(`/checks${deviceId ? `?device_id=${deviceId}` : ''}`),
    create: (c: Omit<Check, 'id' | 'status' | 'latencyMs' | 'lastCheckedAt' | 'nextDueAt' | 'consecutiveFailures' | 'totalChecks' | 'failedChecks' | 'uptimePct'>) =>
      post<{ check: Check }>('/checks', c),
    update: (id: string, patch_: Partial<Check>) =>
      patch<{ check: Check }>(`/checks/${id}`, patch_),
    remove: (id: string) => del(`/checks/${id}`),
  },

  // ── Events ────────────────────────────────────────────────────────────────
  events: {
    list: (limit = 200) =>
      get<{ events: EventLog[] }>(`/events?limit=${limit}`),
  },

  // ── Alerts ────────────────────────────────────────────────────────────────
  alerts: {
    list: () => get<{ alerts: Alert[] }>('/alerts'),
    ack: (id: string) => patch<{ alert: Alert }>(`/alerts/${id}/ack`, {}),
    resolve: (id: string) => patch<{ alert: Alert }>(`/alerts/${id}/resolve`, {}),
  },

  // ── Alert rules ───────────────────────────────────────────────────────────
  rules: {
    list: () => get<{ rules: AlertRule[] }>('/alert-rules'),
    create: (r: Omit<AlertRule, 'id'>) =>
      post<{ rule: AlertRule }>('/alert-rules', r),
    remove: (id: string) => del(`/alert-rules/${id}`),
    toggle: (id: string, enabled: boolean) =>
      patch<{ rule: AlertRule }>(`/alert-rules/${id}`, { enabled }),
  },
}
