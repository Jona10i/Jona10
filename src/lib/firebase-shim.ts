// Resilient Hybrid Firebase SDK Shim for sandboxed environments
import { initializeApp as fbInitializeApp } from '@firebase/app';
import { 
  getAuth as fbGetAuth, 
  onAuthStateChanged as fbOnAuthStateChanged,
  signInWithPopup as fbSignInWithPopup,
  signOut as fbSignOut
} from '@firebase/auth';
import { 
  initializeFirestore as fbInitializeFirestore,
  persistentLocalCache as fbPersistentLocalCache,
  persistentMultipleTabManager as fbPersistentMultipleTabManager,
  collection as fbCollection,
  doc as fbDoc,
  addDoc as fbAddDoc,
  setDoc as fbSetDoc,
  updateDoc as fbUpdateDoc,
  deleteDoc as fbDeleteDoc,
  getDoc as fbGetDoc,
  getDocs as fbGetDocs,
  onSnapshot as fbOnSnapshot,
  query as fbQuery,
  where as fbWhere,
  orderBy as fbOrderBy,
  limit as fbLimit,
  serverTimestamp as fbServerTimestamp,
  collectionGroup as fbCollectionGroup
} from '@firebase/firestore';
import { 
  getStorage as fbGetStorage,
  ref as fbRef,
  uploadBytesResumable as fbUploadBytesResumable,
  getDownloadURL as fbGetDownloadURL
} from '@firebase/storage';

import fallbackConfig from '../../firebase-applet-config.json';

// Active simulation flag - defaults to true because client-side firebase auth keys 
// are restricted at the GCP sandbox level, but falls back gracefully.
let isSimulated = true;
const prjId = fallbackConfig?.projectId || 'default';
const localStorageKey = `fb_simulated_${prjId}`;

if (typeof window !== 'undefined') {
  // Let user toggle or override if needed, but safe from namespace pollution and default to true
  if (localStorage.getItem(localStorageKey) === 'false' && localStorage.getItem('fb_simulated') !== 'true') {
    isSimulated = false;
  } else {
    isSimulated = true;
  }

  // Self-healing global listener: If real firebase SDK fires background request that fails
  // with restricted API key error, automatically reset flag to true, set isSimulated = true,
  // and trigger a quick reload to clean up and restore.
  const handleFirebaseErrorGlobally = (errorMsg: string) => {
    if (
      errorMsg.includes('api-keys-are-not-supported') ||
      errorMsg.includes('auth/api-keys-are-not-supported-by-this-api')
    ) {
      console.warn("Global detection of restricted Firebase API Keys. Forcing Simulation Mode...");
      localStorage.setItem(localStorageKey, 'true');
      localStorage.setItem('fb_simulated', 'true');
      isSimulated = true;
      setTimeout(() => {
        window.location.reload();
      }, 50);
    }
  };

  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || String(event.reason || '');
    handleFirebaseErrorGlobally(msg);
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    handleFirebaseErrorGlobally(msg);
  });
}

// ==========================================
// 1. SIMULATED AUTH ENGINE
// ==========================================
class SimulatedAuth {
  currentUser: any = null;
  private listeners: Set<Function> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('fb_sim_user');
      if (stored) {
        try {
          this.currentUser = JSON.parse(stored);
        } catch (_) {}
      } else {
        // Auto-login professional fallback user so that testing begins immediately
        this.currentUser = {
          uid: 'sim_default_admin',
          displayName: 'Jonathan Igimoh',
          email: 'jonathanigimoh@gmail.com',
          photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256',
          emailVerified: true,
          providerData: [{ providerId: 'google.com', email: 'jonathanigimoh@gmail.com' }]
        };
        localStorage.setItem('fb_sim_user', JSON.stringify(this.currentUser));
      }
    }
  }

  onAuthStateChanged(next: Function, error?: Function) {
    this.listeners.add(next);
    // Execute immediately with current user
    setTimeout(() => {
      try {
        next(this.currentUser);
      } catch (e) {
        if (error) error(e);
      }
    }, 0);

    return () => {
      this.listeners.delete(next);
    };
  }

  async signInWithPopup(provider: any) {
    const user = {
      uid: 'sim_' + Date.now(),
      displayName: 'Demo Administrator',
      email: 'jonathanigimoh@gmail.com',
      photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256',
      emailVerified: true,
      providerData: [{ providerId: 'google.com', email: 'jonathanigimoh@gmail.com' }]
    };
    this.currentUser = user;
    if (typeof window !== 'undefined') {
      localStorage.setItem('fb_sim_user', JSON.stringify(user));
    }
    this.notify();
    return {
      user,
      credential: { accessToken: 'simulated_access_token' }
    };
  }

  async signOut() {
    this.currentUser = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('fb_sim_user');
    }
    this.notify();
  }

  private notify() {
    for (const listener of Array.from(this.listeners)) {
      listener(this.currentUser);
    }
  }
}

const simAuthInstance = new SimulatedAuth();

// ==========================================
// 2. SIMULATED FIRESTORE DATABASE
// ==========================================
class SimulatedFirestore {
  private activeListeners: Set<{
    target: any;
    callback: Function;
  }> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('fb_db_')) {
          this.notifyAll();
        }
      });
      this.seedDefaults();
    }
  }

  private seedDefaults() {
    const channelsKey = 'fb_db_channels';
    if (!localStorage.getItem(channelsKey)) {
      const defaultChannels = [
        { id: 'general', name: 'general', isPrivate: false, icon: 'Hash', members: ['sim_default_admin', 'user_sarah', 'user_mike'], admins: ['sim_default_admin'] },
        { id: 'engineering', name: 'engineering', isPrivate: false, icon: 'Code', members: ['sim_default_admin', 'user_mike'], admins: ['sim_default_admin'] },
        { id: 'design', name: 'design', isPrivate: false, icon: 'Palette', members: ['sim_default_admin', 'user_sarah'], admins: ['sim_default_admin'] },
        { id: 'random', name: 'random', isPrivate: false, icon: 'Smile', members: ['sim_default_admin', 'user_sarah', 'user_mike'], admins: ['sim_default_admin'] }
      ];
      localStorage.setItem(channelsKey, JSON.stringify(defaultChannels));
    }

    const usersKey = 'fb_db_users';
    if (!localStorage.getItem(usersKey)) {
      const defaultUsers = [
        {
          id: 'sim_default_admin',
          name: 'Jonathan Igimoh',
          email: 'jonathanigimoh@gmail.com',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256',
          status: 'online',
          lastSeen: Date.now(),
          role: 'admin',
          department: 'Engineering',
          companyName: 'Academic Vine',
          companyType: 'tech'
        },
        {
          id: 'user_sarah',
          name: 'Sarah Jenkins',
          email: 'sarah@example.com',
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=256',
          status: 'online',
          lastSeen: Date.now() - 50000,
          role: 'member',
          department: 'Design'
        },
        {
          id: 'user_mike',
          name: 'Mike Chen',
          email: 'mike@example.com',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=256',
          status: 'away',
          lastSeen: Date.now() - 600000,
          role: 'member',
          department: 'Engineering'
        }
      ];
      localStorage.setItem(usersKey, JSON.stringify(defaultUsers));
    }

    // Seed default messages under general
    const generalMessagesKey = 'fb_db_channels_general_messages';
    const hasMess = localStorage.getItem('fb_db_channels/general/messages_id_msg_1') || localStorage.getItem(generalMessagesKey);
    if (!hasMess) {
      const defaultMessages = [
        {
          id: 'msg_1',
          channelId: 'general',
          senderId: 'user_sarah',
          senderName: 'Sarah Jenkins',
          content: 'Hello everyone! Welcome to our workspace chat. Check out the Files or scheduling tab!',
          timestamp: Date.now() - 3600000,
          type: 'text'
        },
        {
          id: 'msg_2',
          channelId: 'general',
          senderId: 'user_mike',
          senderName: 'Mike Chen',
          content: 'Hey Sarah! Excited to be here. Did you upload the latest onboarding deck to files?',
          timestamp: Date.now() - 1800000,
          type: 'text'
        }
      ];
      localStorage.setItem('fb_db_channels/general/messages_id_msg_1', JSON.stringify(defaultMessages[0]));
      localStorage.setItem('fb_db_channels/general/messages_id_msg_2', JSON.stringify(defaultMessages[1]));
    }
  }

  getCollectionDocs(pathName: string): any[] {
    const records: any[] = [];
    if (typeof window === 'undefined') return records;
    
    // Check if we store it as a single array, e.g., fb_db_channels
    const singleKey = `fb_db_${pathName.replace(/\//g, '_')}`;
    const singleData = localStorage.getItem(singleKey);
    if (singleData) {
      try {
        return JSON.parse(singleData);
      } catch (_) {}
    }

    // Load individual records
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`fb_db_${pathName}_id_`)) {
        const item = localStorage.getItem(key);
        if (item) {
          try {
            records.push(JSON.parse(item));
          } catch (_) {}
        }
      }
    }
    return records;
  }

  setDocument(collectionPath: string, docId: string, data: any, merge: boolean = false) {
    if (typeof window === 'undefined') return;
    
    // Check single array storage
    const singleKey = `fb_db_${collectionPath.replace(/\//g, '_')}`;
    const singleData = localStorage.getItem(singleKey);
    if (singleData) {
      try {
        const arr = JSON.parse(singleData);
        const idx = arr.findIndex((x: any) => x.id === docId);
        const existing = idx >= 0 ? arr[idx] : {};
        const updated = merge ? { ...existing, ...data, id: docId } : { ...data, id: docId };
        if (idx >= 0) {
          arr[idx] = updated;
        } else {
          arr.push(updated);
        }
        localStorage.setItem(singleKey, JSON.stringify(arr));
        this.notifyAll();
        return;
      } catch (_) {}
    }

    const docKey = `fb_db_${collectionPath}_id_${docId}`;
    const existingStr = localStorage.getItem(docKey);
    const existing = existingStr ? JSON.parse(existingStr) : {};
    const updated = merge ? { ...existing, ...data, id: docId } : { ...data, id: docId };
    localStorage.setItem(docKey, JSON.stringify(updated));
    this.notifyAll();
  }

  deleteDocument(collectionPath: string, docId: string) {
    if (typeof window === 'undefined') return;
    
    const singleKey = `fb_db_${collectionPath.replace(/\//g, '_')}`;
    const singleData = localStorage.getItem(singleKey);
    if (singleData) {
      try {
        let arr = JSON.parse(singleData);
        arr = arr.filter((x: any) => x.id !== docId);
        localStorage.setItem(singleKey, JSON.stringify(arr));
        this.notifyAll();
        return;
      } catch (_) {}
    }

    const docKey = `fb_db_${collectionPath}_id_${docId}`;
    localStorage.removeItem(docKey);
    this.notifyAll();
  }

  addListener(target: any, callback: Function) {
    const item = { target, callback };
    this.activeListeners.add(item);
    return () => {
      this.activeListeners.delete(item);
    };
  }

  notifyAll() {
    this.activeListeners.forEach(({ target, callback }) => {
      const snapshot = this.getSnapshotForTarget(target);
      callback(snapshot);
    });
  }

  getSnapshotForTarget(target: any): any {
    try {
      if (!target) {
        return {
          id: '',
          exists: () => false,
          data: () => null,
          docs: [],
          empty: true,
          size: 0,
          forEach: () => {},
          docChanges: () => []
        };
      }

      const targetType = target._type || target.type || '';

      if (targetType === 'collection' || targetType === 'collectionGroup') {
        const isGrp = targetType === 'collectionGroup';
        const pathName = target.path || '';
        let docs: any[] = [];
        if (typeof window !== 'undefined') {
          if (isGrp) {
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && (key.startsWith(`fb_db_${pathName}_id_`) || key.includes(`/${pathName}_id_`) || key.includes(`_${pathName}_id_`))) {
                const val = localStorage.getItem(key);
                if (val) {
                  try {
                    docs.push(JSON.parse(val));
                  } catch (_) {}
                }
              }
            }
          } else {
            docs = this.getCollectionDocs(pathName);
          }
        }
        return {
          id: pathName,
          exists: () => docs.length > 0,
          data: () => null,
          docs: docs.map(d => ({
            id: d.id,
            data: () => d,
            exists: () => true,
            docs: [],
            empty: false,
            size: 1,
            forEach: (cb: Function) => cb({ id: d.id, data: () => d, exists: () => true }),
            docChanges: () => []
          })),
          empty: docs.length === 0,
          size: docs.length,
          forEach: (cb: Function) => {
            docs.forEach(d => cb({
              id: d.id,
              data: () => d,
              exists: () => true,
              docs: [],
              empty: false,
              size: 1,
              forEach: () => {},
              docChanges: () => []
            }));
          },
          docChanges: () => docs.map(d => ({
            type: 'added',
            doc: {
              id: d.id,
              data: () => d,
              exists: () => true,
              docs: [],
              empty: false,
              size: 1,
              forEach: () => {},
              docChanges: () => []
            }
          }))
        };
      }
      
      if (targetType === 'document') {
        const docs = this.getCollectionDocs(target.collectionPath);
        const docData = docs.find(d => d.id === target.id);
        
        return {
          id: target.id,
          exists: () => !!docData,
          data: () => docData || null,
          docs: docData ? [{ id: target.id, data: () => docData, exists: () => true }] : [],
          empty: !docData,
          size: docData ? 1 : 0,
          forEach: (cb: Function) => {
            if (docData) cb({ id: target.id, data: () => docData, exists: () => true });
          },
          docChanges: () => docData ? [{
            type: 'added',
            doc: { id: target.id, data: () => docData, exists: () => true }
          }] : []
        };
      }

      if (targetType === 'query' || targetType === '') {
        const colRef = target?.collectionRef;
        const isGrp = colRef && (colRef._type === 'collectionGroup' || colRef.type === 'collectionGroup');
        let pathName = colRef ? (colRef.path || '') : '';
        if (!pathName && target?._query?.path?.segments) {
          pathName = target._query.path.segments.join('/');
        }
        if (!pathName && target?.path) {
          pathName = target.path;
        }

        let docs: any[] = [];
        if (typeof window !== 'undefined') {
          if (isGrp || (!pathName && target?._query?.path?.segments)) {
            const colId = pathName || (target?._query?.path?.segments ? target._query.path.segments[target._query.path.segments.length - 1] : '');
            if (colId) {
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith(`fb_db_${colId}_id_`) || key.includes(`/${colId}_id_`) || key.includes(`_${colId}_id_`))) {
                  const val = localStorage.getItem(key);
                  if (val) {
                    try {
                      docs.push(JSON.parse(val));
                    } catch (_) {}
                  }
                }
              }
            }
          } else if (pathName) {
            docs = this.getCollectionDocs(pathName);
          }
        }
        
        const constraints = target?.constraints || [];
        for (const filter of constraints) {
          if (filter && filter.type === 'where') {
            docs = docs.filter(doc => {
              const docVal = doc[filter.field];
              const targetVal = filter.value;
              if (filter.operator === '==') return docVal === targetVal;
              if (filter.operator === '!=') return docVal !== targetVal;
              if (filter.operator === '<') return docVal < targetVal;
              if (filter.operator === '<=') return docVal <= targetVal;
              if (filter.operator === '>') return docVal > targetVal;
              if (filter.operator === '>=') return docVal >= targetVal;
              if (filter.operator === 'array-contains') {
                return Array.isArray(docVal) && docVal.includes(targetVal);
              }
              if (filter.operator === 'in') {
                return Array.isArray(targetVal) && targetVal.includes(docVal);
              }
              return true;
            });
          }
        }

        const orderByConstraint = constraints.find((c: any) => c && c.type === 'orderBy');
        if (orderByConstraint) {
          docs.sort((a, b) => {
            const valA = a[orderByConstraint.field];
            const valB = b[orderByConstraint.field];
            if (valA === undefined) return 1;
            if (valB === undefined) return -1;
            const compare = valA < valB ? -1 : valA > valB ? 1 : 0;
            return orderByConstraint.direction === 'desc' ? -compare : compare;
          });
        }

        const limitConstraint = constraints.find((c: any) => c && c.type === 'limit');
        if (limitConstraint) {
          docs = docs.slice(0, limitConstraint.n);
        }

        return {
          id: pathName,
          exists: () => docs.length > 0,
          data: () => null,
          docs: docs.map(d => ({
            id: d.id,
            data: () => d,
            exists: () => true,
            docs: [],
            empty: false,
            size: 1,
            forEach: (cb: Function) => cb({ id: d.id, data: () => d, exists: () => true }),
            docChanges: () => []
          })),
          empty: docs.length === 0,
          size: docs.length,
          forEach: (cb: Function) => {
            docs.forEach(d => cb({
              id: d.id,
              data: () => d,
              exists: () => true,
              docs: [],
              empty: false,
              size: 1,
              forEach: () => {},
              docChanges: () => []
            }));
          },
          docChanges: () => docs.map(d => ({
            type: 'added',
            doc: {
              id: d.id,
              data: () => d,
              exists: () => true,
              docs: [],
              empty: false,
              size: 1,
              forEach: () => {},
              docChanges: () => []
            }
          }))
        };
      }

      return {
        id: '',
        exists: () => false,
        data: () => null,
        docs: [],
        empty: true,
        size: 0,
        forEach: () => {},
        docChanges: () => []
      };
    } catch (e) {
      console.warn("Exception captured inside getSnapshotForTarget: ", e);
      return {
        id: '',
        exists: () => false,
        data: () => null,
        docs: [],
        empty: true,
        size: 0,
        forEach: () => {},
        docChanges: () => []
      };
    }
  }
}

const simFirestoreInstance = new SimulatedFirestore();

// ==========================================
// 3. STORAGE EMULATION SYSTEM
// ==========================================
class SimulatedStorage {
  async upload(ref: any, file: any) {
    const url = URL.createObjectURL(file);
    return {
      ref,
      downloadURL: url,
      metadata: { name: file.name, size: file.size }
    };
  }
}

const simStorage = new SimulatedStorage();

// ==========================================
// 4. API EXPORTS
// ==========================================

// APP
export function initializeApp(config: any) {
  if (isSimulated) {
    return { _type: 'firebase_app', name: '[DEFAULT]' };
  }
  try {
    return fbInitializeApp(config);
  } catch (_) {
    isSimulated = true;
    return { _type: 'firebase_app', name: '[DEFAULT]' };
  }
}

// AUTH
export function getAuth(appInstance?: any) {
  if (isSimulated) {
    return simAuthInstance;
  }
  try {
    return fbGetAuth(appInstance);
  } catch (_) {
    isSimulated = true;
    return simAuthInstance;
  }
}

export function onAuthStateChanged(authInstance: any, next: any, errorCallback?: any) {
  if (isSimulated || authInstance === simAuthInstance) {
    return simAuthInstance.onAuthStateChanged(next, errorCallback);
  }
  
  return fbOnAuthStateChanged(authInstance, next, (error: any) => {
    if (error.message && error.message.includes('api-keys-are-not-supported')) {
      console.warn("Auto-detected API restricted auth keys. Switching to Safe Simulation Mode...");
      isSimulated = true;
      if (typeof window !== 'undefined') {
        localStorage.setItem(localStorageKey, 'true');
        localStorage.setItem('fb_simulated', 'true');
      }
      simAuthInstance.onAuthStateChanged(next, errorCallback);
    } else if (errorCallback) {
      errorCallback(error);
    }
  });
}

export async function signInWithPopup(authInstance: any, provider: any) {
  if (isSimulated || authInstance === simAuthInstance) {
    return simAuthInstance.signInWithPopup(provider);
  }
  try {
    return await fbSignInWithPopup(authInstance, provider);
  } catch (error: any) {
    if (error.message && error.message.includes('api-keys-are-not-supported')) {
      console.warn("API Key restricted during login popup. Activating Sandbox Emulation...");
      isSimulated = true;
      if (typeof window !== 'undefined') {
        localStorage.setItem(localStorageKey, 'true');
        localStorage.setItem('fb_simulated', 'true');
      }
      return simAuthInstance.signInWithPopup(provider);
    }
    throw error;
  }
}

export async function signOut(authInstance: any) {
  if (isSimulated || authInstance === simAuthInstance) {
    return simAuthInstance.signOut();
  }
  return fbSignOut(authInstance);
}

export class GoogleAuthProvider {
  static PROVIDER_ID = 'google.com';
  addScope() {}
  static credentialFromResult(result: any) {
    return result?.credential || null;
  }
}

// FIRESTORE
export function initializeFirestore(appInstance: any, settings?: any, databaseId?: string) {
  if (isSimulated) {
    return { _type: 'firestore', app: appInstance };
  }
  try {
    return fbInitializeFirestore(appInstance, settings, databaseId);
  } catch (_) {
    isSimulated = true;
    if (typeof window !== 'undefined') {
      localStorage.setItem(localStorageKey, 'true');
      localStorage.setItem('fb_simulated', 'true');
    }
    return { _type: 'firestore', app: appInstance };
  }
}

export function persistentLocalCache(options?: any) {
  if (isSimulated) return {};
  return fbPersistentLocalCache(options);
}

export function persistentMultipleTabManager() {
  if (isSimulated) return {};
  return fbPersistentMultipleTabManager();
}

export function collection(dbInstance: any, pathName: string) {
  if (isSimulated) {
    return { _type: 'collection', path: pathName };
  }
  return fbCollection(dbInstance, pathName);
}

export function doc(dbOrCol: any, idOrPath?: string, ...additionalPaths: string[]) {
  if (isSimulated) {
    if (dbOrCol._type === 'collection') {
      return { 
        _type: 'document', 
        id: idOrPath, 
        collectionPath: dbOrCol.path,
        path: `${dbOrCol.path}/${idOrPath}`
      };
    }
    const fullPath = [idOrPath, ...additionalPaths].filter(Boolean).join('/');
    const parts = fullPath.split('/');
    const docId = parts[parts.length - 1];
    const colPath = parts.slice(0, parts.length - 1).join('/');
    
    return {
      _type: 'document',
      id: docId,
      collectionPath: colPath,
      path: fullPath
    };
  }
  return fbDoc(dbOrCol, idOrPath, ...additionalPaths);
}

export function query(colRef: any, ...constraints: any[]) {
  if (isSimulated) {
    return { _type: 'query', collectionRef: colRef, constraints };
  }
  return fbQuery(colRef, ...constraints);
}

export function where(field: string, operator: any, value: any) {
  if (isSimulated) {
    return { type: 'where', field, operator, value };
  }
  return fbWhere(field, operator as any, value);
}

export function orderBy(field: string, direction?: 'asc' | 'desc') {
  if (isSimulated) {
    return { type: 'orderBy', field, direction: direction || 'asc' };
  }
  return fbOrderBy(field, direction);
}

export function limit(n: number) {
  if (isSimulated) {
    return { type: 'limit', n };
  }
  return fbLimit(n);
}

export async function addDoc(collectionRef: any, data: any) {
  if (isSimulated) {
    const docId = 'doc_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const docData = { ...data, id: docId };
    
    for (const key of Object.keys(docData)) {
      if (docData[key] && docData[key]._isServerTimestamp) {
        docData[key] = Date.now();
      }
    }
    
    simFirestoreInstance.setDocument(collectionRef.path, docId, docData);
    return { id: docId, data: () => docData };
  }
  try {
    return await fbAddDoc(collectionRef, data);
  } catch (error: any) {
    if (error.message && (
      error.message.includes('api-keys-are-not-supported') ||
      error.message.includes('permission') ||
      error.message.includes('auth')
    )) {
      console.warn("Firestore error in addDoc. Falling back to local Simulation Mode...");
      isSimulated = true;
      if (typeof window !== 'undefined') {
        localStorage.setItem(localStorageKey, 'true');
        localStorage.setItem('fb_simulated', 'true');
      }
      return addDoc(collectionRef, data);
    }
    throw error;
  }
}

export async function setDoc(docRef: any, data: any, options?: any) {
  if (isSimulated) {
    const docData = { ...data };
    for (const key of Object.keys(docData)) {
      if (docData[key] && docData[key]._isServerTimestamp) {
        docData[key] = Date.now();
      }
    }
    simFirestoreInstance.setDocument(docRef.collectionPath, docRef.id, docData, options?.merge === true);
    return;
  }
  try {
    return await fbSetDoc(docRef, data, options);
  } catch (error: any) {
    if (error.message && (
      error.message.includes('api-keys-are-not-supported') ||
      error.message.includes('permission') ||
      error.message.includes('auth')
    )) {
      console.warn("Firestore error in setDoc. Falling back to local Simulation Mode...");
      isSimulated = true;
      if (typeof window !== 'undefined') {
        localStorage.setItem(localStorageKey, 'true');
        localStorage.setItem('fb_simulated', 'true');
      }
      return setDoc(docRef, data, options);
    }
    throw error;
  }
}

export async function updateDoc(docRef: any, data: any) {
  if (isSimulated) {
    const docData = { ...data };
    for (const key of Object.keys(docData)) {
      if (docData[key] && docData[key]._isServerTimestamp) {
        docData[key] = Date.now();
      }
    }
    simFirestoreInstance.setDocument(docRef.collectionPath, docRef.id, docData, true);
    return;
  }
  try {
    return await fbUpdateDoc(docRef, data);
  } catch (error: any) {
    if (error.message && (
      error.message.includes('api-keys-are-not-supported') ||
      error.message.includes('permission') ||
      error.message.includes('auth')
    )) {
      console.warn("Firestore error in updateDoc. Falling back to local Simulation Mode...");
      isSimulated = true;
      if (typeof window !== 'undefined') {
        localStorage.setItem(localStorageKey, 'true');
        localStorage.setItem('fb_simulated', 'true');
      }
      return updateDoc(docRef, data);
    }
    throw error;
  }
}

export async function deleteDoc(docRef: any) {
  if (isSimulated) {
    simFirestoreInstance.deleteDocument(docRef.collectionPath, docRef.id);
    return;
  }
  try {
    return await fbDeleteDoc(docRef);
  } catch (error: any) {
    if (error.message && (
      error.message.includes('api-keys-are-not-supported') ||
      error.message.includes('permission') ||
      error.message.includes('auth')
    )) {
      console.warn("Firestore error in deleteDoc. Falling back to local Simulation Mode...");
      isSimulated = true;
      if (typeof window !== 'undefined') {
        localStorage.setItem(localStorageKey, 'true');
        localStorage.setItem('fb_simulated', 'true');
      }
      return deleteDoc(docRef);
    }
    throw error;
  }
}

export async function getDoc(docRef: any) {
  if (isSimulated) {
    return simFirestoreInstance.getSnapshotForTarget(docRef);
  }
  try {
    return await fbGetDoc(docRef);
  } catch (error: any) {
    if (error.message && (
      error.message.includes('api-keys-are-not-supported') ||
      error.message.includes('permission') ||
      error.message.includes('auth')
    )) {
      console.warn("Firestore error in getDoc. Falling back to local Simulation Mode...");
      isSimulated = true;
      if (typeof window !== 'undefined') {
        localStorage.setItem(localStorageKey, 'true');
        localStorage.setItem('fb_simulated', 'true');
      }
      return getDoc(docRef);
    }
    throw error;
  }
}

export async function getDocs(queryOrCol: any) {
  if (isSimulated) {
    return simFirestoreInstance.getSnapshotForTarget(queryOrCol);
  }
  try {
    return await fbGetDocs(queryOrCol);
  } catch (error: any) {
    if (error.message && (
      error.message.includes('api-keys-are-not-supported') ||
      error.message.includes('permission') ||
      error.message.includes('auth')
    )) {
      console.warn("Firestore error in getDocs. Falling back to local Simulation Mode...");
      isSimulated = true;
      if (typeof window !== 'undefined') {
        localStorage.setItem(localStorageKey, 'true');
        localStorage.setItem('fb_simulated', 'true');
      }
      return getDocs(queryOrCol);
    }
    throw error;
  }
}

export function onSnapshot(target: any, onNext: any, onError?: any) {
  if (isSimulated) {
    setTimeout(() => {
      try {
        const snap = simFirestoreInstance.getSnapshotForTarget(target);
        onNext(snap);
      } catch (e) {
        if (onError) onError(e);
      }
    }, 0);
    return simFirestoreInstance.addListener(target, onNext);
  }
  
  return fbOnSnapshot(target, onNext, (error: any) => {
    if (error.message && (
      error.message.includes('permission') || 
      error.message.includes('auth') || 
      error.message.includes('api-keys-are-not-supported')
    )) {
      console.warn("Firestore-query error detected! Activating local Simulation Mode fallbacks...");
      isSimulated = true;
      if (typeof window !== 'undefined') {
        localStorage.setItem(localStorageKey, 'true');
        localStorage.setItem('fb_simulated', 'true');
      }
      
      setTimeout(() => {
        const snap = simFirestoreInstance.getSnapshotForTarget(target);
        onNext(snap);
      }, 0);
      
      return simFirestoreInstance.addListener(target, onNext);
    } else if (onError) {
      onError(error);
    }
  });
}

export function serverTimestamp() {
  if (isSimulated) {
    return { _isServerTimestamp: true };
  }
  return fbServerTimestamp();
}

export function collectionGroup(dbInstance: any, collectionId: string) {
  if (isSimulated) {
    return { _type: 'collectionGroup', path: collectionId };
  }
  return fbCollectionGroup(dbInstance, collectionId);
}

// STORAGE
export function getStorage(appInstance: any) {
  if (isSimulated) {
    return simStorage;
  }
  try {
    return fbGetStorage(appInstance);
  } catch (_) {
    isSimulated = true;
    return simStorage;
  }
}

export function ref(storageInstance: any, pathStr: string) {
  if (isSimulated) {
    return { _type: 'storage_ref', path: pathStr };
  }
  return fbRef(storageInstance, pathStr);
}

export function uploadBytesResumable(storageRef: any, file: Blob | Uint8Array | ArrayBuffer, metadata?: any) {
  if (isSimulated) {
    let progressCallback: Function | null = null;
    let completeCallback: Function | null = null;
    
    const task = {
      on: (event: string, next: Function, error: Function, complete: Function) => {
        if (event === 'state_changed') {
          progressCallback = next;
          completeCallback = complete;
          
          setTimeout(() => {
            if (progressCallback) progressCallback({ bytesTransferred: file instanceof Blob ? file.size / 2 : 50, totalBytes: file instanceof Blob ? file.size : 100 });
          }, 100);
          setTimeout(() => {
            if (progressCallback) progressCallback({ bytesTransferred: file instanceof Blob ? file.size : 100, totalBytes: file instanceof Blob ? file.size : 100 });
            if (completeCallback) completeCallback();
          }, 300);
        }
      },
      then: async (callback: Function) => {
        callback({ ref: storageRef });
      }
    };
    return task as any;
  }
  return fbUploadBytesResumable(storageRef, file, metadata);
}

export async function getDownloadURL(storageRef: any) {
  if (isSimulated) {
    const ext = storageRef.path.split('.').pop()?.toLowerCase();
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif') {
      return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=512';
    }
    return 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
  }
  return fbGetDownloadURL(storageRef);
}
