import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, onSnapshot, getDoc, collection, query, limit, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { User, UserRole } from '../types';
import { logActivity } from '../lib/audit';
import { useConnectivity } from '../hooks/useConnectivity';
import { hasPermission, isAtLeastRole, Permission } from '../lib/rbac';
import { CryptoService } from '../lib/crypto';
import { keyStore } from '../lib/keyStore';

interface FirebaseContextType {
  user: FirebaseUser | null;
  profile: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
  isOnline: boolean;
  hasPerm: (permission: Permission) => boolean;
  isAtLeast: (role: UserRole) => boolean;
  accessToken: string | null;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

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
  // Do not rethrow: log and continue so a transient Firestore error cannot
  // crash the whole app via ErrorBoundary (ported from upstream).
}

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const isOnline = useConnectivity();

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    let presenceInterval: any;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubProfile) unsubProfile();
      if (presenceInterval) clearInterval(presenceInterval);

      setUser(user);
      if (user) {
        // Sync user profile
        const userRef = doc(db, 'users', user.uid);
        
        // Detection and Presence Logic
        const syncUserInfo = async () => {
          let ipAddress = 'unknown';
          let department = 'Remote/Guest';
          
          try {
            const res = await fetch('/api/info');
            const data = await res.json();
            ipAddress = data.ip;
            
            // Simulation of departmentalization by IP range
            // In a real office, this would be based on private IP ranges (e.g., 192.168.10.x vs 192.168.20.x)
            // Here we use string matching to simulate ranges
            if (ipAddress.startsWith('10.10.1')) department = 'Engineering';
            else if (ipAddress.startsWith('10.10.2')) department = 'Marketing';
            else if (ipAddress.startsWith('10.10.3')) department = 'Design';
            else if (ipAddress.startsWith('127.0.0.1')) department = 'Local Core';
            else department = 'Main Office'; // Default for detected office IP
          } catch (e) {
            console.warn("Failed to detect network info");
          }

          const existingDoc = await getDoc(userRef);

          let isFirstUser = false;
          try {
            const usersQuery = query(collection(db, 'users'), limit(2));
            const usersSnap = await getDocs(usersQuery);
            // If the database is empty or this user is the only user in the database
            if (usersSnap.empty || (usersSnap.size === 1 && usersSnap.docs[0].id === user.uid)) {
              isFirstUser = true;
            }
          } catch (e) {
            console.warn("Could not check if first user", e);
          }

          let publicKeyString = existingDoc.data()?.publicKey;
          if (!publicKeyString) {
            try {
              const keyPair = await CryptoService.generateKeyPair();
              publicKeyString = await CryptoService.exportPublicKey(keyPair.publicKey);
              await keyStore.savePrivateKey(user.uid, keyPair.privateKey);
            } catch (e) {
              console.error("Failed to generate E2EE keys during registration", e);
            }
          }

          const currentRole = existingDoc.data()?.role;
          let roleToSet = currentRole || UserRole.MEMBER;
          
          const metaEnv = (import.meta as any).env || {};
          const adminEmailsStr = (metaEnv.VITE_ADMIN_EMAILS || 'tenantsitsolutions@gmail.com,jonathanigimoh@gmail.com').toLowerCase();
          const adminEmails = adminEmailsStr.split(',').map(e => e.trim());
          const isBootstrapAdmin = user.email && adminEmails.includes(user.email.toLowerCase());

          if (isFirstUser || isBootstrapAdmin) {
            // Force admin if they are the only user in the database, or explicitly matched
            // (addresses cases where a previous bug caused the first user to be saved as a member)
            roleToSet = UserRole.ADMIN;
          }

          await setDoc(userRef, {
            name: user.displayName || 'Unknown User',
            email: user.email || '',
            avatar: user.photoURL || '',
            status: 'online',
            lastSeen: Date.now(),
            ipAddress,
            department,
            ...(publicKeyString && { publicKey: publicKeyString }),
            role: roleToSet
          }, { merge: true });
        };

        syncUserInfo().catch(console.error);

        // Subscribe to profile changes
        unsubProfile = onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            setProfile({ id: doc.id, ...doc.data() } as User);
          }
        }, (error) => handleFirestoreError(error, 'get', `users/${user.uid}`));

        // Presence logic (simplified: update lastSeen every 2 mins)
        presenceInterval = setInterval(() => {
          setDoc(userRef, { lastSeen: Date.now() }, { merge: true }).catch(() => {});
        }, 120000);

        setLoading(false);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      if (unsubProfile) unsubProfile();
      if (presenceInterval) clearInterval(presenceInterval);
      unsubscribe();
    };
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
    provider.addScope('https://www.googleapis.com/auth/gmail.send');
    provider.addScope('https://www.googleapis.com/auth/meetings.space.created');
    provider.addScope('https://www.googleapis.com/auth/meetings.space.readonly');
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      setAccessToken(credential.accessToken);
    }
    logActivity({
      type: 'auth',
      action: 'User Login',
      details: 'Authenticated via Google',
      severity: 'info'
    });
  };

  const logOut = async () => {
    if (user) {
      logActivity({
        type: 'auth',
        action: 'User Logout',
        details: 'Manual session termination',
        severity: 'info'
      });
      await setDoc(doc(db, 'users', user.uid), { status: 'offline', lastSeen: Date.now() }, { merge: true }).catch(console.error);
    }
    setAccessToken(null);
    await signOut(auth).catch(console.error);
  };

  const hasPerm = (permission: Permission) => hasPermission(profile?.role, permission);
  const isAtLeast = (role: UserRole) => isAtLeastRole(profile?.role, role);

  return (
    <FirebaseContext.Provider value={{ user, profile, loading, signIn, logOut, isOnline, hasPerm, isAtLeast, accessToken }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) throw new Error('useFirebase must be used within FirebaseProvider');
  return context;
};
