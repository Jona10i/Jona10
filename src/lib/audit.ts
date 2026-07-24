import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

export type AuditType = 'auth' | 'file' | 'channel' | 'system';
export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditLogData {
  type: AuditType;
  action: string;
  details?: string;
  severity: AuditSeverity;
}

export async function logActivity(data: AuditLogData) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const userDocRef = doc(db, 'users', user.uid);
    const userDocSnap = await getDoc(userDocRef);
    const companyName = userDocSnap.exists() ? (userDocSnap.data()?.companyName || '') : '';

    await addDoc(collection(db, 'audit_logs'), {
      ...data,
      userId: user.uid,
      userName: user.displayName || user.email || 'Anonymous',
      companyName,
      timestamp: Date.now(),
      serverTimestamp: serverTimestamp()
    });
  } catch (error) {
    console.warn('Failed to log activity:', error);
  }
}
