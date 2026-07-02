import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Bell, CheckCircle2, Cpu, Gauge, Radio, Router, Server, Waves, Zap } from 'lucide-react';
import { useMonitor } from '../store/monitor';
import type { Device, FaultMode } from '../lib/types';
import { Card, KpiCard, StatusDot, StatusPill, SeverityBadge } from '../components/ui';
import { fmtAgo, fmtTime } from '../lib/util';

const kindIcon: Record<Device['kind'], React.ElementType> = {
  router: Router,
  switch: Server,
  'load-balancer': Waves,
  api: Zap,
  database: Server,
  cache: Cpu,
  'iot-gateway': Radio,
  sensor: Gauge,
  worker: Cpu,
};

export function Dashboard() {
  const devices = useMonitor((s) => s.devices);
  const checks = useMonitor((s) => s.checks);
  const metrics = useMonitor((s) => s.metrics);
  const events = useMonitor((s) => s.events);
  const alerts = useMonitor((s) => s.alerts);
  const faults = useMonitor((s) => s.faults);
  const injectFault = useMonitor((s) => s.injectFault);

  const [selectedCheckId, setSelectedCheckId] = useState<string>(() => checks[0]?.id ?? '');

  const totalChecks = checks.length;
  const upChecks = checks.filter((c) => c.status === 'up').length;
  const degradedChecks = checks.filter((c) => c.status === 'degraded').length;
  const downChecks = checks.filter((c) => c.status === 'down').length;

  const activeAlerts = alerts.filter((a) => a.state !== 'resolved');
  const avgLatency = useMemo(() => {
    const ls = checks.map((c) => c.latencyMs).filter((v): v is number => typeof v === 'number');
    if (!ls.length) return 0;
    return Math.round(ls.reduce((a, b) => a + b, 0) / ls.length);
  }, [checks]);

  const chartData = useMemo(() => {
    const pts = metrics[selectedCheckId] ?? [];
    return pts.map((p) => ({
      t: fmtTime(p.t),
      latency: p.latencyMs ?? 0,
      down: p.latencyMs === null ? 1 : 0,
    }));
  }, [metrics, selectedCheckId]);

  const selectedCheck = checks.find((c) => c.id === selectedCheckId);
  const selectedDevice = devices.find((d) => d.id === selectedCheck?.deviceId);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Devices monitored"
          value={devices.length}
          hint={`${checks.length} checks configured`}
          tone="sky"
          icon={<Server className="w-8 h-8" />}
        />
        <KpiCard
          label="Checks up"
          value={<span className="text-emerald-300">{upChecks}<span className="text-slate-500 text-xl">/{totalChecks}</span></span>}
          hint={`${degradedChecks} degraded · ${downChecks} down`}
          tone="emerald"
          icon={<CheckCircle2 className="w-8 h-8" />}
        />
        <KpiCard
          label="Active alerts"
          value={<span className={activeAlerts.length ? 'text-rose-300' : 'text-slate-200'}>{activeAlerts.length}</span>}
          hint={`${alerts.length - activeAlerts.length} resolved · lifetime`}
          tone={activeAlerts.length ? 'rose' : 'slate'}
          icon={<Bell className="w-8 h-8" />}
        />
        <KpiCard
          label="Avg latency"
          value={<>{avgLatency}<span className="text-lg text-slate-400 ml-1">ms</span></>}
          hint="Across all enabled checks"
          tone="violet"
          icon={<Gauge className="w-8 h-8" />}
        />
      </div>

      {/* Grid + Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card
          className="xl:col-span-2"
          title="Live device status"
          action={<div className="text-xs text-slate-400">Click a device to graph its check · use ⚡ to inject faults</div>}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {devices.map((d) => {
              const devChecks = checks.filter((c) => c.deviceId === d.id);
              const primary = devChecks[0];
              const worst = devChecks.reduce<'up' | 'degraded' | 'down' | 'unknown'>((acc, c) => {
                const rank = { unknown: 0, up: 1, degraded: 2, down: 3 } as const;
                return rank[c.status] > rank[acc] ? c.status : acc;
              }, 'unknown');
              const Icon = kindIcon[d.kind] ?? Server;
              const isSelected = primary?.id === selectedCheckId;
              const fault = faults[d.id] ?? 'none';
              return (
                <div
                  key={d.id}
                  onClick={() => primary && setSelectedCheckId(primary.id)}
                  className={`group cursor-pointer rounded-xl border p-3 transition
                    ${isSelected
                      ? 'border-cyan-400/60 bg-cyan-500/5'
                      : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70'}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-100 truncate">{d.name}</div>
                        <div className="text-[11px] text-slate-500 truncate font-mono">{d.host}</div>
                      </div>
                    </div>
                    <StatusDot status={worst} size={10} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px]">
                    <StatusPill status={worst} />
                    <span className="font-mono text-slate-300">
                      {primary?.latencyMs !== null && primary?.latencyMs !== undefined
                        ? `${Math.round(primary.latencyMs)}ms`
                        : '—'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-1 opacity-80">
                    <FaultMenu
                      current={fault}
                      onChange={(m) => injectFault(d.id, m)}
                    />
                    {fault !== 'none' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        fault: {fault}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card
          title="Recent events"
          action={<span className="text-xs text-slate-500">{events.length} in buffer</span>}
        >
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {events.slice(0, 40).map((e) => (
              <div key={e.id} className="flex items-start gap-2 text-xs">
                <span className="text-slate-500 font-mono w-16 shrink-0">{fmtTime(e.t)}</span>
                <SeverityBadge severity={e.severity} />
                <span className="text-slate-300 min-w-0 break-words">{e.message}</span>
              </div>
            ))}
            {events.length === 0 && (
              <div className="text-slate-500 text-sm">No events yet.</div>
            )}
          </div>
        </Card>
      </div>

      {/* Live chart */}
      <Card
        title={selectedCheck ? `Live latency — ${selectedDevice?.name} · ${selectedCheck.type.toUpperCase()}` : 'Live latency'}
        action={
          selectedCheck && (
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>warn <span className="text-amber-300 font-mono">{selectedCheck.warnMs}ms</span></span>
              <span>crit <span className="text-rose-300 font-mono">{selectedCheck.critMs}ms</span></span>
              <span>uptime <span className="text-emerald-300 font-mono">{selectedCheck.uptimePct.toFixed(1)}%</span></span>
              <span>last check <span className="font-mono">{selectedCheck.lastCheckedAt ? fmtAgo(selectedCheck.lastCheckedAt) : '—'}</span></span>
            </div>
          )
        }
      >
        {chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-500 text-sm grid-pattern rounded-lg">
            Waiting for samples…
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="lat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#334155' }} minTickGap={30} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#334155' }} width={40} unit="ms" />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Area type="monotone" dataKey="latency" stroke="#22d3ee" strokeWidth={2} fill="url(#lat)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Active alerts strip */}
      {activeAlerts.length > 0 && (
        <Card title="Firing alerts" action={<span className="text-xs text-rose-300">{activeAlerts.length} active</span>}>
          <div className="space-y-2">
            {activeAlerts.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-center gap-3 text-xs rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <SeverityBadge severity={a.severity} />
                <span className="text-slate-200 flex-1 min-w-0 truncate">{a.message}</span>
                <span className="text-slate-500 font-mono">{fmtAgo(a.openedAt)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---- Fault injection menu (per-device) ----
function FaultMenu({
  current,
  onChange,
}: {
  current: FaultMode;
  onChange: (m: FaultMode) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-1"
      >
        <Zap className="w-3 h-3" /> inject
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-32 rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden text-[11px]">
          {(['none', 'slow', 'down'] as FaultMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { onChange(m); setOpen(false); }}
              className={`w-full text-left px-2 py-1.5 hover:bg-slate-800 flex items-center justify-between ${current === m ? 'text-cyan-300' : 'text-slate-300'}`}
            >
              <span>{m === 'none' ? 'clear' : m}</span>
              {current === m && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
