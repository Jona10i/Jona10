import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Shield, Clock, User as UserIcon, Activity, Filter, Info, AlertTriangle, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { cn, formatDate as format } from '../lib/utils';
import { useFirebase } from './FirebaseProvider';
import { Permission } from '../lib/rbac';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface AuditLog {
  id: string;
  type: 'auth' | 'file' | 'channel' | 'system';
  action: string;
  userId: string;
  userName: string;
  companyName?: string;
  details?: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'critical';
}

export const AuditLogView: React.FC = () => {
  const { t } = useTranslation();
  const { hasPerm, profile } = useFirebase();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  if (!hasPerm(Permission.VIEW_AUDIT_LOGS)) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-slate-50">
        <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
        <p className="text-slate-500 mt-2">You do not have permission to view audit logs.</p>
      </div>
    );
  }

  useEffect(() => {
    const q = query(
      collection(db, 'audit_logs'),
      orderBy('timestamp', 'desc'),
      limit(200)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }) as AuditLog)
        .filter(log => log.companyName === profile?.companyName);
      setLogs(logsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <ShieldAlert className="w-4 h-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getLogTypeBadge = (type: string) => {
    const colors = {
      auth: 'bg-blue-50 text-blue-600 border-blue-100',
      file: 'bg-indigo-50 text-indigo-600 border-indigo-100',
      channel: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      system: 'bg-slate-50 text-slate-600 border-slate-100'
    };
    return (
      <span className={cn(
        "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
        colors[type as keyof typeof colors] || colors.system
      )}>
        {type}
      </span>
    );
  };

  const chartData = useMemo(() => {
    const dataMap = new Map<string, any>();
    const sortedLogs = [...logs].sort((a, b) => a.timestamp - b.timestamp);
    
    sortedLogs.forEach(log => {
        const label = format(new Date(log.timestamp), 'MMM dd, HH:00');
        
        if (!dataMap.has(label)) {
            dataMap.set(label, {
                timeLabel: label,
                auth: 0,
                file: 0,
                channel: 0,
                system: 0,
            });
        }
        
        const current = dataMap.get(label)!;
        current[log.type] = (current[log.type] || 0) + 1;
    });
    return Array.from(dataMap.values());
  }, [logs]);

  return (
    <div className="flex-1 flex flex-col bg-slate-50 h-full overflow-hidden">
      <div className="p-8 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2 text-workspace-accent mb-1">
          <Shield className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-[0.2em]">{t('sidebar.auditLogs')}</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t('audit.title')}</h1>
        <p className="text-slate-500 text-sm mt-1">{t('audit.subtitle')}</p>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          {chartData.length > 0 && (
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 mb-8">
              <h3 className="text-sm font-bold text-slate-900 mb-6 px-2">{t('audit.frequency', 'Activity Frequency')}</h3>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 0, right: 20, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="timeLabel" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#94a3b8' }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#94a3b8' }} 
                      allowDecimals={false}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold', color: '#0f172a' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                    <Bar dataKey="auth" name="Auth" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="file" name="File" stackId="a" fill="#6366f1" />
                    <Bar dataKey="channel" name="Channel" stackId="a" fill="#10b981" />
                    <Bar dataKey="system" name="System" stackId="a" fill="#94a3b8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{t('audit.event')}</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{t('audit.user')}</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{t('audit.time')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  <AnimatePresence mode="popLayout">
                    {logs.map((log, index) => (
                      <motion.tr 
                        key={log.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="hover:bg-slate-50/50 transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-4">
                            <div className="mt-1">{getSeverityIcon(log.severity)}</div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-bold text-slate-900">{log.action}</p>
                                {getLogTypeBadge(log.type)}
                              </div>
                              <p className="text-xs text-slate-500 line-clamp-1">{log.details}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                              <UserIcon className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-900">{log.userName}</p>
                              <p className="text-[10px] text-slate-400 font-mono tracking-tighter uppercase">{log.userId.slice(0, 8)}...</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-slate-400 group-hover:text-workspace-accent transition-colors">
                            <Clock className="w-3 h-3" />
                            <span className="text-[10px] font-bold">
                              {format(log.timestamp, "yyyy-MM-dd HH:mm:ss")}
                            </span>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>

                  {loading && (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center">
                        <Activity className="w-6 h-6 text-slate-300 animate-spin mx-auto mb-2" />
                        <p className="text-xs text-slate-400 font-black uppercase tracking-widest">{t('common.loading')}</p>
                      </td>
                    </tr>
                  )}

                  {!loading && logs.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center">
                        <Shield className="w-8 h-8 text-slate-200 mx-auto mb-4" />
                        <p className="text-sm font-bold text-slate-400">{t('audit.noLogs')}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
