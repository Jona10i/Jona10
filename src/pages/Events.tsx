import { useMemo, useState } from 'react';
import { Download, Pause, Play, Trash2 } from 'lucide-react';
import { useMonitor } from '../store/monitor';
import type { EventLog, Severity } from '../lib/types';
import { Button, Card, Empty, SeverityBadge, Select, TextInput } from '../components/ui';
import { downloadFile, fmtDateTime, toCsv } from '../lib/util';

export function EventsPage() {
  const events = useMonitor((s) => s.events);
  const devices = useMonitor((s) => s.devices);
  const clearEvents = useMonitor((s) => s.clearEvents);

  const [severity, setSeverity] = useState<'all' | Severity>('all');
  const [source, setSource] = useState<'all' | EventLog['source']>('all');
  const [deviceId, setDeviceId] = useState<'all' | string>('all');
  const [q, setQ] = useState('');
  const [paused, setPaused] = useState(false);

  // While paused, we snapshot the events list so it doesn't move under the user.
  const [snapshot, setSnapshot] = useState<EventLog[] | null>(null);
  const list = paused ? (snapshot ?? events) : events;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return list.filter((e) => {
      if (severity !== 'all' && e.severity !== severity) return false;
      if (source !== 'all' && e.source !== source) return false;
      if (deviceId !== 'all' && e.deviceId !== deviceId) return false;
      if (needle && !e.message.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [list, severity, source, deviceId, q]);

  const togglePause = () => {
    if (!paused) setSnapshot([...events]);
    else setSnapshot(null);
    setPaused((p) => !p);
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['time', 'severity', 'source', 'device', 'checkId', 'message'],
      ...filtered.map((e) => [
        fmtDateTime(e.t),
        e.severity,
        e.source,
        devices.find((d) => d.id === e.deviceId)?.name ?? e.deviceId ?? '',
        e.checkId ?? '',
        e.message,
      ]),
    ];
    downloadFile(`events-${Date.now()}.csv`, toCsv(rows));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          className="flex-1 min-w-[240px]"
          placeholder="Search messages…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={severity} onChange={(e) => setSeverity(e.target.value as 'all' | Severity)} className="w-36">
          <option value="all">All severities</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="critical">Critical</option>
        </Select>
        <Select value={source} onChange={(e) => setSource(e.target.value as 'all' | EventLog['source'])} className="w-36">
          <option value="all">All sources</option>
          <option value="engine">Engine</option>
          <option value="check">Check</option>
          <option value="alert">Alert</option>
          <option value="user">User</option>
        </Select>
        <Select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="w-52">
          <option value="all">All devices</option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Button variant="outline" onClick={togglePause}>
          {paused ? <><Play className="w-3.5 h-3.5" /> Resume stream</> : <><Pause className="w-3.5 h-3.5" /> Pause stream</>}
        </Button>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
        <Button variant="danger" onClick={() => { if (confirm('Clear all events?')) clearEvents(); }}>
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </Button>
      </div>

      <Card
        title="Event stream"
        action={
          <div className="text-xs text-slate-500">
            {filtered.length} shown / {events.length} in buffer
            {paused && <span className="ml-2 text-amber-300">· paused</span>}
          </div>
        }
      >
        {filtered.length === 0 ? (
          <Empty>No events match your filters.</Empty>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto font-mono text-xs">
            {filtered.map((e) => {
              const dev = devices.find((d) => d.id === e.deviceId);
              return (
                <div
                  key={e.id}
                  className="grid grid-cols-[9rem_5rem_5rem_10rem_1fr] gap-3 items-center py-1.5 border-b border-slate-800/40 hover:bg-slate-900/40 px-2"
                >
                  <span className="text-slate-500">{fmtDateTime(e.t)}</span>
                  <SeverityBadge severity={e.severity} />
                  <span className="text-slate-400 uppercase text-[10px] tracking-wider">{e.source}</span>
                  <span className="text-slate-300 truncate">{dev?.name ?? '—'}</span>
                  <span className="text-slate-200 break-words">{e.message}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
