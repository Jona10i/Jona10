import { useState } from 'react';
import { Bell, BellOff, Check, Plus, Trash2 } from 'lucide-react';
import { useMonitor } from '../store/monitor';
import type { AlertChannel, AlertRule, CheckType, Severity, Status } from '../lib/types';
import { Button, Card, Empty, Label, Modal, SeverityBadge, Select, TextInput } from '../components/ui';
import { fmtAgo, fmtDateTime } from '../lib/util';

const CHECK_TYPES: CheckType[] = ['ping', 'http', 'snmp', 'port', 'mqtt'];
const CHANNELS: AlertChannel[] = ['email', 'slack', 'webhook'];
const STATUS_OPTS: Status[] = ['up', 'degraded', 'down', 'unknown'];

export function AlertsPage() {
  const alerts = useMonitor((s) => s.alerts);
  const devices = useMonitor((s) => s.devices);
  const rules = useMonitor((s) => s.rules);
  const ackAlert = useMonitor((s) => s.ackAlert);
  const resolveAlert = useMonitor((s) => s.resolveAlert);
  const clearResolved = useMonitor((s) => s.clearResolved);
  const addRule = useMonitor((s) => s.addRule);
  const removeRule = useMonitor((s) => s.removeRule);
  const toggleRule = useMonitor((s) => s.toggleRule);

  const [showAddRule, setShowAddRule] = useState(false);

  const firing = alerts.filter((a) => a.state === 'firing');
  const acked = alerts.filter((a) => a.state === 'acknowledged');
  const resolved = alerts.filter((a) => a.state === 'resolved');

  const devName = (id: string) => devices.find((d) => d.id === id)?.name ?? id;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-4">
        <Card
          title={<span className="flex items-center gap-2"><Bell className="w-4 h-4 text-rose-400" /> Firing · {firing.length}</span>}
        >
          {firing.length === 0 ? (
            <Empty>All clear — no firing alerts.</Empty>
          ) : (
            <div className="space-y-2">
              {firing.map((a) => (
                <div key={a.id} className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                  <div className="flex items-start gap-3">
                    <SeverityBadge severity={a.severity} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-100 font-medium">{a.ruleName}</div>
                      <div className="text-xs text-slate-400 mt-0.5 break-words">{a.message}</div>
                      <div className="text-[11px] text-slate-500 mt-1 font-mono">
                        {devName(a.deviceId)} · opened {fmtAgo(a.openedAt)} · via {a.channels.join(', ')}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="outline" onClick={() => ackAlert(a.id)}>
                        <Check className="w-3.5 h-3.5" /> Ack
                      </Button>
                      <Button size="sm" onClick={() => resolveAlert(a.id)}>Resolve</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {acked.length > 0 && (
          <Card title={<span>Acknowledged · {acked.length}</span>}>
            <div className="space-y-2">
              {acked.map((a) => (
                <div key={a.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-3">
                  <SeverityBadge severity={a.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-100 font-medium">{a.ruleName}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{a.message}</div>
                    <div className="text-[11px] text-slate-500 mt-1 font-mono">
                      {devName(a.deviceId)} · acked {a.ackedAt ? fmtAgo(a.ackedAt) : '—'}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => resolveAlert(a.id)}>Resolve</Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card
          title={<span>Resolved · {resolved.length}</span>}
          action={resolved.length > 0 && <Button size="sm" variant="ghost" onClick={clearResolved}>Clear history</Button>}
        >
          {resolved.length === 0 ? (
            <Empty>Nothing to show yet.</Empty>
          ) : (
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
              {resolved.slice(0, 100).map((a) => (
                <div key={a.id} className="text-xs flex items-center gap-3 py-1.5 border-b border-slate-800/40 last:border-0">
                  <SeverityBadge severity={a.severity} />
                  <span className="text-slate-400 min-w-0 flex-1 truncate">{a.ruleName} — {devName(a.deviceId)}</span>
                  <span className="text-slate-500 font-mono">{a.resolvedAt ? fmtDateTime(a.resolvedAt) : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Rules panel */}
      <div className="space-y-4">
        <Card
          title="Alert rules"
          action={<Button size="sm" onClick={() => setShowAddRule(true)}><Plus className="w-3.5 h-3.5" /> Rule</Button>}
        >
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className={`rounded-lg border p-3 ${r.enabled ? 'border-slate-800 bg-slate-900/40' : 'border-slate-800/60 bg-slate-900/20 opacity-70'}`}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-100">{r.name}</div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleRule(r.id)}
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${r.enabled ? 'border-emerald-500/40 text-emerald-300' : 'border-slate-700 text-slate-400'}`}
                    >
                      {r.enabled ? <span className="flex items-center gap-1"><Bell className="w-3 h-3" /> on</span> : <span className="flex items-center gap-1"><BellOff className="w-3 h-3" /> off</span>}
                    </button>
                    <button onClick={() => { if (confirm('Remove this rule?')) removeRule(r.id); }} className="text-slate-500 hover:text-rose-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {r.deviceId ? `dev=${devName(r.deviceId)}` : 'all devices'}
                  {' · '}
                  {r.checkType ? `type=${r.checkType}` : 'all types'}
                  {' · '}
                  <span className="font-mono">
                    {r.metric} {r.op} {String(r.threshold)}
                  </span>
                  {' for '}
                  <span className="font-mono">{r.forSec}s</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  <SeverityBadge severity={r.severity} /> <span className="ml-2">via {r.channels.join(', ')}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <AddRuleModal
        open={showAddRule}
        onClose={() => setShowAddRule(false)}
        onSubmit={(r) => {
          addRule(r);
          setShowAddRule(false);
        }}
      />
    </div>
  );
}

function AddRuleModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (r: Omit<AlertRule, 'id'>) => void;
}) {
  const devices = useMonitor((s) => s.devices);
  const [name, setName] = useState('');
  const [deviceId, setDeviceId] = useState<string>('');
  const [checkType, setCheckType] = useState<string>('');
  const [metric, setMetric] = useState<'latency' | 'status'>('latency');
  const [op, setOp] = useState<'>' | '<' | '=='>('>');
  const [thresholdNum, setThresholdNum] = useState(500);
  const [thresholdStatus, setThresholdStatus] = useState<Status>('down');
  const [forSec, setForSec] = useState(30);
  const [severity, setSeverity] = useState<Severity>('warn');
  const [channels, setChannels] = useState<AlertChannel[]>(['slack']);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      enabled: true,
      deviceId: deviceId || undefined,
      checkType: checkType ? (checkType as CheckType) : undefined,
      metric,
      op,
      threshold: metric === 'latency' ? thresholdNum : thresholdStatus,
      forSec,
      severity,
      channels: channels.length ? channels : ['slack'],
    });
    setName('');
  };

  const toggleChannel = (c: AlertChannel) => {
    setChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New alert rule"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Create</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div><Label>Rule name</Label><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Auth API latency high" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Device (optional)</Label>
            <Select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              <option value="">Any</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Check type (optional)</Label>
            <Select value={checkType} onChange={(e) => setCheckType(e.target.value)}>
              <option value="">Any</option>
              {CHECK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Metric</Label>
            <Select value={metric} onChange={(e) => setMetric(e.target.value as 'latency' | 'status')}>
              <option value="latency">latency</option>
              <option value="status">status</option>
            </Select>
          </div>
          <div>
            <Label>Op</Label>
            <Select value={op} onChange={(e) => setOp(e.target.value as '>' | '<' | '==')}>
              <option value=">">{'>'}</option>
              <option value="<">{'<'}</option>
              <option value="==">{'=='}</option>
            </Select>
          </div>
          <div>
            <Label>Threshold</Label>
            {metric === 'latency' ? (
              <TextInput type="number" value={thresholdNum} onChange={(e) => setThresholdNum(Number(e.target.value))} />
            ) : (
              <Select value={thresholdStatus} onChange={(e) => setThresholdStatus(e.target.value as Status)}>
                {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Sustained for (sec)</Label><TextInput type="number" value={forSec} onChange={(e) => setForSec(Number(e.target.value))} /></div>
          <div>
            <Label>Severity</Label>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="critical">critical</option>
            </Select>
          </div>
        </div>
        <div>
          <Label>Notification channels</Label>
          <div className="flex gap-2">
            {CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleChannel(c)}
                className={`text-xs px-2.5 py-1 rounded-lg border ${channels.includes(c) ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 text-slate-400'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
