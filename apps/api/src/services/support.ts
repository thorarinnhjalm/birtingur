import { db } from '../lib/firebase.js';
import { generateId } from '../lib/id.js';
import { createNotification } from './notifications.js';

export interface SupportMessage {
  id: string;
  senderEmail: string;
  senderName?: string;
  role: 'advertiser' | 'publisher' | 'unknown';
  subject: string;
  body: string;
  status: 'unread' | 'read' | 'resolved';
  createdAt: Date;
}

const col = db.collection('supportMessages');

export async function createSupportMessage(input: {
  senderEmail: string;
  senderName?: string;
  role: 'advertiser' | 'publisher' | 'unknown';
  subject: string;
  body: string;
}): Promise<SupportMessage> {
  const msg: SupportMessage = {
    id: generateId('sup'),
    senderEmail: input.senderEmail,
    senderName: input.senderName,
    role: input.role,
    subject: input.subject,
    body: input.body,
    status: 'unread',
    createdAt: new Date(),
  };
  await col.doc(msg.id).set(msg);

  try {
    await createNotification({
      userEmail: 'admin',
      role: 'admin',
      type: 'info',
      title: 'Ný skilaboð bárust',
      message: `Nýtt erindi frá ${input.senderEmail} bíður yfirferðar.`,
      link: '/admin',
    });
  } catch (err) {
    console.error('Error creating admin support message notification:', err);
  }

  return msg;
}

export async function listSupportMessages(): Promise<SupportMessage[]> {
  const snap = await col.orderBy('createdAt', 'desc').limit(50).get();
  return snap.docs.map((d) => d.data() as SupportMessage);
}

export async function updateMessageStatus(id: string, status: 'read' | 'resolved'): Promise<void> {
  await col.doc(id).update({ status });
}
