import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, FileText } from 'lucide-react';
import { useMonitor } from '../store/monitor';
import { Button, Card, Select } from '../components/ui';
import { downloadFile, fmtTime, toCsv } from '../lib/util';

type Range = '15m' | '1h' | '24h' | 'all';
const RANGE_MS: Record<Range, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  all: Number.POSITIVE_INFINITY,
};

export function ReportsPage() {
  const devices = useMonitor((s) => s.devices);
  const checks = useMonitor((s) => s.checks);
  const metrics = useMonitor((s) => s.metrics);
  const [range, setRange] = useState<Range>('1h');

  const cutoff = Date.now() - RANGE_MS[range];

  // ---- SLA per device (avg across its checks, restricted to window) ----
  const sla = useMemo(() => {
    return devices.map((d) => {
      const dChecks = checks.filter((c) => c.deviceId === d.id);
      let up = 0;
      let total = 0;
      let latencies: number[] = [];
      for (const c of dChecks) {
        const pts = (metrics[c.id] ?? []).filter((p) => p.t >= cutoff);
        for (const p of pts) {
          total++;
          if (p.status !== 'down') up++;
          if (p.latencyMs !== null) latencies.push(p.latencyMs);
        }
      }
      const uptime = total ? (up / total) * 100 : 100;
      const avgLat = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
      const p95 = percentile(latencies, 95);
      return {
        id: d.id,
        name: d.name,
        kind: d.kind,
        checks: dChecks.length,
        samples: total,
        uptime,
        avgLat,
        p95,
      };
    });
  }, [devices, checks, metrics, cutoff]);

  // ---- Status distribution over the window (stacked bars, bucketed) ----
  const statusOverTime = useMemo(() => {
    // build ~30 buckets across window
    const start = Number.isFinite(cutoff) ? cutoff : Math.min(...Object.values(metrics).flat().map((p) => p.t), Date.now() - 60 * 60 * 1000);
    const end = Date.now();
    const bucketCount = 30;
    const size = Math.max(1000, (end - start) / bucketCount);
    const buckets = new Array(bucketCount).fill(0).map((_, i) => ({
      t: start + i * size,
      up: 0,
      degraded: 0,
      down: 0,
    }));
    for (const pts of Object.values(metrics)) {
      for (const p of pts) {
        if (p.t < start) continue;
        const idx = Math.min(bucketCount - 1, Math.floor((p.t - start) / size));
        if (idx < 0) continue;
        if (p.status === 'up') buckets[idx].up++;
        else if (p.status === 'degraded') buckets[idx].degraded++;
        else if (p.status === 'down') buckets[idx].down++;
      }
    }
    return buckets.map((b) => ({ ...b, t: fmtTime(b.t) }));
  }, [metrics, cutoff]);

  // ---- Response time trend (avg across all checks per bucket) ----
  const latencyTrend = useMemo(() => {
    const start = Number.isFinite(cutoff) ? cutoff : Date.now() - 60 * 60 * 1000;
    const end = Date.now();
    const bucketCount = 40;
    const size = Math.max(1000, (end - start) / bucketCount);
    const sums = new Array(bucketCount).fill(0);
    const counts = new Array(bucketCount).fill(0);
    for (const pts of Object.values(metrics)) {
      for (const p of pts) {
        if (p.t < start || p.latencyMs === null) continue;
        const idx = Math.min(bucketCount - 1, Math.floor((p.t - start) / size));
        if (idx < 0) continue;
        sums[idx] += p.latencyMs;
        counts[idx]++;
      }
    }
    return sums.map((s, i) => ({
      t: fmtTime(start + i * size),
      avg: counts[i] ? Math.round(s / counts[i]) : 0,
    }));
  }, [metrics, cutoff]);

  const exportSlaCsv = () => {
    const rows: (string | number)[][] = [
      ['device', 'kind', 'checks', 'samples', 'uptime_pct', 'avg_latency_ms', 'p95_latency_ms'],
      ...sla.map((s) => [s.name, s.kind, s.checks, s.samples, s.uptime.toFixed(2), Math.round(s.avgLat), Math.round(s.p95)]),
    ];
    downloadFile(`sla-${range}-${Date.now()}.csv`, toCsv(rows));
  };

  const printReport = () => window.print();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={range} onChange={(e) => setRange(e.target.value as Range)} className="w-40">
          <option value="15m">Last 15 minutes</option>
          <option value="1h">Last hour</option>
          <option value="24h">Last 24 hours</option>
          <option value="all">All retained</option>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" onClick={exportSlaCsv}><Download className="w-3.5 h-3.5" /> SLA CSV</Button>
        <Button variant="outline" onClick={printReport}><FileText className="w-3.5 h-3.5" /> Print / PDF</Button>
      </div>

      <Card title="SLA uptime by device">
        <div className="overflow-x-auto -m-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="px-5 py-3">Device</th>
                <th className="px-5 py-3">Kind</th>
                <th className="px-5 py-3">Checks</th>
                <th className="px-5 py-3">Samples</th>
                <th className="px-5 py-3">Uptime</th>
                <th className="px-5 py-3">Avg latency</th>
                <th className="px-5 py-3">p95 latency</th>
              </tr>
            </thead>
            <tbody>
              {sla.map((s) => (
                <tr key={s.id} className="border-b border-slate-800/60">
                  <td className="px-5 py-3 text-slate-100">{s.name}</td>
                  <td className="px-5 py-3 text-slate-400">{s.kind}</td>
                  <td className="px-5 py-3 text-slate-300">{s.checks}</td>
                  <td className="px-5 py-3 text-slate-300">{s.samples}</td>
                  <td className="px-5 py-3">
                    <span className={`font-mono ${s.uptime >= 99 ? 'text-emerald-300' : s.uptime >= 95 ? 'text-amber-300' : 'text-rose-300'}`}>
                      {s.uptime.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-slate-300">{Math.round(s.avgLat)}ms</td>
                  <td className="px-5 py-3 font-mono text-slate-300">{Math.round(s.p95)}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Status distribution">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={statusOverTime}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#334155' }} minTickGap={40} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#334155' }} width={40} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Bar dataKey="up" stackId="a" fill="#34d399" />
                <Bar dataKey="degraded" stackId="a" fill="#fbbf24" />
                <Bar dataKey="down" stackId="a" fill="#f43f5e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Avg response time trend">
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={latencyTrend}>
                <defs>
                  <linearGradient id="rt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#334155' }} minTickGap={40} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#334155' }} width={40} unit="ms" />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="avg" stroke="#a78bfa" strokeWidth={2} fill="url(#rt)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const arr = [...sorted].sort((a, b) => a - b);
  const idx = Math.min(arr.length - 1, Math.floor((p / 100) * arr.length));
  return arr[idx];
}
