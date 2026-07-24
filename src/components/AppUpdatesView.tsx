import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, orderBy, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useFirebase } from '../components/FirebaseProvider';
import { UserRole, AppUpdate } from '../types';
import { Rocket, Plus, Edit2, Trash2, X, Check, EyeOff, AlertCircle } from 'lucide-react';
import { formatDate as format } from '../lib/utils';

export function AppUpdatesView() {
  const { user, profile } = useFirebase();
  const [updates, setUpdates] = useState<AppUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'published' | 'draft'>('published');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdmin = profile?.role === UserRole.ADMIN;

  useEffect(() => {
    if (!db) {
      setError("Firestore is not initialized.");
      setLoading(false);
      return;
    }

    const updatesQuery = query(collection(db, 'app_updates'), orderBy('timestamp', 'desc'));
    
    const unsubscribe = onSnapshot(updatesQuery, (snapshot) => {
      const updatesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AppUpdate[];
      
      // Non-admins only see published updates
      const visibleUpdates = isAdmin ? updatesData : updatesData.filter(u => u.status === 'published');
      setUpdates(visibleUpdates);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('Error fetching updates:', err);
      // Wait for indexes to build if needed
      if (err.message.includes('index')) {
        setError("Database indexes are currently being built. Please try again soon.");
      } else {
        setError("Missing or insufficient permissions.");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const resetForm = () => {
    setTitle('');
    setVersion('');
    setContent('');
    setStatus('published');
    setShowAddForm(false);
    setEditingId(null);
  };

  const handleEdit = (update: AppUpdate) => {
    setTitle(update.title);
    setVersion(update.version);
    setContent(update.content);
    setStatus(update.status);
    setEditingId(update.id);
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!db || !window.confirm('Are you sure you want to delete this update?')) return;
    try {
      await deleteDoc(doc(db, 'app_updates', id));
    } catch (err) {
      console.error('Failed to delete update:', err);
      alert('Failed to delete update.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !user || !title.trim() || !content.trim() || !version.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'app_updates', editingId), {
          title: title.trim(),
          content: content.trim(),
          version: version.trim(),
          status
        });
      } else {
        await addDoc(collection(db, 'app_updates'), {
          title: title.trim(),
          content: content.trim(),
          version: version.trim(),
          authorId: user.uid,
          authorName: profile?.name || user.displayName || 'Admin',
          status,
          timestamp: Date.now()
        });
      }
      resetForm();
    } catch (err) {
      console.error('Failed to save update:', err);
      alert('Failed to save update.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-workspace-accent"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC]">
      <div className="px-8 py-6 border-b border-slate-200 bg-white shadow-sm flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <span className="bg-workspace-accent/10 p-2 rounded-xl text-workspace-accent">
              <Rocket className="w-6 h-6" />
            </span>
            App Updates
          </h2>
          <p className="text-slate-500 mt-1">Release notes and system changes for clients.</p>
        </div>
        
        {isAdmin && !showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-workspace-accent text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-workspace-accent/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Publish Update
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-4xl mx-auto">
          
          {error && (
            <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-2xl flex items-start gap-3 border border-red-100">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm">{error}</div>
            </div>
          )}

          <AnimatePresence>
            {showAddForm && isAdmin && (
              <motion.div
                initial={{ opacity: 0, y: -20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -20, height: 0 }}
                className="mb-8 overflow-hidden"
              >
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-900">
                      {editingId ? 'Edit Release Note' : 'New Release Note'}
                    </h3>
                    <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Update Title</label>
                        <input
                          type="text"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="e.g., File Uploads & Drag-and-Drop"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-workspace-accent focus:ring-1 focus:ring-workspace-accent transition-all text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Version</label>
                        <input
                          type="text"
                          value={version}
                          onChange={(e) => setVersion(e.target.value)}
                          placeholder="e.g., v1.2.0"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-workspace-accent focus:ring-1 focus:ring-workspace-accent transition-all text-sm"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Details (Markdown Supported)</label>
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Describe what's new, changed, or fixed..."
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-workspace-accent focus:ring-1 focus:ring-workspace-accent transition-all min-h-[160px] resize-y text-sm font-mono"
                        required
                      />
                    </div>

                    <div className="flex items-center gap-6 pb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="status"
                          value="published"
                          checked={status === 'published'}
                          onChange={() => setStatus('published')}
                          className="w-4 h-4 text-workspace-accent focus:ring-workspace-accent border-slate-300"
                        />
                        <span className="text-sm text-slate-700 font-medium flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-green-500" /> Published
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="status"
                          value="draft"
                          checked={status === 'draft'}
                          onChange={() => setStatus('draft')}
                          className="w-4 h-4 text-workspace-accent focus:ring-workspace-accent border-slate-300"
                        />
                        <span className="text-sm text-slate-700 font-medium flex items-center gap-1.5">
                          <EyeOff className="w-4 h-4 text-slate-400" /> Draft (Hidden)
                        </span>
                      </label>
                    </div>

                    <div className="flex justify-end pt-2 border-t border-slate-100 gap-3">
                      <button
                        type="button"
                        onClick={resetForm}
                        className="px-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-6 py-2 bg-workspace-accent text-white rounded-xl text-sm font-bold shadow-sm hover:bg-workspace-accent/90 focus:ring-2 focus:ring-workspace-accent/20 transition-all disabled:opacity-50"
                      >
                        {isSubmitting ? 'Saving...' : editingId ? 'Update Notes' : 'Publish Notes'}
                      </button>
                    </div>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-8 relative before:absolute before:inset-0 before:ml-[1.125rem] before:-translate-x-px md:before:ml-[5.5rem] md:before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-slate-200 before:via-slate-200 before:to-transparent">
            {updates.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-200">
                  <Rocket className="w-6 h-6 text-slate-400" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">No updates yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  When new features or fixes are released, they will appear here.
                </p>
              </div>
            ) : (
              updates.map((update, idx) => (
                <div key={update.id} className="relative flex items-start gap-6 group">
                  {/* Timeline Node */}
                  <div className="hidden md:flex flex-col items-end w-16 shrink-0 pt-2 text-right">
                    <span className="text-xs font-bold text-slate-900">{format(update.timestamp, 'MMM d')}</span>
                    <span className="text-[10px] text-slate-500 font-mono mt-0.5">{update.version}</span>
                  </div>
                  <div className="flex items-center justify-center w-9 h-9 rounded-full border-4 border-[#F8FAFC] bg-white shadow-sm shrink-0 mt-1.5 z-10 text-workspace-accent">
                    <Rocket className="w-4 h-4" />
                  </div>

                  {/* Content Card */}
                  <div className="flex-1 bg-white rounded-2xl p-6 shadow-sm border border-slate-100 group-hover:border-slate-200 transition-colors">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-lg font-bold text-slate-900 leading-tight tracking-tight">{update.title}</h3>
                          {update.status === 'draft' && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                              Draft
                            </span>
                          )}
                          <span className="md:hidden px-2 py-0.5 rounded-md bg-workspace-accent/10 text-workspace-accent text-[10px] font-mono font-bold">
                            {update.version}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="md:hidden">
                            {format(update.timestamp, 'MMM d, yyyy')} • 
                          </span>
                          <span>Posted by <span className="font-medium text-slate-700">{update.authorName}</span></span>
                        </div>
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEdit(update)}
                            className="p-1.5 text-slate-400 hover:text-workspace-accent rounded-md hover:bg-slate-50 transition-colors"
                            title="Edit Update"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(update.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
                            title="Delete Update"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="prose prose-sm prose-slate max-w-none text-slate-600 prose-headings:font-bold prose-headings:text-slate-900 prose-a:text-workspace-accent whitespace-pre-wrap font-sans">
                      {update.content}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
