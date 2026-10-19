import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  LayoutDashboard,
  Menu,
  Pause,
  Play,
  Radio,
  ScrollText,
  Server,
  X,
} from 'lucide-react';
import { useMonitor } from './store/monitor';
import { Dashboard } from './pages/Dashboard';
import { DevicesPage } from './pages/Devices';
import { EventsPage } from './pages/Events';
import { AlertsPage } from './pages/Alerts';
import { ReportsPage } from './pages/Reports';

type Route = 'dashboard' | 'devices' | 'events' | 'alerts' | 'reports';

const routeMeta: Record<Route, { label: string; eyebrow: string; description: string }> = {
  dashboard: { label: 'Dashboard', eyebrow: 'Operations overview', description: 'Monitor infrastructure health in real time.' },
  devices: { label: 'Devices', eyebrow: 'Infrastructure inventory', description: 'Manage devices and their monitoring checks.' },
  events: { label: 'Events', eyebrow: 'Activity stream', description: 'Review system activity and operational changes.' },
  alerts: { label: 'Alerts', eyebrow: 'Incident center', description: 'Triage active incidents and alert policies.' },
  reports: { label: 'Reports', eyebrow: 'Performance analytics', description: 'Review uptime, latency, and service trends.' },
};

const navItems = [
  { id: 'dashboard' as Route, icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'devices' as Route, icon: Server, label: 'Devices' },
  { id: 'events' as Route, icon: ScrollText, label: 'Events' },
  { id: 'alerts' as Route, icon: Bell, label: 'Alerts' },
  { id: 'reports' as Route, icon: BarChart3, label: 'Reports' },
];

export default function App() {
  const [route, setRoute] = useState<Route>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const running = useMonitor((s) => s.running);
  const setRunning = useMonitor((s) => s.setRunning);
  const simSpeed = useMonitor((s) => s.simSpeed);
  const setSimSpeed = useMonitor((s) => s.setSimSpeed);
  const alerts = useMonitor((s) => s.alerts);
  const activeAlerts = alerts.filter((a) => a.state !== 'resolved').length;
  const meta = routeMeta[route];

  useEffect(() => {
    const id = window.setInterval(() => useMonitor.getState().tick(), 2000);
    useMonitor.getState().tick();
    return () => window.clearInterval(id);
  }, []);

  const navigate = (nextRoute: Route) => {
    setRoute(nextRoute);
    setMobileNavOpen(false);
  };

  const Navigation = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={mobile ? 'space-y-1' : 'space-y-1.5'} aria-label="Primary navigation">
      {navItems.map(({ id, icon: Icon, label }) => {
        const active = route === id;
        return (
          <button
            key={id}
            onClick={() => navigate(id)}
            className={`nav-item ${active ? 'nav-item-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="h-[18px] w-[18px]" />
            <span>{label}</span>
            {id === 'alerts' && activeAlerts > 0 && <span className="nav-badge">{activeAlerts}</span>}
          </button>
        );
      })}
    </nav>
  );

  const EngineControl = () => (
    <section className="engine-panel">
      <div className="section-label">Simulation engine</div>
      <div className="engine-status">
        <span className={`status-orb ${running ? 'status-orb-live' : 'status-orb-paused'}`} />
        <span>{running ? 'Streaming live data' : 'Stream paused'}</span>
      </div>
      <button className="engine-button" onClick={() => setRunning(!running)}>
        {running ? <><Pause className="h-3.5 w-3.5" /> Pause stream</> : <><Play className="h-3.5 w-3.5" /> Resume stream</>}
      </button>
      <label className="speed-control">
        <span>Simulation speed</span>
        <strong>{simSpeed}×</strong>
        <input type="range" min={1} max={120} step={1} value={simSpeed} onChange={(e) => setSimSpeed(Number(e.target.value))} />
      </label>
    </section>
  );

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <div className="brand-block">
          <div className="brand-mark"><Radio className="h-5 w-5" /><span /></div>
          <div><div className="brand-name">NetPulse</div><div className="brand-subtitle">Network observability</div></div>
        </div>
        <div className="sidebar-heading">Workspace</div>
        <Navigation />
        <div className="sidebar-spacer" />
        <EngineControl />
        <div className="sidebar-footer"><span className="footer-dot" /> All systems connected</div>
      </aside>

      {mobileNavOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`mobile-sidebar ${mobileNavOpen ? 'mobile-sidebar-open' : ''}`}>
        <div className="brand-block"><div className="brand-mark"><Radio className="h-5 w-5" /><span /></div><div><div className="brand-name">NetPulse</div><div className="brand-subtitle">Network observability</div></div><button className="icon-button ml-auto" onClick={() => setMobileNavOpen(false)}><X className="h-5 w-5" /></button></div>
        <div className="sidebar-heading">Workspace</div><Navigation mobile /><div className="sidebar-spacer" /><EngineControl />
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-left"><button className="mobile-menu-button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></button><div className="breadcrumb"><span>NetPulse</span><span>/</span><strong>{meta.label}</strong></div></div>
          <div className="topbar-right"><div className="connection-chip"><span className="footer-dot" /> Live connection</div>{activeAlerts > 0 && <div className="alert-chip"><AlertTriangle className="h-3.5 w-3.5" /> {activeAlerts} active</div>}</div>
        </header>
        <div className="content-shell">
          <div className="page-heading"><div><div className="page-eyebrow">{meta.eyebrow}</div><h1>{meta.label}</h1><p>{meta.description}</p></div><div className="page-live"><Activity className="h-4 w-4" /><span>Updated live</span></div></div>
          <div className="page-content">
            {route === 'dashboard' && <Dashboard />}
            {route === 'devices' && <DevicesPage />}
            {route === 'events' && <EventsPage />}
            {route === 'alerts' && <AlertsPage />}
            {route === 'reports' && <ReportsPage />}
          </div>
        </div>
      </main>
    </div>
  );
}
