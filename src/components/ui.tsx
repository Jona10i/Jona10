import type { ReactNode } from 'react';
import type { Severity, Status } from '../lib/types';

// ---- Status pill / dot ----
export const StatusDot = ({ status, size = 8 }: { status: Status; size?: number }) => {
  const color =
    status === 'up' ? 'text-emerald-400' :
    status === 'degraded' ? 'text-amber-400' :
    status === 'down' ? 'text-rose-500' :
    'text-slate-500';
  return (
    <span
      className={`inline-block rounded-full ${color} pulse-dot`}
      style={{ width: size, height: size, backgroundColor: 'currentColor' }}
      aria-label={status}
    />
  );
};

export const StatusPill = ({ status }: { status: Status }) => {
  const c: Record<Status, string> = {
    up: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    degraded: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    down: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    unknown: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${c[status]}`}
    >
      <StatusDot status={status} size={6} />
      {status}
    </span>
  );
};

export const SeverityBadge = ({ severity }: { severity: Severity }) => {
  const c: Record<Severity, string> = {
    info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    warn: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    critical: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${c[severity]}`}
    >
      {severity}
    </span>
  );
};

// ---- Card ----
export const Card = ({
  children,
  className = '',
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
}) => (
  <div
    className={`bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur ${className}`}
  >
    {(title || action) && (
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200 tracking-wide uppercase">{title}</h3>
        {action}
      </div>
    )}
    <div className="p-5">{children}</div>
  </div>
);

export const KpiCard = ({
  label,
  value,
  hint,
  tone = 'slate',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';
  icon?: ReactNode;
}) => {
  const toneMap: Record<string, string> = {
    slate: 'from-slate-800/50 to-slate-900/50 text-slate-100',
    emerald: 'from-emerald-500/10 to-slate-900/50 text-emerald-200',
    amber: 'from-amber-500/10 to-slate-900/50 text-amber-200',
    rose: 'from-rose-500/10 to-slate-900/50 text-rose-200',
    sky: 'from-sky-500/10 to-slate-900/50 text-sky-200',
    violet: 'from-violet-500/10 to-slate-900/50 text-violet-200',
  };
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br ${toneMap[tone]} p-5`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-slate-400">{label}</div>
          <div className="mt-2 text-3xl font-semibold">{value}</div>
          {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
        </div>
        {icon && <div className="opacity-80">{icon}</div>}
      </div>
    </div>
  );
};

// ---- Button ----
type BtnVariant = 'primary' | 'ghost' | 'danger' | 'outline';
export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: 'sm' | 'md';
}) => {
  const v: Record<BtnVariant, string> = {
    primary:
      'bg-cyan-500 hover:bg-cyan-400 text-slate-900 border-cyan-400 shadow-[0_0_20px_-6px_rgba(34,211,238,0.6)]',
    ghost:
      'bg-transparent hover:bg-slate-800 text-slate-200 border-transparent',
    outline:
      'bg-slate-800/60 hover:bg-slate-800 text-slate-200 border-slate-700',
    danger:
      'bg-rose-500/90 hover:bg-rose-500 text-white border-rose-400',
  };
  const s = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm';
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 rounded-lg border font-medium transition ${v[variant]} ${s} disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    />
  );
};

// ---- Modal ----
export const Modal = ({
  open,
  onClose,
  title,
  children,
  footer,
  maxW = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxW?: string;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm slide-in" onClick={onClose}>
      <div
        className={`w-full ${maxW} rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="font-semibold text-slate-100">{title}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

// ---- Simple form primitives ----
export const Label = ({ children }: { children: ReactNode }) => (
  <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">{children}</label>
);
export const TextInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full bg-slate-950/60 border border-slate-700 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 rounded-lg px-3 py-1.5 text-sm text-slate-100 outline-none ${props.className ?? ''}`}
  />
);
export const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className={`w-full bg-slate-950/60 border border-slate-700 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 rounded-lg px-3 py-1.5 text-sm text-slate-100 outline-none ${props.className ?? ''}`}
  />
);

// ---- Empty state ----
export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="text-center py-12 text-slate-500 text-sm">{children}</div>
);
