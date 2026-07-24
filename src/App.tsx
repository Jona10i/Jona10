import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { FirebaseProvider, useFirebase } from './components/FirebaseProvider';
import { CompanyOnboarding } from './components/CompanyOnboarding';
import { Sidebar } from './components/Sidebar';
import { ChatRoom } from './components/ChatRoom';
import { db } from './lib/firebase';
import { collection, query, limit, getDocs, doc, getDoc, setDoc, onSnapshot, collectionGroup, where, orderBy } from 'firebase/firestore';
import { Monitor, Shield, ArrowRight, Zap, CloudOff, Aperture, MessageSquare, X, Menu, WifiOff, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Message } from './types';
import { logger } from './lib/logger';
import { UserProfileProvider } from './components/UserProfileProvider';
import { ReminderNotifier } from './components/ReminderNotifier';
import { MailView } from './components/MailView';

const FileBrowser = lazy(() => import('./components/FileBrowser').then(m => ({ default: m.FileBrowser })));
const AuditLogView = lazy(() => import('./components/AuditLogView').then(m => ({ default: m.AuditLogView })));
const AppUpdatesView = lazy(() => import('./components/AppUpdatesView').then(m => ({ default: m.AppUpdatesView })));
const FontCatalogView = lazy(() => import('./components/FontCatalogView').then(m => ({ default: m.FontCatalogView })));
const MeetView = lazy(() => import('./components/MeetView').then(m => ({ default: m.MeetView })));
// Lazy: pulls recharts (~300 kB) out of the initial bundle; rendered inside the
// view-area <Suspense> like the other secondary views.
const ScheduleView = lazy(() => import('./components/ScheduleView').then(m => ({ default: m.ScheduleView })));

function Dashboard() {
  const { user, profile } = useFirebase();
  const [lastView, setLastView] = useState<{id: string, type: 'channel' | 'dm' | 'files' | 'audit' | 'schedule' | 'updates' | 'mail' | 'fonts' | 'meet'}>({ id: 'general', type: 'channel' });
  const [activeChannelName, setActiveChannelName] = useState('general');
  const [viewMode, setViewMode] = useState<'bubble' | 'medium' | 'full'>('full');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<Message[]>([]);
  const [showToast, setShowToast] = useState(false);
  const lastInteractionRef = useRef(Date.now());
  const mainRef = useRef<HTMLElement>(null);

  // Initialize generic channel if empty
  useEffect(() => {
    const initChannels = async () => {
      try {
        const genRef = doc(db, 'channels', 'general');
        const snap = await getDoc(genRef);
        if (!snap.exists()) {
          await setDoc(genRef, {
            name: 'general',
            description: 'Company-wide channel',
            isPrivate: false,
            members: [user?.uid]
          });
          logger.info('Initialized general channel automatically');
        }
      } catch (e: any) {
        if (e?.message?.includes('client is offline') || e?.code === 'unavailable') {
          logger.info('Skipping channel initialization (client is offline)');
        } else {
          logger.error("Channel setup error", e);
        }
      }
    };
    if (user) initChannels();
  }, [user]);

  // Global message listener for notifications with exponential backoff
  useEffect(() => {
    if (!user) return;

    let unsubscribe: () => void = () => {};
    let backoffTimeout: NodeJS.Timeout;
    let retryCount = 0;
    const maxBackoff = 60000; // Cap backoff at 1 minute
    let isSubscribed = true;

    const setupListener = () => {
      if (!isSubscribed) return;
      if (unsubscribe) unsubscribe();

      const startTime = Date.now();
      const q = query(
        collectionGroup(db, 'messages'),
        where('timestamp', '>', startTime),
        orderBy('timestamp', 'desc'),
        limit(1)
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        retryCount = 0; // Reset backoff on success
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const msg = { id: change.doc.id, ...change.doc.data() } as Message;
            if (msg.senderId !== user.uid) {
              setNotifications(prev => [msg, ...prev].slice(0, 5));
              if (viewMode === 'bubble') {
                setShowToast(true);
                // Auto hide toast after 5 seconds
                setTimeout(() => setShowToast(false), 5000);
              }
            }
          }
        });
      }, (error: any) => {
        logger.warn("Notification listener failed", { error: error.message });
        if (!isSubscribed) return;
        
        // Exponential backoff strategy
        const delay = Math.min(1000 * Math.pow(2, retryCount), maxBackoff);
        retryCount++;
        logger.info(`Retrying listener in ${delay}ms (attempt ${retryCount})`);
        
        backoffTimeout = setTimeout(() => {
          setupListener();
        }, delay);
      });
    };

    setupListener();

    // Trigger immediate reconnect when coming back online
    const handleOnline = () => {
      logger.info('Network online detected, instantly attempting to reconnect Firebase listeners');
      clearTimeout(backoffTimeout);
      retryCount = 0;
      setupListener();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      isSubscribed = false;
      if (unsubscribe) unsubscribe();
      clearTimeout(backoffTimeout);
      window.removeEventListener('online', handleOnline);
    };
  }, [user, viewMode]);

  const handleSelect = async (id: string, type: 'channel' | 'dm' | 'files' | 'audit' | 'schedule' | 'updates' | 'mail' | 'fonts' | 'meet') => {
    try {
    setLastView({ id, type });
    if (type === 'channel') {
      const snap = await getDocs(collection(db, 'channels'));
      const channel = snap.docs.find(d => d.id === id);
      setActiveChannelName(channel?.data()?.name || 'general');
    } else if (type === 'dm') {
      const snap = await getDocs(collection(db, 'users'));
      const u = snap.docs.find(d => d.id === id);
      setActiveChannelName(u?.data()?.name || 'User');
    } else if (type === 'files') {
      setActiveChannelName('Workspace Files');
    } else if (type === 'schedule') {
      setActiveChannelName('Schedule & Reminders');
    } else if (type === 'updates') {
      setActiveChannelName('App Updates');
    } else if (type === 'mail') {
      setActiveChannelName('Mail');
    } else if (type === 'fonts') {
      setActiveChannelName('Font Catalog');
    } else if (type === 'meet') {
      setActiveChannelName('Google Meet');
    } else {
      setActiveChannelName('Audit Logs');
    }
    } catch(err) {
      console.error(err);
    }
  };

  const clearNotifications = () => {
    setNotifications([]);
    setShowToast(false);
    setViewMode('medium');
  };

  if (viewMode === 'bubble') {
    return (
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3">
        <AnimatePresence>
          {showToast && notifications.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10, x: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10, x: 20 }}
              className="mb-2 mr-2 w-64 bg-white/90 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-4 flex items-start gap-3 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-workspace-accent" />
              <div className="w-8 h-8 rounded-full bg-slate-100 flex-shrink-0 flex items-center justify-center font-bold text-xs text-slate-600">
                {notifications[0].senderName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">{notifications[0].senderName}</p>
                <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{notifications[0].content}</p>
              </div>
              <button 
                onClick={() => setShowToast(false)}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          layoutId="app-frame"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={clearNotifications}
          className="w-20 h-20 bg-gradient-to-br from-workspace-accent to-blue-600 rounded-[28px] shadow-[0_20px_50px_rgba(37,99,235,0.3)] flex items-center justify-center text-white relative group border border-white/20"
        >
          <div className="absolute inset-0 bg-workspace-accent/20 rounded-[28px] animate-pulse blur-xl" />
          <motion.div
            animate={{ rotate: notifications.length > 0 ? [0, -10, 10, -10, 10, 0] : 0 }}
            transition={{ 
              rotate: notifications.length > 0 ? { duration: 0.5, repeat: Infinity, repeatDelay: 2 } : { duration: 10, repeat: Infinity, ease: "linear" }
            }}
            className="relative z-10"
          >
            {notifications.length > 0 ? (
              <MessageSquare className="w-10 h-10" />
            ) : (
              <Aperture className="w-10 h-10" />
            )}
          </motion.div>
          
          {notifications.length > 0 ? (
            <div className="absolute -top-1 -right-1 min-w-[24px] h-6 px-1.5 bg-red-500 border-4 border-white rounded-full z-20 shadow-md flex items-center justify-center text-[10px] font-black">
              {notifications.length}
            </div>
          ) : (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 border-4 border-white rounded-full z-20 shadow-md" />
          )}

          <div className="absolute right-full mr-4 bg-slate-900/90 backdrop-blur-md text-white text-[10px] uppercase tracking-widest font-bold px-4 py-2 rounded-xl border border-white/10 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 pointer-events-none">
            {notifications.length > 0 ? `Resume (${notifications.length} Unread)` : 'Resume Sync'}
          </div>
        </motion.button>
      </div>
    );
  }

  return (
    <div 
      className={viewMode === 'medium' ? "fixed inset-0 flex items-center justify-center p-4 md:p-12 bg-slate-900/50 backdrop-blur-sm z-50" : "fixed inset-0 z-50 overflow-hidden"}
      style={{ fontFamily: profile?.appFontFamily ? `"${profile.appFontFamily}", sans-serif` : undefined }}
    >
      <motion.div 
        layoutId="app-frame"
        className={
          viewMode === 'medium' 
            ? "w-full h-full max-w-5xl max-h-[85vh] bg-workspace-bg overflow-hidden flex border border-white/20 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] rounded-[2.5rem] relative"
            : "flex w-screen h-screen bg-workspace-bg overflow-hidden"
        }
      >
        <Sidebar 
          activeId={lastView.id} 
          viewMode={viewMode}
          isCollapsed={sidebarCollapsed}
          mobileOpen={mobileMenuOpen}
          onSetMobileOpen={setMobileMenuOpen}
          onSelect={(id, type) => {
            handleSelect(id, type);
            setMobileMenuOpen(false); // Auto close on select
          }} 
          onSetViewMode={setViewMode}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <main ref={mainRef} className="flex-1 flex flex-col h-full bg-workspace-bg relative min-w-0 md:min-w-auto">
          {/* Mobile Menu Toggle Button */}
          <motion.div 
            className="md:hidden absolute top-4 left-4 z-50"
            drag
            dragConstraints={mainRef}
            dragMomentum={false}
          >
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-3 bg-workspace-accent shadow-xl shadow-workspace-accent/30 rounded-2xl text-white active:scale-95 transition-transform"
            >
              <Menu className="w-5 h-5" />
            </button>
          </motion.div>
          <Suspense fallback={
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-slate-100 border-t-workspace-accent rounded-full animate-spin" />
            </div>
          }>
            <AnimatePresence mode="wait">
              {lastView.type === 'files' ? (
                <motion.div 
                  key="files"
                  initial={{ opacity: 0, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, filter: 'blur(10px)' }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="flex-1 flex flex-col w-full h-full"
                >
                  <FileBrowser />
                </motion.div>
              ) : lastView.type === 'audit' ? (
                <motion.div 
                  key="audit"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="flex-1 flex flex-col w-full h-full"
                >
                  <AuditLogView />
                </motion.div>
              ) : lastView.type === 'schedule' ? (
                <motion.div 
                  key="schedule"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="flex-1 flex flex-col w-full h-full"
                >
                  <ScheduleView />
                </motion.div>
              ) : lastView.type === 'updates' ? (
                <motion.div 
                  key="updates"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="flex-1 flex flex-col w-full h-full"
                >
                  <AppUpdatesView />
                </motion.div>
              ) : lastView.type === 'mail' ? (
                <motion.div 
                  key="mail"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="flex-1 flex flex-col w-full h-full"
                >
                  <MailView />
                </motion.div>
              ) : lastView.type === 'fonts' ? (
                <motion.div 
                  key="fonts"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="flex-1 flex flex-col w-full h-full"
                >
                  <FontCatalogView />
                </motion.div>
              ) : lastView.type === 'meet' ? (
                <motion.div 
                  key="meet"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="flex-1 flex flex-col w-full h-full"
                >
                  <MeetView />
                </motion.div>
              ) : (
                <motion.div 
                  key={lastView.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="flex-1 flex flex-col w-full h-full"
                >
                  <ChatRoom id={lastView.id} type={lastView.type} name={activeChannelName} onMinimize={() => setViewMode('bubble')} />
                </motion.div>
              )}
            </AnimatePresence>
          </Suspense>
        </main>
      </motion.div>
    </div>
  );
}

function Login() {
  const { signIn } = useFirebase();

  return (
    <div className="h-screen w-full flex items-center justify-center p-6 relative overflow-hidden bg-white">
      {/* Background accents */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-50/50 rounded-full blur-3xl -mr-64 -mt-64" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-slate-50/80 rounded-full blur-3xl -ml-64 -mb-64" />

      <div className="max-w-md w-full relative z-10 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="w-16 h-16 bg-workspace-accent rounded-2xl mx-auto shadow-2xl shadow-workspace-accent/30 flex items-center justify-center mb-6">
            <Monitor className="text-white w-8 h-8" />
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-3">SwiftyDrop</h1>
          <p className="text-slate-500 font-medium">The high-velocity office file link. No drives. Just drop.</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-2 rounded-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-slate-100"
        >
          <div className="p-8 space-y-8">
            <div className="space-y-4">
              <div className="flex items-start gap-4 text-left p-4 rounded-2xl bg-slate-50/80 border border-slate-100">
                <div className="p-2 bg-white rounded-xl shadow-sm text-workspace-accent">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Workspace Isolation</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Files are encrypted and scoped to your organization identity.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4 text-left p-4 rounded-2xl bg-slate-50/80 border border-slate-100">
                <div className="p-2 bg-white rounded-xl shadow-sm text-workspace-accent">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Instant Streaming</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Real-time sync ensures everyone has the latest assets instantly.</p>
                </div>
              </div>
            </div>

            <button 
              onClick={signIn}
              className="w-full flex items-center justify-between px-6 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-black transition-all group overflow-hidden relative shadow-xl active:scale-[0.98]"
            >
              <div className="relative z-10 flex items-center gap-3">
                <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="" />
                <span>Continue to Workspace</span>
              </div>
              <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 translate-y-full group-hover:translate-y-0 transition-transform duration-300 opacity-20" />
            </button>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-12 flex items-center justify-center gap-6 text-slate-400"
        >
          <div className="flex items-center gap-2">
            <CloudOff className="w-4 h-4 opacity-50" />
            <span className="text-[10px] uppercase tracking-widest font-bold">Physical Drive Free Zone</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Main() {
  const { user, profile, loading } = useFirebase();

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-workspace-accent/20 border-t-workspace-accent rounded-full animate-spin" />
          <p className="text-[10px] font-mono tracking-widest uppercase text-slate-400">Loading Workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  if (!profile) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-workspace-accent/20 border-t-workspace-accent rounded-full animate-spin" />
          <p className="text-[10px] font-mono tracking-widest uppercase text-slate-400">Verifying Credentials...</p>
        </div>
      </div>
    );
  }

  if (!profile.companyName) {
    return <CompanyOnboarding />;
  }

  return <Dashboard />;
}

type ProbeResult = 'ok' | 'ws-blocked' | 'unreachable';

function NetworkCheck() {
  const [result, setResult] = useState<ProbeResult>('ok');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const sockets = new Set<WebSocket>();

    const later = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(() => { timers.delete(t); resolve(); }, ms);
        timers.add(t);
      });

    // One WebSocket attempt against the origin probe endpoint.
    const tryWebSocket = (timeoutMs: number) =>
      new Promise<boolean>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout>;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          timers.delete(timer);
          resolve(ok);
        };
        let ws: WebSocket;
        try {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          ws = new WebSocket(`${protocol}//${window.location.host}/_ws_test_connection`);
          sockets.add(ws);
        } catch {
          done(false);
          return;
        }
        timer = setTimeout(() => done(false), timeoutMs);
        timers.add(timer);
        ws.onopen = () => done(true);
        ws.onerror = () => done(false);
      });

    const probe = async () => {
      // Step 1: plain HTTP -- is the origin reachable through the proxy at all?
      try {
        const res = await fetch('/_ws_test_connection', { cache: 'no-store' });
        if (!res.ok) throw new Error(`status ${res.status}`);
      } catch {
        if (!cancelled) setResult('unreachable');
        return;
      }
      // Step 2: WebSocket, with one retry after a short pause so a slow or
      // transient proxy path doesn't raise a false alarm.
      if (await tryWebSocket(2500)) return;
      await later(1200);
      if (cancelled) return;
      if (await tryWebSocket(2500)) return;
      if (!cancelled) setResult('ws-blocked');
    };

    probe();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      // Only close established sockets: closing a CONNECTING one logs
      // "WebSocket was closed before the connection was established".
      sockets.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) ws.close();
      });
    };
  }, []);

  // The ws-blocked notice is informational (the app falls back to HTTPS
  // transports), so it auto-dismisses; the unreachable warning stays put.
  useEffect(() => {
    if (result !== 'ws-blocked') return;
    const t = setTimeout(() => setDismissed(true), 10000);
    return () => clearTimeout(t);
  }, [result]);

  if (result === 'ok' || dismissed) return null;

  const unreachable = result === 'unreachable';

  return (
    <div className={`fixed top-0 left-0 right-0 z-[99999] ${unreachable ? 'bg-amber-500' : 'bg-slate-700'} text-white px-4 py-3 flex items-start sm:items-center justify-between text-sm shadow-md`}>
      <div className="flex items-start sm:items-center gap-3">
        {unreachable
          ? <WifiOff className="w-5 h-5 flex-shrink-0 mt-0.5 sm:mt-0" />
          : <Info className="w-5 h-5 flex-shrink-0 mt-0.5 sm:mt-0" />}
        <div className="flex flex-col sm:flex-row sm:gap-2 items-start sm:items-center">
          <strong>{unreachable ? 'Network Warning:' : 'Network Notice:'}</strong>
          <span>
            {unreachable
              ? 'Cannot reach the server through this connection. Real-time features are offline.'
              : 'This proxy blocks WebSockets. The app uses HTTPS fallback, so everything still works.'}
          </span>
          {unreachable && (
            <button
              onClick={() => window.location.reload()}
              className="mt-1 sm:mt-0 px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-semibold tracking-wide flex items-center gap-1 transition-colors"
            >
              Refresh Connection
            </button>
          )}
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className={`p-1 ${unreachable ? 'hover:bg-amber-600' : 'hover:bg-slate-600'} rounded-lg transition-colors flex-shrink-0 ml-4`}
        aria-label="Dismiss notice"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

export default function App() {
  return (
    <FirebaseProvider>
      <UserProfileProvider>
        <NetworkCheck />
        <ReminderNotifier />
        <Main />
      </UserProfileProvider>
    </FirebaseProvider>
  );
}
