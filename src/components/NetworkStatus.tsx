import React from 'react';
import { Wifi, WifiOff, Zap, Search } from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export const NetworkStatus: React.FC<{ isCollapsed?: boolean }> = ({ isCollapsed }) => {
  const { isOnline, profile } = useFirebase();

  return (
    <div className={cn("px-4 py-3 bg-black/10 rounded-2xl border border-white/5", isCollapsed && "px-2 py-2")}>
      <div className={cn("flex items-center justify-between", isCollapsed && "flex-col gap-2")}>
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isOnline ? "bg-green-500 animate-pulse active shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]"
          )} />
          {!isCollapsed && (
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {isOnline ? 'Online' : 'LAN Mode'}
            </span>
          )}
        </div>
        
        {isOnline ? (
          <Wifi className={cn("w-3 h-3 text-slate-500", !isCollapsed && "opacity-50")} />
        ) : (
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-amber-500" />
            {!isCollapsed && <span className="text-[9px] font-bold text-amber-500/80">Zeroconf Active</span>}
          </div>
        )}
      </div>

      {!isOnline && !isCollapsed && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-2 pt-2 border-t border-white/5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] font-mono text-slate-500 uppercase">Local Discovery</span>
            <Search className="w-2.5 h-2.5 text-slate-600 animate-spin duration-[4000ms]" />
          </div>
          <p className="text-[9px] text-slate-500 mt-1 leading-tight italic">
            Connected to {profile?.department || 'Local Office'} LAN
          </p>
        </motion.div>
      )}
    </div>
  );
};
