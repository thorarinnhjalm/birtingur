import { db } from '../lib/firebase.js';
import { generateId } from '../lib/id.js';
import { COLLECTIONS, notificationConverter } from '@ada/shared/firestore';
import type { Notification } from '@ada/shared';

export async function createNotification(input: {
  userEmail: string;
  role: 'advertiser' | 'publisher' | 'admin';
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  link?: string;
}): Promise<Notification> {
  const notif: Notification = {
    id: generateId('not'),
    userEmail: input.userEmail.toLowerCase(),
    role: input.role,
    type: input.type,
    title: input.title,
    message: input.message,
    read: false,
    createdAt: new Date(),
    link: input.link,
  };

  const col = db.collection(COLLECTIONS.notifications);
  await col.doc(notif.id).withConverter(notificationConverter).set(notif);
  return notif;
}

export async function listNotifications(
  userEmail: string,
  role: 'advertiser' | 'publisher' | 'admin',
): Promise<Notification[]> {
  const email = userEmail.toLowerCase();
  const col = db.collection(COLLECTIONS.notifications).withConverter(notificationConverter);
  const snap = await col
    .where('userEmail', '==', email)
    .where('role', '==', role)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return snap.docs.map((d) => d.data() as Notification);
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const col = db.collection(COLLECTIONS.notifications);
  await col.doc(id).update({ read: true });
}

export async function markAllNotificationsAsRead(
  userEmail: string,
  role: 'advertiser' | 'publisher' | 'admin',
): Promise<void> {
  const email = userEmail.toLowerCase();
  const col = db.collection(COLLECTIONS.notifications);
  const snap = await col
    .where('userEmail', '==', email)
    .where('role', '==', role)
    .where('read', '==', false)
    .get();

  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.update(doc.ref, { read: true });
  }
  await batch.commit();
}
