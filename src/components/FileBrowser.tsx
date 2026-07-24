import React, { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, orderBy, deleteDoc, doc, limit, updateDoc, addDoc } from 'firebase/firestore';
import { Search, Grid, List as ListIcon, Download, Trash2, Calendar, HardDrive, Filter, File as FileIcon, ImageIcon, FileText, Package, MoreVertical, Users, FolderSync, CheckCircle2, ShieldCheck, AlertCircle, X, History, UploadCloud, ChevronLeft, RotateCcw, Star, Play, Pause, XCircle } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { WorkspaceFile, FileVersion } from '../types';
import { useFirebase } from './FirebaseProvider';
import { formatFileSize, cn, formatDate as format } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { logActivity } from '../lib/audit';

enum OperationType {
  DELETE = 'delete',
  WRITE = 'write',
  LIST = 'list',
  GET = 'get',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
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

export const FileBrowser: React.FC = () => {
  const { user, profile } = useFirebase();
  const { t } = useTranslation();
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState('all');
  const [selectedOwner, setSelectedOwner] = useState('all');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  
  // Local Sync State
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'completed' | 'error'>('idle');
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');
  const [pendingSync, setPendingSync] = useState<WorkspaceFile | 'all' | null>(null);
  const [showSyncConfirmation, setShowSyncConfirmation] = useState(false);
  const [syncSubPath, setSyncSubPath] = useState('');

  // Upload and Versioning state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<Record<string, { 
    name: string; 
    progress: number; 
    status: 'uploading' | 'completed' | 'error' | 'paused' | 'canceled';
    transferredBytes: number;
    totalBytes: number;
    task: any;
  }>>({});
  const [existingFileToVersion, setExistingFileToVersion] = useState<WorkspaceFile | null>(null);
  const [showVersionConfirm, setShowVersionConfirm] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState<WorkspaceFile | null>(null);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);

  const [selectedUploadsDetails, setSelectedUploadsDetails] = useState(null);
  const [selectedFileDetails, setSelectedFileDetails] = useState<WorkspaceFile | null>(null);

  const getCategory = (type: string) => {
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type.includes('pdf') || type.includes('document') || type.includes('text')) return 'document';
    if (type.includes('zip') || type.includes('tar') || type.includes('gzip')) return 'archive';
    return 'other';
  };

  const handleFileSelected = (file: File) => {
    const existingFile = files.find(f => f.name === file.name);
    if (existingFile) {
      setExistingFileToVersion(existingFile);
      setPendingUploadFile(file);
      setShowVersionConfirm(true);
    } else {
      performUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        handleFileSelected(files[i]);
      }
    }
  };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        handleFileSelected(files[i]);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const performUpload = async (file: File, existingFile?: WorkspaceFile, replaceMode: boolean = false) => {
    if (!user || (!user.uid && !user.email)) return;
    const uploadId = Date.now() + Math.random().toString();
    try {
      const MAX_FILE_SIZE = 800 * 1024; // 800KB chunk size for Firestore Preview mock
      if (file.size > MAX_FILE_SIZE) {
        setUploads(prev => ({ 
          ...prev, 
          [uploadId]: { 
            name: file.name, 
            progress: 0, 
            status: 'error', 
            transferredBytes: 0, 
            totalBytes: file.size, 
            task: null 
          } 
        }));
        alert(`File ${file.name} is too large for this preview backend (limit 800KB).\nPlease use a smaller file, or provide your own Firebase project with Storage configured via firebaseConfig.`);
        return;
      }
      
      let progressVal = 0;
      let isPaused = false;
      let isCanceled = false;
      let interval: any;

      const mockTask = {
        pause: () => { isPaused = true; },
        resume: () => { isPaused = false; },
        cancel: () => { isCanceled = true; if (interval) clearInterval(interval); }
      };

      setUploads(prev => ({ 
        ...prev, 
        [uploadId]: { 
          name: file.name, 
          progress: 0, 
          status: 'uploading', 
          transferredBytes: 0, 
          totalBytes: file.size, 
          task: mockTask 
        } 
      }));

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const downloadUrl = reader.result as string;
        
        interval = setInterval(async () => {
          if (isPaused) {
            setUploads(prev => {
              const current = prev[uploadId];
              if(!current) return prev;
              return { ...prev, [uploadId]: { ...current, status: 'paused' } };
            });
            return;
          }
          if (isCanceled) return;

          progressVal += Math.floor(Math.random() * 15) + 5;
          if (progressVal >= 100) progressVal = 100;
          
          setUploads(prev => ({ 
            ...prev, 
            [uploadId]: { 
              ...prev[uploadId], 
              progress: progressVal,
              status: 'uploading',
              transferredBytes: Math.floor((progressVal / 100) * file.size),
              totalBytes: file.size
            } 
          }));

          if (progressVal >= 100) {
            clearInterval(interval);
            
            try {
              const ownerNameDisplay = ('email' in user ? (user.email as string || 'Unknown') : 'Unknown');
              
              if (existingFile) {
                if (replaceMode) {
                  await updateDoc(doc(db, 'files', existingFile.id), {
                    size: file.size,
                    type: file.type,
                    url: downloadUrl,
                    updatedAt: Date.now()
                  });
                } else {
                  const newVersion: FileVersion = {
                    id: Math.random().toString(36).substring(2, 9),
                    url: existingFile.url,
                    size: existingFile.size,
                    createdAt: existingFile.createdAt,
                    ownerId: existingFile.ownerId,
                    ownerName: existingFile.ownerName
                  };
                  await updateDoc(doc(db, 'files', existingFile.id), {
                    size: file.size,
                    type: file.type,
                    url: downloadUrl,
                    ownerId: user.uid,
                    ownerName: ownerNameDisplay,
                    updatedAt: Date.now(),
                    versions: [...(existingFile.versions || []), newVersion]
                  });
                }
              } else {
                await addDoc(collection(db, 'files'), {
                  name: file.name,
                  size: file.size,
                  type: file.type,
                  ownerId: user.uid,
                  ownerName: ownerNameDisplay,
                  url: downloadUrl,
                  createdAt: Date.now(),
                  category: getCategory(file.type),
                  versions: [],
                  important: false,
                  companyName: profile?.companyName || ''
                });
              }
              
              setUploads(prev => ({ ...prev, [uploadId]: { ...prev[uploadId], status: 'completed' } }));
              setTimeout(() => setUploads(prev => { 
                const next = { ...prev }; 
                delete next[uploadId]; 
                return next; 
              }), 3000);
              
              logActivity({
                type: 'file',
                action: 'File Upload',
                details: `Uploaded ${file.name} to Cloud Drive` + (existingFile ? (replaceMode ? ' (Replaced)' : ' (New Version)') : ''),
                severity: 'info'
              });
            } catch (err) {
              console.error(err);
              setUploads(prev => ({ ...prev, [uploadId]: { ...prev[uploadId], status: 'error' } }));
            }
          }
        }, 150);
      };
      
      reader.onerror = (err) => {
        console.error("FileReader error", err);
        setUploads(prev => ({ ...prev, [uploadId]: { ...prev[uploadId], status: 'error' } }));
      }
    } catch (err) {
      console.error(err);
      setUploads(prev => ({ ...prev, [uploadId]: { ...prev[uploadId], status: 'error' } }));
    }
  };

  const revertToVersion = async (mainFile: WorkspaceFile, version: FileVersion) => {
    if (!confirm('Are you sure you want to revert to this version?')) return;
    try {
      const currentAsVersion: FileVersion = {
        id: Math.random().toString(36).substring(2, 9),
        url: mainFile.url,
        size: mainFile.size,
        createdAt: mainFile.createdAt,
        ownerId: mainFile.ownerId,
        ownerName: mainFile.ownerName
      };
      
      const newVersions = (mainFile.versions || []).filter(v => v.id !== version.id);
      newVersions.push(currentAsVersion);
      
      await updateDoc(doc(db, 'files', mainFile.id), {
        url: version.url,
        size: version.size,
        createdAt: version.createdAt,
        ownerId: version.ownerId,
        ownerName: version.ownerName,
        versions: newVersions
      });
      setShowVersionHistory(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `files/${mainFile.id}`);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'files'), orderBy('createdAt', 'desc'), limit(500));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .map(doc => { const data = doc.data(); return { id: doc.id, ...data, important: data.important || false } as WorkspaceFile; })
        .filter(f => f.companyName === profile?.companyName);
      setFiles(list);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'files'));
    return () => unsubscribe();
  }, [profile]);

  const handleLinkDirectory = async () => {
    try {
      // @ts-ignore - showDirectoryPicker is a vendor-specific/experimental API
      const handle = await window.showDirectoryPicker();
      setDirHandle(handle);
    } catch (err) {
      console.error('Directory selection failed', err);
    }
  };

  const getDirHandleForPath = async (baseHandle: FileSystemDirectoryHandle, path: string) => {
    if (!path.trim()) return baseHandle;
    const parts = path.split('/').filter(p => !['', '.', '..'].includes(p));
    let currentHandle = baseHandle;
    for (const part of parts) {
      currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
    }
    return currentHandle;
  };

  const handleConfirmSync = () => {
    if (!pendingSync) return;
    
    if (pendingSync === 'all') {
      performSyncAll();
    } else {
      performSyncFile(pendingSync);
    }
    
    setShowSyncConfirmation(false);
    setPendingSync(null);
    setSyncSubPath('');
  };

  const syncAllToLocal = async () => {
    if (!dirHandle) return;
    setPendingSync('all');
    setShowSyncConfirmation(true);
  };

  const performSyncAll = async () => {
    if (!dirHandle) return;
    setSyncStatus('syncing');
    setSyncProgress(0);
    setSyncMessage(t('common.loading'));

    try {
      let completed = 0;
      const targetDir = await getDirHandleForPath(dirHandle, syncSubPath);
      
      for (const file of files) {
        try {
          completed++;
          setSyncProgress(Math.round((completed / files.length) * 100));
          setSyncMessage(`Syncing ${completed}/${files.length}: ${file.name}`);
          
          const response = await fetch(file.url);
          const blob = await response.blob();
          
          const fileHandle = await targetDir.getFileHandle(file.name, { create: true });
          // @ts-ignore
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (fileErr) {
          console.error(`Failed to sync ${file.name}`, fileErr);
        }
      }
      
      setSyncStatus('completed');
      setSyncMessage(`Successfully synced ${files.length} files to ${targetDir.name}`);
      
      logActivity({
        type: 'file',
        action: 'Bulk Local Sync',
        details: `Synced ${files.length} files to local directory: ${targetDir.name}${syncSubPath ? ` (subpath: ${syncSubPath})` : ''}`,
        severity: 'info'
      });

      // Clear success state after 5 seconds
      setTimeout(() => {
        setSyncStatus('idle');
        setSyncProgress(0);
        setSyncMessage('');
      }, 5000);
    } catch (err) {
      console.error('Global sync failed', err);
      setSyncStatus('error');
      setSyncMessage('Sync failed. Please check your permissions.');
      setTimeout(() => {
        setSyncStatus('idle');
        setSyncProgress(0);
        setSyncMessage('');
      }, 5000);
    }
  };

  const syncFileToLocal = async (file: WorkspaceFile) => {
    if (!dirHandle) {
      alert("Please link a local folder first using the 'Local Fail-Safe' button at the top.");
      return;
    }
    setPendingSync(file);
    setShowSyncConfirmation(true);
  };

  const performSyncFile = async (file: WorkspaceFile) => {
    if (!dirHandle) return;
    try {
      const response = await fetch(file.url);
      const blob = await response.blob();
      const targetDir = await getDirHandleForPath(dirHandle, syncSubPath);
      const fileHandle = await targetDir.getFileHandle(file.name, { create: true });
      // @ts-ignore
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      
      logActivity({
        type: 'file',
        action: 'Local File Sync',
        details: `Saved file: ${file.name} to ${targetDir.name}${syncSubPath ? ` (subpath: ${syncSubPath})` : ''}`,
        severity: 'info'
      });
    } catch (err) {
      console.error('File sync failed', err);
    }
  };

  const filteredFiles = files.filter(f => {
    const matchesSearch = (f.name || "").toLowerCase().includes((search || "").toLowerCase());
    const matchesFilter = filter === 'all' || f.category === filter;
    const matchesOwner = selectedOwner === 'all' || f.ownerId === selectedOwner;
    return matchesSearch && matchesFilter && matchesOwner;
  });

  const owners = Array.from(new Set(files.map(f => f.ownerId))).map(id => {
    const file = files.find(f => f.ownerId === id);
    return { id, name: file?.ownerName || 'Unknown' };
  });

  const toggleFileSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDownload = () => {
    files.filter(f => selectedFiles.has(f.id)).forEach(f => {
      const link = document.createElement('a');
      link.href = f.url;
      link.download = f.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
    setSelectedFiles(new Set());
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedFiles.size} files?`)) return;
    try {
      await Promise.all(Array.from(selectedFiles).map(id => deleteDoc(doc(db, 'files', id))));
      setSelectedFiles(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'bulk-delete');
    }
  };

  const handleBulkToggleImportant = async (important: boolean) => {
    try {
      await Promise.all(Array.from(selectedFiles).map(id => updateDoc(doc(db, 'files', id), { important })));
      setSelectedFiles(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'bulk-toggle-important');
    }
  };

  const toggleImportant = async (file: WorkspaceFile) => {
    try {
      await updateDoc(doc(db, 'files', file.id), {
        important: !file.important
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `files/${file.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this file from the workspace?')) {
      try {
        await deleteDoc(doc(db, 'files', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `files/${id}`);
      }
    }
  };

  const getFileIcon = (fileName: string, category: string) => {
    const ext = (fileName || '').split('.').pop()?.toLowerCase();
    
    if (category === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext!)) {
      return <ImageIcon className="w-8 h-8 text-purple-500" />;
    }
    if (category === 'document' || ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'csv'].includes(ext!)) {
      return <FileText className="w-8 h-8 text-blue-500" />;
    }
    if (category === 'archive' || ['zip', 'rar', '7z', 'gz', 'tar'].includes(ext!)) {
      return <Package className="w-8 h-8 text-orange-500" />;
    }
    return <FileIcon className="w-8 h-8 text-slate-400" />;
  };

  return (
    <div 
      className="flex-1 flex flex-col bg-slate-50 h-full relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input 
        type="file" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleInputChange}
      />
      
      {/* Upload Drag Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-workspace-accent/90 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-white m-4 rounded-[2rem]"
          >
            <div className="text-center text-white">
              <UploadCloud className="w-24 h-24 mx-auto mb-6 animate-bounce" />
              <h2 className="text-4xl font-black mb-2">Drop it like it's hot</h2>
              <p className="text-lg opacity-80 font-medium">Release to upload to Cloud Drive</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Uploads Container */}
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-8 sm:right-8 z-[60] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {Object.entries(uploads).map(([id, upload]) => (
            <motion.div 
              key={id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 w-full sm:w-72 pointer-events-auto"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0",
                  upload.status === 'completed' ? "bg-green-500" : upload.status === 'error' ? "bg-red-500" : upload.status === 'paused' ? "bg-amber-500" : upload.status === 'canceled' ? "bg-slate-400" : "bg-workspace-accent"
                )}>
                  {upload.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : 
                   upload.status === 'error' ? <AlertCircle className="w-5 h-5" /> : 
                   upload.status === 'paused' ? <Pause className="w-5 h-5" /> : 
                   upload.status === 'canceled' ? <XCircle className="w-5 h-5" /> :
                   <UploadCloud className="w-5 h-5 animate-pulse" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate" title={upload.name}>
                    {upload.name}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                    {upload.status === 'uploading' || upload.status === 'paused' ? (
                      `${formatFileSize(upload.transferredBytes || 0)} / ${formatFileSize(upload.totalBytes || 0)} • ${upload.progress}%`
                    ) : upload.status === 'completed' ? (
                      "Upload complete"
                    ) : upload.status === 'canceled' ? (
                      "Upload canceled"
                    ) : (
                      "Upload failed"
                    )}
                  </p>
                </div>
              </div>
              {(upload.status === 'uploading' || upload.status === 'paused') && (
                <>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                    <motion.div 
                      className={cn("h-full rounded-full transition-colors", upload.status === 'paused' ? "bg-amber-400" : "bg-workspace-accent")}
                      initial={{ width: 0 }}
                      animate={{ width: `${upload.progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-slate-50 pt-2">
                    {upload.status === 'uploading' ? (
                      <button onClick={() => upload.task?.pause()} className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors flex items-center justify-center" title="Pause">
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button onClick={() => upload.task?.resume()} className="p-1.5 text-slate-400 hover:text-green-500 hover:bg-green-50 rounded-lg transition-colors flex items-center justify-center" title="Resume">
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => { upload.task?.cancel(); setUploads(prev => ({...prev, [id]: {...prev[id], status: 'canceled'}})); setTimeout(() => setUploads(prev => {const next = {...prev}; delete next[id]; return next;}), 3000); }} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center" title="Cancel">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header */}
      <div className="p-8 bg-white border-b border-slate-200">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-2 text-workspace-accent mb-1">
              <HardDrive className="w-4 h-4" />
              <span className="text-[10px] font-mono tracking-widest uppercase font-bold">Cloud Drive</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t('files.title')}</h1>
            <p className="text-slate-500 text-sm mt-1">{t('files.subtitle')} (Drag & Drop files here to upload)</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="bg-workspace-accent text-white px-5 py-3 rounded-[1.5rem] font-bold shadow-lg shadow-workspace-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
            >
              <UploadCloud className="w-5 h-5" />
              <span>Upload File</span>
            </button>
            {/* Local Sync Control */}
            <div className={cn(
              "flex items-center gap-3 p-1.5 rounded-[1.5rem] border transition-all duration-500 relative overflow-hidden",
              dirHandle ? "bg-green-50 border-green-100" : "bg-slate-50 border-slate-100"
            )}>
              {/* Progress Background */}
              {syncStatus === 'syncing' && (
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${syncProgress}%` }}
                  className="absolute inset-0 bg-green-500/10 pointer-events-none"
                />
              )}

              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-colors relative z-10",
                dirHandle ? "bg-white text-green-600" : "bg-white text-slate-400"
              )}>
                {syncStatus === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 animate-[bounce_0.5s_ease-out]" />
                ) : syncStatus === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <FolderSync className={cn("w-5 h-5", syncStatus === 'syncing' && "animate-spin")} />
                )}
              </div>
              
              <div className="pr-4 relative z-10">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'completed' ? 'Completed' : syncStatus === 'error' ? 'Sync Error' : 'Local Fail-Safe'}
                  </span>
                  {dirHandle && syncStatus === 'completed' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                </div>
                {dirHandle ? (
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <p className="text-xs font-bold text-slate-700 truncate max-w-[120px]">
                        {syncStatus === 'completed' ? 'All files synced!' : dirHandle.name}
                      </p>
                      {syncStatus === 'syncing' && (
                        <p className="text-[9px] text-slate-400 truncate max-w-[120px] font-mono">
                          {syncMessage}
                        </p>
                      )}
                    </div>
                    <button 
                      onClick={syncAllToLocal}
                      disabled={syncStatus === 'syncing'}
                      className={cn(
                        "text-[10px] px-3 py-1 rounded-full font-bold transition-all disabled:opacity-50",
                        syncStatus === 'completed' 
                          ? "bg-green-600 text-white" 
                          : "bg-slate-900 text-white hover:bg-slate-800"
                      )}
                    >
                      {syncStatus === 'syncing' ? `${syncProgress}%` : t('files.syncLocal')}
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handleLinkDirectory}
                    className="text-xs font-bold text-workspace-accent hover:underline flex items-center gap-1"
                  >
                    Link Local Folder <ShieldCheck className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl h-fit">
              <button 
                onClick={() => setView('grid')}
                className={cn("p-2 rounded-lg transition-all", view === 'grid' ? "bg-white shadow-sm text-workspace-accent" : "text-slate-400")}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setView('list')}
                className={cn("p-2 rounded-lg transition-all", view === 'list' ? "bg-white shadow-sm text-workspace-accent" : "text-slate-400")}
              >
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[300px] relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-workspace-accent transition-colors" />
            <input 
              type="text" 
              placeholder={t('files.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-10 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-workspace-accent/10 focus:border-workspace-accent focus:bg-white transition-all outline-none shadow-sm"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
              {['all', 'document', 'image', 'archive', 'other'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border whitespace-nowrap",
                    filter === cat 
                      ? "bg-workspace-accent border-workspace-accent text-white shadow-lg shadow-workspace-accent/20" 
                      : "bg-white border-slate-100 text-slate-500 hover:border-slate-200"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {owners.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">
                  <Users className="w-3 h-3" />
                  <span>{t('files.filterByOwner')}</span>
                </div>
                <select
                  value={selectedOwner}
                  onChange={(e) => setSelectedOwner(e.target.value)}
                  className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border border-slate-100 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-workspace-accent/20 cursor-pointer"
                >
                  <option value="all">{t('files.allOwners')}</option>
                  {owners.map(owner => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <AnimatePresence>
          {showVersionConfirm && existingFileToVersion && pendingUploadFile && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => { setShowVersionConfirm(false); setPendingUploadFile(null); setExistingFileToVersion(null); }}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl overflow-hidden mx-4 sm:mx-0"
              >
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-workspace-accent/10 rounded-2xl flex items-center justify-center mb-6 text-workspace-accent">
                    <History className="w-8 h-8" />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">File Already Exists</h3>
                  <p className="text-slate-600 mb-6 leading-relaxed text-sm">
                    A file named <strong>{existingFileToVersion.name}</strong> already exists in your workspace. Do you want to replace it or save this as a new version?
                  </p>
                  
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => {
                        performUpload(pendingUploadFile, existingFileToVersion, false);
                        setShowVersionConfirm(false);
                      }}
                      className="w-full bg-workspace-accent text-white px-6 py-3.5 rounded-2xl font-bold shadow-lg shadow-workspace-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                      <History className="w-4 h-4" />
                      Save as New Version
                    </button>
                    <button 
                      onClick={() => {
                        performUpload(pendingUploadFile, existingFileToVersion, true);
                        setShowVersionConfirm(false);
                      }}
                      className="w-full bg-slate-100 text-slate-700 hover:bg-slate-200 px-6 py-3.5 rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Replace Current Version
                    </button>
                    <button 
                      onClick={() => { setShowVersionConfirm(false); setPendingUploadFile(null); setExistingFileToVersion(null); }}
                      className="w-full text-slate-500 hover:text-slate-700 px-6 py-3.5 rounded-2xl font-bold transition-all mt-2"
                    >
                      Cancel Upload
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showVersionHistory && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowVersionHistory(null)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] shadow-2xl flex flex-col"
              >
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                  <div className="flex items-center gap-3 relative z-10">
                    <div className="w-10 h-10 bg-workspace-accent/10 rounded-xl flex items-center justify-center text-workspace-accent">
                      <History className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 leading-tight">Version History</h3>
                      <p className="text-slate-500 text-xs truncate max-w-sm">{showVersionHistory.name}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowVersionHistory(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all z-10">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                  <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                    {/* Current Version */}
                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-workspace-accent text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl border border-workspace-accent/20 bg-workspace-accent/5 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-900 text-sm">Current Version</span>
                          <span className="text-[10px] font-mono text-slate-500">{formatFileSize(showVersionHistory.size)}</span>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center justify-between">
                          <span>Updated by {showVersionHistory.ownerName}</span>
                          <span className="italic">{format(showVersionHistory.createdAt, 'MMM d, p')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Previous Versions */}
                    {showVersionHistory.versions && [...showVersionHistory.versions].sort((a, b) => b.createdAt - a.createdAt).map((v) => (
                      <div key={v.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-slate-100 text-slate-400 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                          <FileIcon className="w-4 h-4" />
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl border border-slate-100 bg-white hover:border-slate-200 transition-colors group-hover:shadow-md">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-700 text-sm">Previous Version</span>
                            <span className="text-[10px] font-mono text-slate-400">{formatFileSize(v.size)}</span>
                          </div>
                          <div className="text-xs text-slate-500 mb-3 flex items-center justify-between">
                            <span>By {v.ownerName}</span>
                            <span className="italic">{format(v.createdAt, 'MMM d, p')}</span>
                          </div>
                          <div className="flex items-center gap-2 border-t border-slate-50 pt-3">
                            <a 
                              href={v.url} 
                              download={showVersionHistory.name}
                              className="flex-1 flex justify-center items-center gap-1 py-1.5 px-3 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px] uppercase font-bold tracking-wider rounded-lg transition-colors"
                            >
                              <Download className="w-3 h-3" /> Download
                            </a>
                            <button 
                              onClick={() => revertToVersion(showVersionHistory, v)}
                              className="flex-1 flex justify-center items-center gap-1 py-1.5 px-3 bg-workspace-accent text-white hover:bg-workspace-accent/90 text-[10px] uppercase font-bold tracking-wider rounded-lg transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" /> Revert
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {(!showVersionHistory.versions || showVersionHistory.versions.length === 0) && (
                      <div className="text-center py-6 text-slate-400 text-sm italic">
                        No previous versions available
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showSyncConfirmation && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSyncConfirmation(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl overflow-hidden mx-4 sm:mx-0"
              >
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <FolderSync className="w-32 h-32 text-workspace-accent" />
                </div>
                
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-workspace-accent/10 rounded-2xl flex items-center justify-center mb-6">
                    <ShieldCheck className="w-8 h-8 text-workspace-accent" />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">{t('files.confirmSync')}</h3>
                  <p className="text-slate-600 mb-6 leading-relaxed">
                    {t('files.confirmSyncMessage')}
                  </p>

                  <div className="mb-8">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 px-1">
                      {t('files.syncPathLabel')}
                    </label>
                    <div className="relative group/input">
                      <HardDrive className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/input:text-workspace-accent transition-colors" />
                      <input 
                        type="text" 
                        value={syncSubPath}
                        onChange={(e) => setSyncSubPath(e.target.value)}
                        placeholder={t('files.syncPathPlaceholder')}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-workspace-accent/10 focus:border-workspace-accent focus:bg-white transition-all outline-none"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setShowSyncConfirmation(false)}
                      className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all uppercase tracking-widest text-xs"
                    >
                      {t('common.cancel')}
                    </button>
                    <button 
                      onClick={handleConfirmSync}
                      className="flex-1 bg-workspace-accent text-white px-6 py-3.5 rounded-2xl font-bold shadow-lg shadow-workspace-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {t('files.syncProceed')}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedFileDetails && (
            <div className="fixed inset-0 z-50 flex items-center justify-end p-0">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedFileDetails(null)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col z-10 overflow-hidden border-l border-slate-200"
              >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-100 shadow-sm">
                      {getFileIcon(selectedFileDetails.name, selectedFileDetails.category)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 leading-tight truncate max-w-[200px]" title={selectedFileDetails.name}>
                        {selectedFileDetails.name}
                      </h3>
                      <p className="text-slate-500 text-[10px] font-mono capitalize mt-0.5">
                        {selectedFileDetails.category} • {formatFileSize(selectedFileDetails.size)}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedFileDetails(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Details Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                  {/* Info Grid */}
                  <div className="bg-slate-50 rounded-2xl p-5 space-y-4 border border-slate-100">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Date Added</span>
                      <span className="text-sm font-medium text-slate-900">{format(selectedFileDetails.createdAt, 'PP p')}</span>
                    </div>
                    {selectedFileDetails.updatedAt && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5"><RotateCcw className="w-3 h-3" /> Last Modified</span>
                        <span className="text-sm font-medium text-slate-900">{format(selectedFileDetails.updatedAt, 'PP p')}</span>
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5"><Users className="w-3 h-3" /> Owner</span>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-6 h-6 rounded-md bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                          {(selectedFileDetails.ownerName || "").charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-slate-900">{selectedFileDetails.ownerName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Versions */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <History className="w-4 h-4 text-workspace-accent" /> 
                        Version History
                      </h4>
                      <span className="text-xs font-bold text-workspace-accent bg-workspace-accent/10 px-2 py-0.5 rounded-full">
                        {(selectedFileDetails.versions?.length || 0) + 1} versions
                      </span>
                    </div>
                    
                    <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-slate-200 before:to-transparent">
                      {/* Current */}
                      <div className="relative flex items-start gap-4 z-10 group">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-workspace-accent text-white shadow-sm shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-900">Current Version</span>
                            <span className="text-[10px] font-mono text-slate-500">{formatFileSize(selectedFileDetails.size)}</span>
                          </div>
                          <span className="text-xs text-slate-500 block mt-0.5">By {selectedFileDetails.ownerName} • {format(selectedFileDetails.updatedAt || selectedFileDetails.createdAt, 'MMM d, p')}</span>
                        </div>
                      </div>

                      {/* Older */}
                      {selectedFileDetails.versions && [...selectedFileDetails.versions].sort((a,b) => b.createdAt - a.createdAt).map(v => (
                        <div key={v.id} className="relative flex items-start gap-4 z-10 group">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-slate-100 text-slate-400 shadow-sm shrink-0">
                            <FileIcon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 pt-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-700">Previous Version</span>
                              <span className="text-[10px] font-mono text-slate-500">{formatFileSize(v.size)}</span>
                            </div>
                            <span className="text-xs text-slate-500 block mt-0.5">By {v.ownerName} • {format(v.createdAt, 'MMM d, p')}</span>
                            <div className="flex items-center gap-2 mt-2">
                              <a href={v.url} download={selectedFileDetails.name} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-workspace-accent flex items-center gap-1 transition-colors">
                                <Download className="w-3 h-3" /> Download
                              </a>
                              <button onClick={() => revertToVersion(selectedFileDetails, v)} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-workspace-accent flex items-center gap-1 transition-colors">
                                <RotateCcw className="w-3 h-3" /> Revert
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="p-6 border-t border-slate-100 bg-slate-50/50">
                  <a 
                    href={selectedFileDetails.url}
                    download={selectedFileDetails.name}
                    className="w-full bg-workspace-accent text-white px-6 py-4 rounded-2xl font-bold shadow-lg shadow-workspace-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Download File
                  </a>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {filteredFiles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-20">
            <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mb-6 border-2 border-dashed border-slate-200">
              <HardDrive className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">{t('empty.files')}</h3>
            <p className="text-slate-500 text-sm mt-1 max-w-xs mx-auto">{t('empty.filesSubtitle')}</p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredFiles.map(file => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  key={file.id}
                  onClick={() => setSelectedFileDetails(file)}
                  className="glass-panel rounded-2xl overflow-hidden group hover:shadow-xl transition-all duration-300 border-none bg-white p-2 cursor-pointer"
                >
                  <div className="aspect-square bg-slate-50 rounded-xl mb-3 flex items-center justify-center relative overflow-hidden group-hover:bg-slate-100 transition-colors">
                    {getFileIcon(file.name, file.category)}
                    
                    {/* Overlay Actions */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button 
                        onClick={(e) => toggleFileSelection(file.id, e)}
                        className={cn("p-2 bg-white rounded-lg transition-transform hover:scale-110", selectedFiles.has(file.id) ? "text-workspace-accent" : "text-slate-400")}
                        title="Select File"
                      >
                         <CheckCircle2 className={cn("w-4 h-4", selectedFiles.has(file.id) && "fill-current")} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleImportant(file); }}
                        className={cn("p-2 bg-white rounded-lg transition-transform hover:scale-110", file.important ? "text-amber-500" : "text-slate-400")}
                        title="Toggle Important"
                      >
                        <Star className={cn("w-4 h-4", file.important && "fill-current")} />
                      </button>
                      {file.versions && file.versions.length > 0 && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setShowVersionHistory(file); }}
                          className="p-2 bg-white rounded-lg text-workspace-accent hover:scale-110 transition-transform relative"
                          title="View Version History"
                        >
                          <History className="w-4 h-4" />
                          <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-workspace-accent text-[8px] font-bold text-white shadow-sm ring-2 ring-white">
                            {file.versions.length}
                          </span>
                        </button>
                      )}
                      <a 
                        href={file.url} 
                        download={file.name}
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 bg-white rounded-lg text-slate-900 hover:scale-110 transition-transform"
                        title="Download to Browser"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      {dirHandle && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); syncFileToLocal(file); }}
                          className="p-2 bg-workspace-accent rounded-lg text-white hover:scale-110 transition-transform"
                          title="Sync to Local Folder"
                        >
                          <FolderSync className="w-4 h-4" />
                        </button>
                      )}
                      {file.ownerId === user?.uid && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }}
                          className="p-2 bg-white rounded-lg text-red-500 hover:scale-110 transition-transform"
                          title="Delete File"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="px-2 pb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900 truncate" title={file.name}>{file.name}</h4>
                      {file.important && <Star className="w-3 h-3 text-amber-500 fill-current" />}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] font-mono text-slate-400 capitalize">{file.category}</span>
                      <span className="text-[10px] font-mono text-slate-400">{formatFileSize(file.size)}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 pt-3 border-t border-slate-50">
                      <div className="w-5 h-5 rounded-md bg-slate-100 overflow-hidden flex-shrink-0">
                        <Users className="w-3 h-3 m-1 text-slate-400" />
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium truncate">{file.ownerName}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 uppercase text-[10px] font-mono tracking-widest text-slate-400">
                  <th className="px-6 py-4 font-bold">File Name</th>
                  <th className="px-6 py-4 font-bold">Owner</th>
                  <th className="px-6 py-4 font-bold">Date Added</th>
                  <th className="px-6 py-4 font-bold text-right">Size</th>
                  <th className="px-6 py-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredFiles.map(file => (
                  <tr key={file.id} onClick={() => setSelectedFileDetails(file)} className="hover:bg-slate-50/50 transition-colors group cursor-pointer">
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={selectedFiles.has(file.id)}
                        onChange={() => {
                          setSelectedFiles(prev => {
                            const next = new Set(prev);
                            if (next.has(file.id)) next.delete(file.id);
                            else next.add(file.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100">
                          {getFileIcon(file.name, file.category)}
                        </div>
                        <span className="text-sm font-bold text-slate-900 truncate max-w-[200px]">{file.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{file.ownerName}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono italic">
                      {format(file.createdAt, 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono text-right">{formatFileSize(file.size)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {file.versions && file.versions.length > 0 && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setShowVersionHistory(file); }}
                            className="p-2 hover:bg-white rounded-lg text-workspace-accent border border-transparent hover:border-slate-100 transition-all font-bold text-[10px] flex items-center gap-2 relative"
                          >
                            <History className="w-4 h-4" />
                            <span className="absolute top-1 right-1 flex h-3 w-3 items-center justify-center rounded-full bg-workspace-accent text-[8px] font-bold text-white shadow-sm">
                              {file.versions.length}
                            </span>
                            <span className="hidden xl:inline">History</span>
                          </button>
                        )}
                        <a 
                          href={file.url} 
                          download={file.name}
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 hover:bg-white rounded-lg text-slate-400 hover:text-workspace-accent border border-transparent hover:border-slate-100 transition-all font-bold text-[10px] flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          <span className="hidden xl:inline">{t('files.download')}</span>
                        </a>
                        {dirHandle && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); syncFileToLocal(file); }}
                            className="p-2 hover:bg-white rounded-lg text-workspace-accent border border-transparent hover:border-slate-100 transition-all font-bold text-[10px] flex items-center gap-2"
                          >
                            <FolderSync className="w-4 h-4" />
                            <span className="hidden xl:inline">{t('files.syncLocal')}</span>
                          </button>
                        )}
                        {file.ownerId === user?.uid && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }}
                            className="p-2 hover:bg-white rounded-lg text-slate-400 hover:text-red-500 border border-transparent hover:border-slate-100 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Bulk Action Bar */}
        <AnimatePresence>
          {selectedFiles.size > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-white rounded-2xl shadow-2xl p-4 flex items-center justify-between border border-slate-200 gap-4 min-w-[400px]"
            >
              <span className="font-bold text-sm text-slate-900">{selectedFiles.size} files selected</span>
              <div className="flex gap-2">
                <button onClick={handleBulkDownload} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100">Download</button>
                <button onClick={() => handleBulkToggleImportant(true)} className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-xs font-bold hover:bg-amber-100">Important</button>
                <button onClick={handleBulkDelete} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100">Delete</button>
                <button onClick={() => setSelectedFiles(new Set())} className="px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-xs font-bold">Clear</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
};
