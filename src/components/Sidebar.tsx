import React, { useEffect, useState, useCallback, useRef } from 'react';
import { collection, query, onSnapshot, where, orderBy, addDoc, serverTimestamp, limit, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Hash, Users, FolderOpen, LogOut, ChevronRight, Plus, Monitor, Minimize2, Info, Settings, Maximize2, Square, ChevronsLeftRight, Shield, Globe, Lock, X, Palette, Calendar, Trash2, Edit2, Rocket, Pin, PinOff, Mail, Target, Zap, Activity, Award, Briefcase, Camera, Code, Coffee, Compass, Cpu, CreditCard, Crosshair, Figma, Film, Gamepad2, Gift, Headphones, Heart, Key, Layout, Map, MessageSquare, Music, Navigation, Phone, Play, Send, Speaker, Star, Tag, Terminal, Tv, Umbrella, Video, Volume2, Wifi, Type } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { Channel, User, Meeting } from '../types';
import { useFirebase } from './FirebaseProvider';
import { NetworkStatus } from './NetworkStatus';
import { cn, formatDate as format } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { logActivity } from '../lib/audit';
import { RoleGate } from './RoleGate';
import { Permission } from '../lib/rbac';
import { UserRole } from '../types';
import logo from '../assets/images/swiftdrop_logo_1779231213845.png';

function handleFirestoreError(error: unknown, operationType: string, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // Do not rethrow: listener error callbacks run outside React's render cycle,
  // and throwing here crashes the app via ErrorBoundary on any transient
  // permission/offline error. Logging is sufficient (ported from upstream).
}

interface SidebarProps {
  activeId: string;
  viewMode: 'bubble' | 'medium' | 'full';
  isCollapsed: boolean;
  mobileOpen?: boolean;
  onSetMobileOpen?: (open: boolean) => void;
  onSelect: (id: string, type: 'channel' | 'dm' | 'files' | 'audit' | 'schedule' | 'updates' | 'mail' | 'fonts' | 'meet') => void;
  onSetViewMode: (mode: 'bubble' | 'medium' | 'full') => void;
  onToggleCollapse: () => void;
}

import { useUserProfile } from './UserProfileProvider';

export const ICONS = {
  Hash, Users, Target, Zap, Activity, Award, Briefcase, Camera, Code, Coffee,
  Compass, Cpu, CreditCard, Crosshair, Figma, Film, Gamepad2, Gift, Headphones, Heart,
  Key, Layout, Map, MessageSquare, Music, Navigation, Phone, Play, Send, Speaker,
  Star, Tag, Terminal, Tv, Umbrella, Video, Volume2, Wifi, Globe, Lock, Palette
};

export type IconName = keyof typeof ICONS;

export const Sidebar: React.FC<SidebarProps> = ({ activeId, viewMode, isCollapsed, mobileOpen, onSetMobileOpen, onSelect, onSetViewMode, onToggleCollapse }) => {
  const { user, profile, logOut } = useFirebase();
  const { openProfile } = useUserProfile();
  const { t, i18n } = useTranslation();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showLangMenu, setShowLangMenu] = useState(false);
  
  // New Channel Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelName, setEditingChannelName] = useState('');
  const [editingChannelDesc, setEditingChannelDesc] = useState('');
  const [editingChannelIcon, setEditingChannelIcon] = useState<string>('Hash');
  const [editingChannelIsPrivate, setEditingChannelIsPrivate] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [newChannelIcon, setNewChannelIcon] = useState<string>('Hash');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const safeGetLocal = (key: string, defaultVal: string) => {
    try { return localStorage.getItem(key) || defaultVal; } catch { return defaultVal; }
  };
  const safeSetLocal = (key: string, val: string) => {
    try { localStorage.setItem(key, val); } catch {}
  };

  const [isDarkMode, setIsDarkMode] = useState(() => safeGetLocal('mode', 'light') === 'dark');
  const [currentTheme, setCurrentTheme] = useState(() => safeGetLocal('theme', 'blue'));
  const [nextMeeting, setNextMeeting] = useState<Meeting | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    safeSetLocal('theme', currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-mode', isDarkMode ? 'dark' : 'light');
    safeSetLocal('mode', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);
  
  // Resizable Sidebar Logic
  const [width, setWidth] = useState(256); // Default 64 (w-64)
  const isResizing = useRef(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'default';
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;
    
    // Constraints: min 200px, max 480px
    const newWidth = Math.max(200, Math.min(480, e.clientX));
    setWidth(newWidth);
  }, []);

  useEffect(() => {
    if (!user) return;

    // Listen to channels and filter by company
    const qChannels = query(collection(db, 'channels'));
    const unsubChannels = onSnapshot(qChannels, (snapshot) => {
      const list = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Channel))
        .filter(c => c.companyName === profile?.companyName);
      setChannels(list);
    }, (error) => handleFirestoreError(error, 'list', 'channels'));

    // Listen to all users and filter by company
    const qUsers = query(collection(db, 'users'), limit(50));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      const allUsers = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as User))
        .filter(u => u.id !== user.uid && u.companyName === profile?.companyName);
      
      const statusWeight = {
        online: 0,
        away: 1,
        offline: 2
      };

      allUsers.sort((a, b) => {
        if (statusWeight[a.status] !== statusWeight[b.status]) {
          return statusWeight[a.status] - statusWeight[b.status];
        }
        return a.name.localeCompare(b.name);
      });

      setUsers(allUsers);
    }, (error) => handleFirestoreError(error, 'list', 'users'));

    // Listen to next upcoming meeting
    const qMeetings = query(collection(db, 'meetings'), orderBy('startTime', 'asc'));
    const unsubMeetings = onSnapshot(qMeetings, (snapshot) => {
      const now = Date.now();
      let upcoming: Meeting | null = null;
      for (const doc of snapshot.docs) {
        const m = { id: doc.id, ...doc.data() } as Meeting;
        // Check if the user is an attendee and the meeting hasn't ended yet
        if (m.startTime && m.endTime > now && m.attendees?.includes(user.uid)) {
           upcoming = m;
           break; // found the next upcoming since it's ordered by startTime asc
        }
      }
      setNextMeeting(upcoming);
    }, (error) => console.error("Error fetching meetings", error));

    return () => {
      unsubChannels();
      unsubUsers();
      unsubMeetings();
    };
  }, [user, profile]);

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isCreating) return;

    setChannelError(null);
    const trimmedName = newChannelName.trim();
    
    if (!trimmedName) {
      setChannelError("Channel name cannot be empty.");
      return;
    }

    if (trimmedName.length < 3 || trimmedName.length > 21) {
      setChannelError("Channel name must be between 3 and 21 characters.");
      return;
    }

    // Only allow lowercase letters, numbers, hyphens, and underscores.
    // Also, it must start with a letter.
    const nameRegex = /^[a-z][a-z0-9_-]*$/;
    if (!nameRegex.test(trimmedName)) {
      setChannelError("Channel name must start with a lowercase letter and contain only lowercase letters, numbers, hyphens, or underscores.");
      return;
    }

    setIsCreating(true);
    try {
      const channelData = {
        name: trimmedName,
        description: newChannelDesc.trim(),
        icon: newChannelIcon,
        isPrivate,
        ownerId: user.uid,
        members: [user.uid],
        admins: [user.uid],
        mutedMembers: [],
        createdAt: Date.now(),
        companyName: profile?.companyName || '',
      };

      const docRef = await addDoc(collection(db, 'channels'), channelData);
      
      logActivity({
        type: 'channel',
        action: 'Channel Created',
        details: `Created ${isPrivate ? 'private' : 'public'} channel: #${trimmedName}`,
        severity: 'info'
      });

      setNewChannelName('');
      setNewChannelDesc('');
      setNewChannelIcon('Hash');
      setIsPrivate(false);
      setChannelError(null);
      setShowCreateModal(false);
      onSelect(docRef.id, 'channel');
    } catch (error) {
      handleFirestoreError(error, 'create', 'channels');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteChannel = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete #${name}?`)) return;
    try {
      await deleteDoc(doc(db, 'channels', id));
      logActivity({
        type: 'channel',
        action: 'Channel Deleted',
        details: `Deleted channel: #${name}`,
        severity: 'warning'
      });
    } catch (error) {
      handleFirestoreError(error, 'delete', 'channels');
    }
  };

  const handleUpdateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChannelId) return;
    
    setChannelError(null);
    const newName = editingChannelName.trim();
    
    // Validate newName
    const nameRegex = /^[a-z][a-z0-9_-]*$/;
    if (!nameRegex.test(newName) || newName.length < 3 || newName.length > 21) {
      setChannelError("Name must be 3-21 chars, lowercase alphanumeric, dashes, underscores");
      return;
    }

    try {
      setIsCreating(true); // Reusing isCreating for button loading state
      await updateDoc(doc(db, 'channels', editingChannelId), { 
        name: newName,
        description: editingChannelDesc,
        icon: editingChannelIcon,
        isPrivate: editingChannelIsPrivate
      });
      logActivity({
        type: 'channel',
        action: 'Channel Updated',
        details: `Updated channel: #${newName}`,
        severity: 'info'
      });
      setEditingChannelId(null);
    } catch (error) {
      handleFirestoreError(error, 'update', 'channels');
    } finally {
      setIsCreating(false);
    }
  };

  const handleTogglePinChannel = async (channelId: string) => {
    if (!user) return;
    try {
      const currentPinned = profile?.pinnedChannels || [];
      const newPinned = currentPinned.includes(channelId)
        ? currentPinned.filter(id => id !== channelId)
        : [...currentPinned, channelId];
      await updateDoc(doc(db, 'users', user.uid), { pinnedChannels: newPinned });
    } catch (error) {
      handleFirestoreError(error, 'update', 'users');
    }
  };

  const handleTogglePinDM = async (userId: string) => {
    if (!user) return;
    try {
      const currentPinned = profile?.pinnedDMs || [];
      const newPinned = currentPinned.includes(userId)
        ? currentPinned.filter(id => id !== userId)
        : [...currentPinned, userId];
      await updateDoc(doc(db, 'users', user.uid), { pinnedDMs: newPinned });
    } catch (error) {
      handleFirestoreError(error, 'update', 'users');
    }
  };

  const pinnedChannelIds = profile?.pinnedChannels || [];
  const sortedChannels = [...channels].sort((a, b) => {
    const aPinned = pinnedChannelIds.includes(a.id);
    const bPinned = pinnedChannelIds.includes(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return a.name.localeCompare(b.name);
  });

  const pinnedDMIds = profile?.pinnedDMs || [];
  const sortedUsers = [...users].sort((a, b) => {
    const aPinned = pinnedDMIds.includes(a.id);
    const bPinned = pinnedDMIds.includes(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    
    const statusWeight: Record<string, number> = { online: 0, away: 1, offline: 2 };
    if (statusWeight[a.status] !== statusWeight[b.status]) {
      return statusWeight[a.status] - statusWeight[b.status];
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90]"
          onClick={() => onSetMobileOpen?.(false)}
        />
      )}
      <div 
        style={{ width: isCollapsed ? '80px' : `${width}px` }}
        className={cn(
          "h-full bg-workspace-sidebar backdrop-blur-xl text-slate-300 flex flex-col border-r border-white/5 relative group/sidebar transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] shrink-0",
          mobileOpen ? "fixed inset-y-0 left-0 z-[100] translate-x-0" : "max-md:-translate-x-full max-md:hidden max-md:absolute md:relative"
        )}
      >
        {/* Resize Handle */}
        {!isCollapsed && (
          <div 
            onMouseDown={startResizing}
            className="hidden md:block absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-workspace-accent/50 transition-colors z-50 group"
          >
            <div className="absolute top-1/2 -right-2 -translate-y-1/2 bg-workspace-accent rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
              <ChevronsLeftRight className="w-3 h-3 text-white" />
            </div>
          </div>
        )}

        {/* Mobile Close Button */}
        {mobileOpen && (
          <button 
            onClick={() => onSetMobileOpen?.(false)}
            className="md:hidden absolute top-6 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white z-50"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header */}
      <div className={cn("p-6 flex items-center justify-between border-b border-white/5", isCollapsed && "px-4")}>
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 min-w-[32px] rounded-lg overflow-hidden flex items-center justify-center bg-white shadow-sm border border-white/10 shrink-0">
            <img src={logo} alt="SwiftyDrop Logo" className="w-full h-full object-cover" />
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <h1 className="font-bold text-white tracking-tight truncate">SwiftyDrop</h1>
              <p className="text-[10px] text-slate-200 truncate font-bold">{profile?.companyName || 'Corporate Workspace'}</p>
            </div>
          )}
        </div>
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="text-slate-500 hover:text-white p-1.5 rounded-md transition-colors"
          title="Toggle Dark Mode"
        >
          {isDarkMode ? '🌙' : '☀️'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-8 no-scrollbar">
        {/* Toggle Collapse Button */}
        <div className="px-3">
          <button 
            onClick={onToggleCollapse}
            className="w-full flex items-center justify-center p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
          >
            <ChevronsLeftRight className={cn("w-4 h-4 transition-transform duration-500", isCollapsed ? "rotate-180" : "rotate-0")} />
          </button>
        </div>

        {/* Language & Local Settings */}
        <div className={cn("px-3 flex items-center justify-between", isCollapsed && "flex-col gap-4")}>
          {!isCollapsed ? (
            <div className="flex items-center gap-1.5 p-0.5 bg-white/5 rounded-lg">
              <button 
                onClick={() => i18n.changeLanguage('en')}
                className={cn("px-2 py-1 text-[9px] font-black uppercase rounded-md transition-all", i18n.language === 'en' ? "bg-white text-slate-900" : "text-slate-500 hover:text-white")}
              >
                EN
              </button>
              <button 
                onClick={() => i18n.changeLanguage('es')}
                className={cn("px-2 py-1 text-[9px] font-black uppercase rounded-md transition-all", i18n.language === 'es' ? "bg-white text-slate-900" : "text-slate-500 hover:text-white")}
              >
                ES
              </button>
            </div>
          ) : (
            <button 
              onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'es' : 'en')}
              className="w-8 h-8 rounded-lg bg-white/5 text-[9px] font-black flex items-center justify-center"
            >
              {(i18n.language || "en").toUpperCase()}
            </button>
          )}
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
        </div>

        {/* Next Meeting Quick Join */}
        {nextMeeting && (
          <div className={cn("px-3 mb-2", isCollapsed && "px-1")}>
            <div className={cn(
               "bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border border-indigo-500/20 rounded-2xl p-3 relative overflow-hidden group",
               isCollapsed && "flex items-center justify-center p-2"
            )}>
              {/* Animated background glow */}
              <div className="absolute -inset-2 bg-indigo-500/10 blur-xl group-hover:bg-indigo-500/20 transition-colors pointer-events-none" />
              
              {!isCollapsed ? (
                <>
                  <div className="flex items-center justify-between mb-2 relative z-10">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                      Up Next
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {format(new Date(nextMeeting.startTime), 'h:mm a')}
                    </span>
                  </div>
                  <h4 className="font-bold text-white text-sm truncate mb-3 relative z-10" title={nextMeeting.title}>
                    {nextMeeting.title}
                  </h4>
                  <a 
                    href={nextMeeting.platform && nextMeeting.platform.startsWith('http') ? nextMeeting.platform : '#'}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                       if (!nextMeeting.platform || !nextMeeting.platform.startsWith('http')) {
                          e.preventDefault();
                          onSelect('schedule', 'schedule');
                       }
                    }}
                    className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors relative z-10 shadow-[0_0_12px_rgba(99,102,241,0.3)]"
                  >
                    <Video className="w-3.5 h-3.5" /> Quick Join
                  </a>
                </>
              ) : (
                  <a 
                    href={nextMeeting.platform && nextMeeting.platform.startsWith('http') ? nextMeeting.platform : '#'}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                       if (!nextMeeting.platform || !nextMeeting.platform.startsWith('http')) {
                          e.preventDefault();
                          onSelect('schedule', 'schedule');
                       }
                    }}
                    title={`Next: ${nextMeeting.title} at ${format(new Date(nextMeeting.startTime), 'h:mm a')}`}
                    className="w-10 h-10 bg-indigo-500 text-white rounded-xl flex items-center justify-center hover:bg-indigo-600 transition-colors shadow-lg relative z-10 mx-auto"
                  >
                    <Video className="w-4 h-4" />
                  </a>
              )}
            </div>
          </div>
        )}

        {/* Workspace Operations */}
        <div className="space-y-2">
          {/* Meet Integration */}
          <button 
            onClick={() => onSelect('meet', 'meet')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all group",
              activeId === 'meet' ? "bg-teal-500/10 text-white" : "hover:bg-white/5 text-slate-400 hover:text-white",
              isCollapsed && "justify-center px-0 h-10 w-10 mx-auto"
            )}
            title="Google Meet"
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300",
              activeId === 'meet' ? "bg-teal-500 text-white shadow-[0_0_12px_rgba(20,184,166,0.4)]" : "bg-teal-500/10 text-teal-400 group-hover:scale-110 group-hover:bg-teal-500/20"
            )}>
              <Video className="w-4 h-4" />
            </div>
            {!isCollapsed && <span className="font-medium text-sm truncate">Google Meet</span>}
          </button>

          {/* Email Integration */}
          <button 
            onClick={() => onSelect('mail', 'mail')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all group",
              activeId === 'mail' ? "bg-red-500/10 text-white" : "hover:bg-white/5 text-slate-400 hover:text-white",
              isCollapsed && "justify-center px-0 h-10 w-10 mx-auto"
            )}
            title="Gmail"
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300",
              activeId === 'mail' ? "bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.4)]" : "bg-red-500/10 text-red-400 group-hover:scale-110 group-hover:bg-red-500/20"
            )}>
              <Mail className="w-4 h-4" />
            </div>
            {!isCollapsed && <span className="font-medium text-sm truncate">Gmail</span>}
          </button>

          <button 
            onClick={() => onSelect('files', 'files')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all group",
              activeId === 'files' ? "bg-workspace-accent/10 text-white" : "hover:bg-white/5 text-slate-400 hover:text-white",
              isCollapsed && "justify-center px-0 h-10 w-10 mx-auto"
            )}
            title={t('sidebar.files')}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300",
              activeId === 'files' ? "bg-workspace-accent text-white shadow-[0_0_12px_rgba(var(--workspace-accent-rgb),0.4)]" : "bg-workspace-accent/10 text-workspace-accent group-hover:scale-110 group-hover:bg-workspace-accent/20"
            )}>
              <FolderOpen className="w-4 h-4" />
            </div>
            {!isCollapsed && <span className="font-medium text-sm truncate">{t('sidebar.files')}</span>}
          </button>

          <button 
            onClick={() => onSelect('schedule', 'schedule')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all group",
              activeId === 'schedule' ? "bg-purple-500/10 text-white" : "hover:bg-white/5 text-slate-400 hover:text-white",
              isCollapsed && "justify-center px-0 h-10 w-10 mx-auto"
            )}
            title="Schedule & Reminders"
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300",
              activeId === 'schedule' ? "bg-purple-500 text-white shadow-[0_0_12px_rgba(168,85,247,0.4)]" : "bg-purple-500/10 text-purple-400 group-hover:scale-110 group-hover:bg-purple-500/20"
            )}>
              <Calendar className="w-4 h-4" />
            </div>
            {!isCollapsed && <span className="font-medium text-sm truncate">Schedule</span>}
          </button>

          <button 
            onClick={() => onSelect('fonts', 'fonts')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all group",
              activeId === 'fonts' ? "bg-indigo-500/10 text-white" : "hover:bg-white/5 text-slate-400 hover:text-white",
              isCollapsed && "justify-center px-0 h-10 w-10 mx-auto"
            )}
            title="Font Catalog"
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300",
              activeId === 'fonts' ? "bg-indigo-500 text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]" : "bg-indigo-500/10 text-indigo-400 group-hover:scale-110 group-hover:bg-indigo-500/20"
            )}>
              <Type className="w-4 h-4" />
            </div>
            {!isCollapsed && <span className="font-medium text-sm truncate">Font Catalog</span>}
          </button>

          <button 
            onClick={() => onSelect('updates', 'updates')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all group",
              activeId === 'updates' ? "bg-amber-500/10 text-white" : "hover:bg-white/5 text-slate-400 hover:text-white",
              isCollapsed && "justify-center px-0 h-10 w-10 mx-auto"
            )}
            title="App Updates"
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300",
              activeId === 'updates' ? "bg-amber-500 text-white shadow-[0_0_12px_rgba(245,158,11,0.4)]" : "bg-amber-500/10 text-amber-400 group-hover:scale-110 group-hover:bg-amber-500/20"
            )}>
              <Rocket className="w-4 h-4" />
            </div>
            {!isCollapsed && <span className="font-medium text-sm truncate">App Updates</span>}
          </button>

          <RoleGate permission={Permission.VIEW_AUDIT_LOGS}>
            <button 
              onClick={() => onSelect('audit', 'audit')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all group",
                activeId === 'audit' ? "bg-emerald-500/10 text-white" : "hover:bg-white/5 text-slate-400 hover:text-white",
                isCollapsed && "justify-center px-0 h-10 w-10 mx-auto"
              )}
              title={t('sidebar.auditLogs')}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300",
                activeId === 'audit' ? "bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.4)]" : "bg-emerald-500/10 text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20"
              )}>
                <Shield className="w-4 h-4" />
              </div>
              {!isCollapsed && <span className="font-medium text-sm truncate">{t('sidebar.auditLogs')}</span>}
            </button>
          </RoleGate>
        </div>

        {/* Channels */}
        <div>
          {!isCollapsed && (
            <div className="px-3 mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span>{t('sidebar.channels')}</span>
              <RoleGate permission={Permission.CREATE_CHANNELS}>
                <button 
                  onClick={() => setShowCreateModal(true)}
                  className="hover:text-white transition-colors p-1"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </RoleGate>
            </div>
          )}
          <div className="space-y-0.5">
            {sortedChannels.map(channel => {
              const lastRead = profile?.lastRead?.[channel.id] || 0;
              const hasUnread = channel.lastMessageTimestamp && channel.lastMessageTimestamp > lastRead && channel.lastMessageSenderId !== user?.uid;
              const isPinned = pinnedChannelIds.includes(channel.id);

              return (
                <div
                  key={channel.id}
                  onClick={() => onSelect(channel.id, 'channel')}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-1.5 rounded-xl transition-all text-sm group/item relative cursor-pointer",
                    activeId === channel.id ? "bg-white/10 text-white font-medium" : "hover:bg-white/5 text-slate-400 hover:text-white",
                    isCollapsed && "justify-center px-0 h-10 w-10 mx-auto"
                  )}
                  title={channel.name}
                >
                  <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    activeId === channel.id ? "bg-white/10 text-white" : "bg-white/5 text-slate-500 group-hover/item:text-slate-300",
                    hasUnread && "bg-workspace-accent/20 text-workspace-accent shadow-[0_0_8px_rgba(var(--workspace-accent-rgb),0.3)] min-w-[28px]"
                  )}>
                    {isPinned ? <Pin className="w-3 h-3 text-amber-400 fill-amber-400" /> : React.createElement(ICONS[(channel.icon as IconName)] || Hash, { className: "w-3.5 h-3.5" })}
                  </div>
                  {!isCollapsed && (
                    <div className="flex-1 flex items-center justify-between overflow-hidden">
                      <span className="truncate">{channel.name}</span>
                      
                      <div className="flex items-center gap-2">
                        <div 
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); handleTogglePinChannel(channel.id); }}
                          className="opacity-0 group-hover/item:opacity-100 p-1 text-slate-500 hover:text-white hover:bg-white/10 rounded cursor-pointer"
                          title={isPinned ? "Unpin Channel" : "Pin Channel"}
                        >
                          {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                        </div>
                        <RoleGate permission={Permission.MANAGE_CHANNELS}>
                          <div 
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { 
                               e.stopPropagation(); 
                               setEditingChannelId(channel.id);
                               setEditingChannelName(channel.name);
                               setEditingChannelDesc(channel.description || '');
                               setEditingChannelIcon(channel.icon || 'Hash');
                               setEditingChannelIsPrivate(channel.isPrivate || false);
                            }}
                            className="opacity-0 group-hover/item:opacity-100 p-1 text-slate-500 hover:text-white hover:bg-white/10 rounded cursor-pointer"
                            title="Edit Channel"
                          >
                            <Edit2 className="w-3 h-3" />
                          </div>
                          <div 
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); handleDeleteChannel(channel.id, channel.name); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleDeleteChannel(channel.id, channel.name); } }}
                            className="opacity-0 group-hover/item:opacity-100 p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded cursor-pointer"
                            title="Delete Channel"
                          >
                            <Trash2 className="w-3 h-3" />
                          </div>
                        </RoleGate>
                        {hasUnread && (
                          <motion.div 
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-2 h-2 rounded-full bg-workspace-accent shadow-[0_0_8px_rgba(var(--workspace-accent-rgb),0.5)]" 
                          />
                        )}
                      </div>
                    </div>
                  )}
                  {isCollapsed && hasUnread && (
                    <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-workspace-accent border-2 border-workspace-sidebar shadow-sm" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Direct Messages */}
        <div>
          {!isCollapsed && (
            <div className="px-3 mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span>{t('sidebar.directMessages')}</span>
              <Plus className="w-3 h-3 cursor-pointer hover:text-white" />
            </div>
          )}
          <div className="space-y-0.5">
            {sortedUsers.map(u => {
              const lastRead = profile?.lastRead?.[u.id] || 0;
              const hasUnread = false; // logic would go here
              const isPinned = pinnedDMIds.includes(u.id);

              return (
                <div
                  key={u.id}
                  onClick={() => onSelect(u.id, 'dm')}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-1.5 rounded-xl transition-all text-sm relative group/dm cursor-pointer",
                    activeId === u.id ? "bg-white/10 text-white font-medium" : "hover:bg-white/5 text-slate-400 hover:text-white",
                    isCollapsed && "justify-center px-0 h-10 w-10 mx-auto"
                  )}
                  title={u.name}
                >
                  <div 
                    className="relative shrink-0 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      openProfile(u.id);
                    }}
                  >
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden transition-all",
                      activeId === u.id ? "ring-2 ring-workspace-accent/50 filter brightness-110" : "bg-white/10 hover:ring-2 hover:ring-workspace-accent",
                      hasUnread && "ring-2 ring-workspace-accent shadow-[0_0_8px_rgba(var(--workspace-accent-rgb),0.5)]"
                    )}>
                      {u.avatar ? <img src={u.avatar} alt="" className="w-full h-full object-cover" /> : <Users className="w-3.5 h-3.5" />}
                    </div>
                    <div className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-workspace-sidebar",
                      u.status === 'online' ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : 
                      u.status === 'away' ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : 
                      "bg-slate-500"
                    )} />
                    {isPinned && isCollapsed && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-workspace-sidebar rounded-full flex items-center justify-center">
                        <Pin className="w-2 h-2 text-amber-400 fill-amber-400" />
                      </div>
                    )}
                  </div>
                  {!isCollapsed && (
                    <div className="flex-1 flex items-center justify-between overflow-hidden">
                      <div className="flex flex-col text-left overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <span className="leading-none truncate">{u.name}</span>
                          <span className={cn(
                            "text-[9px] font-bold capitalize shrink-0",
                            u.status === 'online' ? "text-green-500" :
                            u.status === 'away' ? "text-amber-500" :
                            "text-slate-500"
                          )}>
                            ({u.status})
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 mt-1 truncate">{u.department || 'Office'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div 
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); handleTogglePinDM(u.id); }}
                          className={cn(
                            "p-1 text-slate-500 hover:text-white hover:bg-white/10 rounded cursor-pointer transition-opacity",
                            isPinned ? "opacity-100" : "opacity-0 group-hover/dm:opacity-100"
                          )}
                          title={isPinned ? "Unpin DM" : "Pin DM"}
                        >
                          {isPinned ? <Pin className="w-3 h-3 text-amber-400 fill-amber-400" /> : <Pin className="w-3 h-3" />}
                        </div>
                        {hasUnread && (
                          <div className="w-2 h-2 rounded-full bg-workspace-accent animate-pulse shrink-0" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Create Channel Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-workspace-sidebar border border-white/10 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">{t('sidebar.createChannel')}</h2>
                    <p className="text-slate-400 text-xs mt-1">Setup your new team communication space.</p>
                  </div>
                  <button 
                    onClick={() => {
                      setShowCreateModal(false);
                      setChannelError(null);
                    }}
                    className="p-2 hover:bg-white/5 rounded-full text-slate-400 transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateChannel} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                      {t('sidebar.channelName')}
                    </label>
                    <div className="relative">
                      <Hash className={cn("absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500", channelError && "text-red-500")} />
                      <input 
                        autoFocus
                        type="text" 
                        value={newChannelName}
                        onChange={(e) => {
                          setNewChannelName(e.target.value);
                          if (channelError) setChannelError(null);
                        }}
                        placeholder="e.g. strategy-hub"
                        className={cn("w-full bg-white/5 border rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-600 focus:ring-2 transition-all", channelError ? "border-red-500/50 focus:ring-red-500/50" : "border-white/5 focus:ring-workspace-accent/50")}
                        required
                      />
                    </div>
                    {channelError && (
                      <p className="text-xs text-red-500 mt-2 flex items-start gap-1.5">
                        <span className="shrink-0">⚠️</span>
                        <span>{channelError}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                      Channel Icon
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowIconPicker(!showIconPicker)}
                        className="w-full flex items-center justify-between bg-white/5 border border-white/5 rounded-xl py-3 px-4 text-sm text-white hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {React.createElement(ICONS[newChannelIcon as IconName] || Hash, { className: "w-5 h-5 text-workspace-accent" })}
                          <span>{newChannelIcon}</span>
                        </div>
                        <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform", showIconPicker && "rotate-90")} />
                      </button>
                      
                      <AnimatePresence>
                        {showIconPicker && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            className="absolute top-[110%] left-0 w-full z-10 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-2 max-h-48 overflow-y-auto no-scrollbar grid grid-cols-6 gap-1"
                          >
                            {(Object.keys(ICONS) as IconName[]).map((iconName) => (
                              <button
                                key={iconName}
                                type="button"
                                onClick={() => {
                                  setNewChannelIcon(iconName);
                                  setShowIconPicker(false);
                                }}
                                className={cn(
                                  "p-2 rounded-lg flex items-center justify-center transition-all",
                                  newChannelIcon === iconName ? "bg-workspace-accent text-white" : "text-slate-400 hover:text-white hover:bg-white/10"
                                )}
                                title={iconName}
                              >
                                {React.createElement(ICONS[iconName], { className: "w-4 h-4" })}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                      {t('sidebar.channelDescription')} <span className="text-slate-700">{t('common.optional')}</span>
                    </label>
                    <textarea 
                      value={newChannelDesc}
                      onChange={(e) => setNewChannelDesc(e.target.value)}
                      placeholder="What is this channel about?"
                      rows={3}
                      className="w-full bg-white/5 border border-white/5 rounded-xl py-3 px-4 text-sm text-white placeholder:text-slate-600 focus:ring-2 focus:ring-workspace-accent/50 transition-all resize-none"
                    />
                  </div>

                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between group cursor-pointer" onClick={() => setIsPrivate(!isPrivate)}>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        isPrivate ? "bg-amber-500/20 text-amber-500 shadow-lg shadow-amber-500/10" : "bg-white/5 text-slate-500"
                      )}>
                        {isPrivate ? <Lock className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">{t('sidebar.isPrivate')}</p>
                        <p className="text-[10px] text-slate-500">{t('sidebar.privateDescription')}</p>
                      </div>
                    </div>
                    <div className={cn(
                      "w-10 h-5 rounded-full relative transition-all duration-300",
                      isPrivate ? "bg-amber-500" : "bg-white/10"
                    )}>
                      <div className={cn(
                        "absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300",
                        isPrivate ? "left-6" : "left-1"
                      )} />
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        setChannelError(null);
                      }}
                      className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-slate-400 hover:bg-white/5 transition-all"
                    >
                      {t('common.cancel')}
                    </button>
                    <button 
                      type="submit"
                      disabled={isCreating || !newChannelName.trim()}
                      className="flex-[2] py-3 px-4 bg-workspace-accent text-white rounded-xl text-sm font-bold shadow-xl shadow-workspace-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {isCreating ? t('common.loading') : t('sidebar.create')}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Channel Modal */}
      <AnimatePresence>
        {editingChannelId && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-workspace-sidebar border border-white/10 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Edit Channel</h2>
                    <p className="text-slate-400 text-xs mt-1">Update channel details and icon.</p>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingChannelId(null);
                      setChannelError(null);
                      setShowIconPicker(false);
                    }}
                    className="p-2 hover:bg-white/5 rounded-full text-slate-400 transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleUpdateChannel} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                      {t('sidebar.channelName')}
                    </label>
                    <div className="relative">
                      <Hash className={cn("absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500", channelError && "text-red-500")} />
                      <input 
                        autoFocus
                        type="text" 
                        value={editingChannelName}
                        onChange={(e) => {
                          setEditingChannelName(e.target.value);
                          if (channelError) setChannelError(null);
                        }}
                        placeholder="e.g. strategy-hub"
                        className={cn("w-full bg-white/5 border rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-600 focus:ring-2 transition-all", channelError ? "border-red-500/50 focus:ring-red-500/50" : "border-white/5 focus:ring-workspace-accent/50")}
                        required
                      />
                    </div>
                    {channelError && (
                      <p className="text-xs text-red-500 mt-2 flex items-start gap-1.5">
                        <span className="shrink-0">⚠️</span>
                        <span>{channelError}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                      Channel Icon
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowIconPicker(!showIconPicker)}
                        className="w-full flex items-center justify-between bg-white/5 border border-white/5 rounded-xl py-3 px-4 text-sm text-white hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {React.createElement(ICONS[editingChannelIcon as IconName] || Hash, { className: "w-5 h-5 text-workspace-accent" })}
                          <span>{editingChannelIcon}</span>
                        </div>
                        <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform", showIconPicker && "rotate-90")} />
                      </button>
                      
                      <AnimatePresence>
                        {showIconPicker && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            className="absolute top-[110%] left-0 w-full z-10 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-2 max-h-48 overflow-y-auto no-scrollbar grid grid-cols-6 gap-1"
                          >
                            {(Object.keys(ICONS) as IconName[]).map((iconName) => (
                              <button
                                key={iconName}
                                type="button"
                                onClick={() => {
                                  setEditingChannelIcon(iconName);
                                  setShowIconPicker(false);
                                }}
                                className={cn(
                                  "p-2 rounded-lg flex items-center justify-center transition-all",
                                  editingChannelIcon === iconName ? "bg-workspace-accent text-white" : "text-slate-400 hover:text-white hover:bg-white/10"
                                )}
                                title={iconName}
                              >
                                {React.createElement(ICONS[iconName], { className: "w-4 h-4" })}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                      {t('sidebar.channelDescription')} <span className="text-slate-700">{t('common.optional')}</span>
                    </label>
                    <textarea 
                      value={editingChannelDesc}
                      onChange={(e) => setEditingChannelDesc(e.target.value)}
                      placeholder="What is this channel about?"
                      rows={3}
                      className="w-full bg-white/5 border border-white/5 rounded-xl py-3 px-4 text-sm text-white placeholder:text-slate-600 focus:ring-2 focus:ring-workspace-accent/50 transition-all resize-none"
                    />
                  </div>

                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between group cursor-pointer" onClick={() => setEditingChannelIsPrivate(!editingChannelIsPrivate)}>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        editingChannelIsPrivate ? "bg-amber-500/20 text-amber-500 shadow-lg shadow-amber-500/10" : "bg-white/5 text-slate-500"
                      )}>
                        {editingChannelIsPrivate ? <Lock className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">{t('sidebar.isPrivate')}</p>
                        <p className="text-[10px] text-slate-500">{t('sidebar.privateDescription')}</p>
                      </div>
                    </div>
                    <div className={cn(
                      "w-10 h-5 rounded-full relative transition-all duration-300",
                      editingChannelIsPrivate ? "bg-amber-500" : "bg-white/10"
                    )}>
                      <div className={cn(
                        "absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300",
                        editingChannelIsPrivate ? "left-6" : "left-1"
                      )} />
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button"
                      onClick={() => {
                        setEditingChannelId(null);
                        setChannelError(null);
                      }}
                      className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-slate-400 hover:bg-white/5 transition-all"
                    >
                      {t('common.cancel')}
                    </button>
                    <button 
                      type="submit"
                      disabled={isCreating || !editingChannelName.trim()}
                      className="flex-[2] py-3 px-4 bg-workspace-accent text-white rounded-xl text-sm font-bold shadow-xl shadow-workspace-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {isCreating ? t('common.loading') : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className={cn("p-4 bg-black/20 border-top border-white/5 space-y-3 mt-auto", isCollapsed && "p-2")}>
        <NetworkStatus isCollapsed={isCollapsed} />
        <div className={cn("flex items-center gap-3", isCollapsed && "flex-col")}>
          <button 
            onClick={() => profile && openProfile(profile.id)}
            className="w-8 h-8 min-w-[32px] rounded-lg bg-slate-800 overflow-hidden shrink-0 cursor-pointer hover:ring-2 hover:ring-workspace-accent transition-all"
          >
            {profile?.avatar && <img src={profile.avatar} alt="" />}
          </button>
          
          {!isCollapsed && (
            <div className="flex-1 overflow-hidden">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => profile && openProfile(profile.id)}
                  className="text-sm font-medium text-white truncate hover:underline"
                >
                  {profile?.name || 'User'}
                </button>
                {profile?.role && (
                  <span className="px-1.5 py-0.5 rounded-sm bg-workspace-accent/20 text-workspace-accent text-[9px] uppercase tracking-wider font-bold">
                    {profile.role}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 truncate">{profile?.department}</p>
            </div>
          )}

          <div className={cn("flex flex-wrap items-center gap-1", isCollapsed && "flex-col")}>
            {viewMode === 'full' ? (
              <button 
                onClick={() => onSetViewMode('medium')}
                className="text-slate-500 hover:text-white p-1.5 rounded-md transition-colors"
                title="Restore Down"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button 
                onClick={() => onSetViewMode('full')}
                className="text-slate-500 hover:text-white p-1.5 rounded-md transition-colors"
                title="Maximize"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={() => onSetViewMode('bubble')}
              className="text-slate-500 hover:text-white p-1.5 rounded-md transition-colors"
              title="Minimize to Bubble"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowThemeModal(true)}
              className="text-slate-500 hover:text-white p-1.5 rounded-md transition-colors"
              title="Change Theme"
            >
              <Palette className="w-4 h-4" />
            </button>
            <button 
              onClick={logOut}
              className="text-slate-500 hover:text-red-400 p-1.5 rounded-md transition-colors"
              title={t('common.logout')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {/* Theme Selection Modal */}
      <AnimatePresence>
        {showThemeModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-workspace-sidebar border border-white/10 rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl"
            >
              <div className="p-8 pb-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Select Theme</h2>
                    <p className="text-slate-400 text-xs mt-1">Personalize your workspace</p>
                  </div>
                  <button 
                    onClick={() => setShowThemeModal(false)}
                    className="p-2 hover:bg-white/5 rounded-full text-slate-400 transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'blue', name: 'Blue', color: '#339af0' },
                    { id: 'indigo', name: 'Indigo', color: '#4f46e5' },
                    { id: 'emerald', name: 'Emerald', color: '#059669' },
                    { id: 'rose', name: 'Rose', color: '#e11d48' },
                    { id: 'liquid-glass', name: 'Liquid Glass', color: '#0ea5e9' },
                    { id: 'anime', name: 'Anime', color: '#db2777' }
                  ].map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => setCurrentTheme(theme.id)}
                      className={cn(
                        "flex items-center gap-3 p-4 rounded-xl border text-sm font-medium transition-all group",
                        currentTheme === theme.id 
                          ? "border-white/30 bg-white/10 text-white" 
                          : "border-white/5 bg-transparent text-slate-400 hover:border-white/20 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <div className="w-6 h-6 rounded-full border border-white/20 shadow-inner group-hover:scale-110 transition-transform" style={{ backgroundColor: theme.color }} />
                      {theme.name}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
};
