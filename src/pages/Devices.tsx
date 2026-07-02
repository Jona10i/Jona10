import { useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { Plus, Search, Trash2 } from 'lucide-react';
import { useMonitor } from '../store/monitor';
import type { Check, CheckType, Device, DeviceKind, IntervalSec, Status } from '../lib/types';
import { Button, Card, Empty, Label, Modal, Select, StatusPill, TextInput } from '../components/ui';
import { fmtAgo } from '../lib/util';

const DEVICE_KINDS: DeviceKind[] = ['router', 'switch', 'load-balancer', 'api', 'database', 'cache', 'iot-gateway', 'sensor', 'worker'];
const CHECK_TYPES: CheckType[] = ['ping', 'http', 'snmp', 'port', 'mqtt'];
const INTERVALS: IntervalSec[] = [10, 30, 60, 300, 900, 3600];

export function DevicesPage() {
  const devices = useMonitor((s) => s.devices);
  const checks = useMonitor((s) => s.checks);
  const metrics = useMonitor((s) => s.metrics);
  const addDevice = useMonitor((s) => s.addDevice);
  const removeDevice = useMonitor((s) => s.removeDevice);
  const addCheck = useMonitor((s) => s.addCheck);
  const updateCheck = useMonitor((s) => s.updateCheck);
  const removeCheck = useMonitor((s) => s.removeCheck);
  const toggleCheck = useMonitor((s) => s.toggleCheck);

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showAddCheckForDevice, setShowAddCheckForDevice] = useState<string | null>(null);

  const worstStatus = (id: string): Status => {
    const dc = checks.filter((c) => c.deviceId === id);
    if (!dc.length) return 'unknown';
    const rank = { unknown: 0, up: 1, degraded: 2, down: 3 } as const;
    return dc.reduce<Status>((acc, c) => (rank[c.status] > rank[acc] ? c.status : acc), 'unknown');
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return devices.filter((d) => {
      const status = worstStatus(d.id);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!needle) return true;
      return (
        d.name.toLowerCase().includes(needle) ||
        d.host.toLowerCase().includes(needle) ||
        d.tags.some((t) => t.toLowerCase().includes(needle)) ||
        d.kind.toLowerCase().includes(needle)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, checks, q, statusFilter]);

  const selectedDevice = devices.find((d) => d.id === selectedId) ?? null;
  const selectedChecks = selectedDevice ? checks.filter((c) => c.deviceId === selectedDevice.id) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <TextInput
            placeholder="Search by name, host, tag…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | Status)}
          className="w-40"
        >
          <option value="all">All statuses</option>
          <option value="up">Up</option>
          <option value="degraded">Degraded</option>
          <option value="down">Down</option>
          <option value="unknown">Unknown</option>
        </Select>
        <Button onClick={() => setShowAddDevice(true)}>
          <Plus className="w-4 h-4" /> Add device
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto -m-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Kind</th>
                <th className="px-5 py-3">Host</th>
                <th className="px-5 py-3">Checks</th>
                <th className="px-5 py-3">Uptime</th>
                <th className="px-5 py-3">Tags</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const dc = checks.filter((c) => c.deviceId === d.id);
                const avgUptime = dc.length ? dc.reduce((a, c) => a + c.uptimePct, 0) / dc.length : 100;
                return (
                  <tr
                    key={d.id}
                    className="border-b border-slate-800/60 hover:bg-slate-900/40 cursor-pointer"
                    onClick={() => setSelectedId(d.id)}
                  >
                    <td className="px-5 py-3"><StatusPill status={worstStatus(d.id)} /></td>
                    <td className="px-5 py-3 font-medium text-slate-100">{d.name}</td>
                    <td className="px-5 py-3 text-slate-400">{d.kind}</td>
                    <td className="px-5 py-3 font-mono text-slate-300 text-xs">{d.host}</td>
                    <td className="px-5 py-3 text-slate-300">{dc.length}</td>
                    <td className="px-5 py-3 font-mono text-emerald-300">{avgUptime.toFixed(1)}%</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {d.tags.map((t) => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{t}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); if (confirm(`Remove ${d.name}?`)) removeDevice(d.id); }}
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8}><Empty>No devices match your filter.</Empty></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail drawer */}
      {selectedDevice && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="absolute right-0 top-0 h-full w-full max-w-lg bg-slate-950 border-l border-slate-800 shadow-2xl overflow-y-auto slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-slate-100">{selectedDevice.name}</div>
                <div className="text-xs text-slate-500 font-mono">{selectedDevice.host}</div>
              </div>
              <button className="text-slate-400 hover:text-slate-200 text-2xl leading-none" onClick={() => setSelectedId(null)}>×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Info label="Kind" value={selectedDevice.kind} />
                <Info label="Location" value={selectedDevice.location ?? '—'} />
                <Info label="Status" value={<StatusPill status={worstStatus(selectedDevice.id)} />} />
                <Info label="Tags" value={selectedDevice.tags.join(', ') || '—'} />
              </div>

              <div className="flex items-center justify-between pt-2 pb-1">
                <div className="text-sm font-semibold text-slate-200">Checks ({selectedChecks.length})</div>
                <Button size="sm" onClick={() => setShowAddCheckForDevice(selectedDevice.id)}>
                  <Plus className="w-3.5 h-3.5" /> Add check
                </Button>
              </div>

              <div className="space-y-3">
                {selectedChecks.map((c) => {
                  const pts = (metrics[c.id] ?? []).slice(-40).map((p) => ({ v: p.latencyMs ?? 0 }));
                  return (
                    <div key={c.id} className="rounded-lg border border-slate-800 p-3 bg-slate-900/40">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <StatusPill status={c.status} />
                          <span className="text-sm font-mono text-slate-200">{c.type.toUpperCase()}</span>
                          <span className="text-xs text-slate-400 truncate max-w-[220px]">{c.target}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleCheck(c.id)}
                            className={`text-[10px] px-1.5 py-0.5 rounded border ${c.enabled ? 'border-emerald-500/40 text-emerald-300' : 'border-slate-700 text-slate-400'}`}
                          >
                            {c.enabled ? 'enabled' : 'disabled'}
                          </button>
                          <button onClick={() => { if (confirm('Remove this check?')) removeCheck(c.id); }} className="text-slate-500 hover:text-rose-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-[11px] mb-2">
                        <MiniField
                          label="Interval"
                          value={
                            <Select
                              value={c.interval}
                              onChange={(e) => updateCheck(c.id, { interval: Number(e.target.value) as IntervalSec })}
                              className="text-xs py-0.5 px-1.5"
                            >
                              {INTERVALS.map((i) => <option key={i} value={i}>{i}s</option>)}
                            </Select>
                          }
                        />
                        <MiniField
                          label="Warn ms"
                          value={
                            <TextInput
                              type="number"
                              value={c.warnMs}
                              onChange={(e) => updateCheck(c.id, { warnMs: Number(e.target.value) })}
                              className="text-xs py-0.5 px-1.5"
                            />
                          }
                        />
                        <MiniField
                          label="Crit ms"
                          value={
                            <TextInput
                              type="number"
                              value={c.critMs}
                              onChange={(e) => updateCheck(c.id, { critMs: Number(e.target.value) })}
                              className="text-xs py-0.5 px-1.5"
                            />
                          }
                        />
                        <MiniField label="Uptime" value={<span className="text-emerald-300 font-mono">{c.uptimePct.toFixed(1)}%</span>} />
                      </div>
                      <div className="h-10 -mb-1">
                        {pts.length > 1 && (
                          <ResponsiveContainer>
                            <LineChart data={pts}>
                              <Line type="monotone" dataKey="v" stroke="#22d3ee" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        {c.latencyMs !== null ? `${Math.round(c.latencyMs)}ms · ` : 'timeout · '}
                        last check {c.lastCheckedAt ? fmtAgo(c.lastCheckedAt) : '—'}
                        {' · '}
                        {c.totalChecks} checks / {c.failedChecks} failed
                      </div>
                    </div>
                  );
                })}
                {selectedChecks.length === 0 && <Empty>No checks yet — add one to start monitoring.</Empty>}
              </div>
            </div>
          </div>
        </div>
      )}

      <AddDeviceModal
        open={showAddDevice}
        onClose={() => setShowAddDevice(false)}
        onSubmit={(dev) => {
          addDevice(dev);
          setShowAddDevice(false);
        }}
      />
      <AddCheckModal
        open={!!showAddCheckForDevice}
        deviceId={showAddCheckForDevice}
        onClose={() => setShowAddCheckForDevice(null)}
        onSubmit={(c) => {
          addCheck(c);
          setShowAddCheckForDevice(null);
        }}
      />
    </div>
  );
}

const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className="text-slate-200 mt-0.5">{value}</div>
  </div>
);

const MiniField = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</div>
    {value}
  </div>
);

function AddDeviceModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (d: Omit<Device, 'id' | 'createdAt'>) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<DeviceKind>('api');
  const [host, setHost] = useState('');
  const [tags, setTags] = useState('');
  const [location, setLocation] = useState('');

  const submit = () => {
    if (!name.trim() || !host.trim()) return;
    onSubmit({
      name: name.trim(),
      kind,
      host: host.trim(),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      location: location.trim() || undefined,
    });
    setName(''); setHost(''); setTags(''); setLocation('');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add device"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Create</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div><Label>Name</Label><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Edge Router 02" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Kind</Label>
            <Select value={kind} onChange={(e) => setKind(e.target.value as DeviceKind)}>
              {DEVICE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </Select>
          </div>
          <div><Label>Host</Label><TextInput value={host} onChange={(e) => setHost(e.target.value)} placeholder="10.0.0.1 or host.name" /></div>
        </div>
        <div><Label>Tags (comma separated)</Label><TextInput value={tags} onChange={(e) => setTags(e.target.value)} placeholder="prod, edge" /></div>
        <div><Label>Location</Label><TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="DC1 / Rack A2" /></div>
      </div>
    </Modal>
  );
}

function AddCheckModal({
  open,
  onClose,
  onSubmit,
  deviceId,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (c: Omit<Check, 'id' | 'status' | 'latencyMs' | 'lastCheckedAt' | 'nextDueAt' | 'consecutiveFailures' | 'totalChecks' | 'failedChecks' | 'uptimePct'>) => void;
  deviceId: string | null;
}) {
  const [type, setType] = useState<CheckType>('http');
  const [target, setTarget] = useState('');
  const [interval, setInterval] = useState<IntervalSec>(30);
  const [warnMs, setWarnMs] = useState(200);
  const [critMs, setCritMs] = useState(600);
  const [timeoutMs, setTimeoutMs] = useState(3000);

  const submit = () => {
    if (!deviceId || !target.trim()) return;
    onSubmit({
      deviceId,
      type,
      target: target.trim(),
      interval,
      warnMs,
      critMs,
      timeoutMs,
      enabled: true,
    });
    setTarget('');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add check"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Create</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value as CheckType)}>
              {CHECK_TYPES.map((k) => <option key={k} value={k}>{k}</option>)}
            </Select>
          </div>
          <div>
            <Label>Interval</Label>
            <Select value={interval} onChange={(e) => setInterval(Number(e.target.value) as IntervalSec)}>
              {INTERVALS.map((i) => <option key={i} value={i}>{i}s</option>)}
            </Select>
          </div>
        </div>
        <div><Label>Target</Label><TextInput value={target} onChange={(e) => setTarget(e.target.value)} placeholder="URL, IP, host:port, or OID" /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Warn (ms)</Label><TextInput type="number" value={warnMs} onChange={(e) => setWarnMs(Number(e.target.value))} /></div>
          <div><Label>Crit (ms)</Label><TextInput type="number" value={critMs} onChange={(e) => setCritMs(Number(e.target.value))} /></div>
          <div><Label>Timeout</Label><TextInput type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value))} /></div>
        </div>
      </div>
    </Modal>
  );
}
