import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  LayoutDashboard,
  Pause,
  Play,
  Radio,
  ScrollText,
  Server,
} from 'lucide-react';
import { useMonitor } from './store/monitor';
import { Dashboard } from './pages/Dashboard';
import { DevicesPage } from './pages/Devices';
import { EventsPage } from './pages/Events';
import { AlertsPage } from './pages/Alerts';
import { ReportsPage } from './pages/Reports';

type Route = 'dashboard' | 'devices' | 'events' | 'alerts' | 'reports';

export default function App() {
  const [route, setRoute] = useState<Route>('dashboard');
  const running = useMonitor((s) => s.running);
  const setRunning = useMonitor((s) => s.setRunning);
  const simSpeed = useMonitor((s) => s.simSpeed);
  const setSimSpeed = useMonitor((s) => s.setSimSpeed);
  const alerts = useMonitor((s) => s.alerts);
  const activeAlerts = alerts.filter((a) => a.state !== 'resolved').length;

  // Global tick loop — the heartbeat of the simulated engine.
  useEffect(() => {
    const id = window.setInterval(() => useMonitor.getState().tick(), 2000);
    // Also kick immediately so the first render has data quickly.
    useMonitor.getState().tick();
    return () => window.clearInterval(id);
  }, []);

  const NavItem = ({
    id,
    icon: Icon,
    label,
    badge,
  }: {
    id: Route;
    icon: React.ElementType;
    label: string;
    badge?: number;
  }) => {
    const active = route === id;
    return (
      <button
        onClick={() => setRoute(id)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition
          ${active
            ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'}`}
      >
        <Icon className="w-4 h-4" />
        <span className="flex-1 text-left">{label}</span>
        {typeof badge === 'number' && badge > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-slate-800/80 bg-slate-950/60 backdrop-blur px-4 py-5 flex flex-col">
        <div className="flex items-center gap-2 mb-6">
          <div className="relative">
            <Radio className="w-7 h-7 text-cyan-400" />
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100 leading-tight">NetPulse</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Live Monitor</div>
          </div>
        </div>

        <nav className="space-y-1 flex-1">
          <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavItem id="devices" icon={Server} label="Devices" />
          <NavItem id="events" icon={ScrollText} label="Events" />
          <NavItem id="alerts" icon={Bell} label="Alerts" badge={activeAlerts} />
          <NavItem id="reports" icon={BarChart3} label="Reports" />
        </nav>

        <div className="mt-4 border-t border-slate-800 pt-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Engine</div>
          <div className="flex items-center gap-2 mb-3">
            <span className={`w-2 h-2 rounded-full ${running ? 'bg-emerald-400 pulse-dot' : 'bg-slate-500'}`} />
            <span className="text-xs text-slate-300">{running ? 'Streaming' : 'Paused'}</span>
          </div>
          <button
            onClick={() => setRunning(!running)}
            className={`w-full flex items-center justify-center gap-1.5 text-xs rounded-lg py-1.5 border transition
              ${running
                ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                : 'border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10'}`}
          >
            {running ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Resume</>}
          </button>
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-slate-400">Sim speed</span>
              <span className="text-slate-200 font-mono">{simSpeed}×</span>
            </div>
            <input
              type="range"
              min={1}
              max={120}
              step={1}
              value={simSpeed}
              onChange={(e) => setSimSpeed(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-800/80 px-6 flex items-center justify-between bg-slate-950/40 backdrop-blur">
          <div className="flex items-center gap-3">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h1 className="text-sm font-medium text-slate-200 capitalize">{route}</h1>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {activeAlerts > 0 && (
              <span className="flex items-center gap-1.5 text-rose-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                {activeAlerts} active
              </span>
            )}
            <span>
              Connected · WS <span className="text-emerald-400 font-mono">simulated</span>
            </span>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          {route === 'dashboard' && <Dashboard />}
          {route === 'devices' && <DevicesPage />}
          {route === 'events' && <EventsPage />}
          {route === 'alerts' && <AlertsPage />}
          {route === 'reports' && <ReportsPage />}
        </div>
      </main>
    </div>
  );
}
