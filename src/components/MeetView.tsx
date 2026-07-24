import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Video, Plus, Copy, Check, ExternalLink, Calendar as CalendarIcon, Clock, Link as LinkIcon, Trash2 } from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatDate as format } from '../lib/utils';

interface MeetingSpace {
  id: string;
  meetUri: string;
  name: string;
  createdBy: string;
  creatorName: string;
  createdAt: number;
  companyName?: string;
}

export const MeetView = () => {
  const { user, profile, accessToken, signIn } = useFirebase();
  const [meetings, setMeetings] = useState<MeetingSpace[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'meetings'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as MeetingSpace))
        .filter(m => m.companyName === profile?.companyName);
      setMeetings(list);
    });
    return () => unsub();
  }, [user, profile]);

  const handleCreateMeeting = async () => {
    if (!user || isCreating) return;
    
    let currentToken = accessToken;
    if (!currentToken) {
      if (window.confirm('You need to authenticate with Google to access Meet. Sign in now?')) {
        try {
          // This will trigger popup from FirebaseProvider (we need signIn from context)
          await signIn();
          // After sign in, the context accessToken might take a moment to update,
          // so we might require them to click "New Meeting" again, or use the newly acquired token if possible.
          // Since signIn doesn't return the token in this app's context, let's just alert and return:
          alert('Sign in complete. Please click "New Meeting Space" again.');
          return;
        } catch (e) {
          console.error(e);
          return;
        }
      } else {
        return;
      }
    }

    setIsCreating(true);
    try {
      // 1. Create space using Google Meet API
      const res = await fetch('https://meet.googleapis.com/v2/spaces', {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error('Failed to create meeting space. Please ensure you have authenticated with the required Meet permissions.');
      }

      const data = await res.json();
      
      if (!data.meetingUri) {
         throw new Error('Did not receive a meeting URI');
      }

      // 2. Save it to our Firestore
      await addDoc(collection(db, 'meetings'), {
        meetUri: data.meetingUri,
        name: `${profile?.name || 'User'}'s Meeting`,
        createdBy: user.uid,
        creatorName: profile?.name || 'Unknown',
        createdAt: Date.now(),
        companyName: profile?.companyName || ''
      });

    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to create meeting');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string, uri: string) => {
    if (!window.confirm(`Remove meeting link ${uri}?`)) return;
    try {
      await deleteDoc(doc(db, 'meetings', id));
    } catch(err) {
      console.error(err);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback or ignore
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.warn("Failed to copy to clipboard:", error);
      alert("Clipboard access is restricted in this environment. Please copy the link manually.");
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden relative">
      <div className="p-6 md:p-8 shrink-0 bg-white border-b border-slate-200 z-10 sticky top-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-5xl mx-auto">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2 flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center shrink-0">
                <Video className="w-5 h-5" />
              </div>
              Google Meet Spaces
            </h1>
            <p className="text-sm font-medium text-slate-500 max-w-xl">
              Create and manage instant Google Meet links for your team. All created meetings are accessible to your workspace members.
            </p>
          </div>

          <button
            onClick={handleCreateMeeting}
            disabled={isCreating}
            className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-teal-500/20 disabled:opacity-50 disabled:pointer-events-none hover:shadow-teal-500/40"
          >
             {isCreating ? (
               <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...</>
             ) : (
               <><Plus className="w-5 h-5" /> New Meeting Space</>
             )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto w-full max-w-5xl mx-auto p-6 md:p-8 pt-6">
         {meetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center mt-12 bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8">
              <div className="w-20 h-20 bg-teal-50 text-teal-500 rounded-3xl flex items-center justify-center mb-6">
                 <Video className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">No meeting spaces yet</h3>
              <p className="text-sm text-slate-500 max-w-md">
                Create a new meeting space to get an instant link that everyone in your workspace can join.
              </p>
            </div>
         ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <AnimatePresence>
                {meetings.map((meet) => (
                  <motion.div
                    key={meet.id}
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group relative flex flex-col"
                  >
                     <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 font-bold text-slate-600">
                             {meet.creatorName.charAt(0).toUpperCase()}
                           </div>
                           <div>
                             <h4 className="font-bold text-slate-900">{meet.name}</h4>
                             <p className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Created by {meet.creatorName}</p>
                           </div>
                        </div>
                        {meet.createdBy === user?.uid && (
                           <button 
                             onClick={() => handleDelete(meet.id, meet.meetUri)}
                             className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                        )}
                     </div>

                     <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center mb-6">
                        <div className="flex items-center gap-2 truncate pr-2 text-slate-600 text-sm font-medium">
                           <LinkIcon className="w-4 h-4 shrink-0 text-slate-400" />
                           <span className="truncate">{meet.meetUri}</span>
                        </div>
                        <button 
                          onClick={() => copyToClipboard(meet.meetUri, meet.id)}
                          className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-700 transition-colors shrink-0"
                          title="Copy Link"
                        >
                          {copiedId === meet.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                     </div>

                     <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                           <Clock className="w-3.5 h-3.5" />
                           {format(new Date(meet.createdAt), 'MMM d, h:mm a')}
                        </div>
                        <a 
                          href={meet.meetUri}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs font-bold bg-teal-50 text-teal-700 px-3 py-1.5 rounded-lg hover:bg-teal-100 transition-colors"
                        >
                           Join <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                     </div>
                  </motion.div>
                ))}
             </AnimatePresence>
           </div>
         )}
      </div>
    </div>
  );
};
