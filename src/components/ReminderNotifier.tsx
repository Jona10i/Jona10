import { useEffect } from 'react';
import { useFirebase } from './FirebaseProvider';
import { collection, query, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Reminder } from '../types';

export const ReminderNotifier = () => {
  const { user } = useFirebase();

  useEffect(() => {
    if (!user) return;

    // Check permission immediately
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const q = query(collection(db, `users/${user.uid}/reminders`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.forEach((docSnap) => {
        const reminder = { id: docSnap.id, ...docSnap.data() } as Reminder;
        if (!reminder.completed && !reminder.notified && reminder.notifyTime <= Date.now()) {
          // Fire notification
          if (Notification.permission === 'granted') {
            new Notification('Reminder', {
              body: reminder.title,
            });
          }
          // Mark as notified so it doesn't trigger again
          updateDoc(doc(db, `users/${user.uid}/reminders`, reminder.id), {
            notified: true
          }).catch(() => {});
        }
      });
    });

    return () => unsubscribe();
  }, [user]);

  return null;
};
