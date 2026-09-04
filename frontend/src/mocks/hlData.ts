import type { CalendarEvent, Contact, Conversation } from '@/types'

export const location = { id: 'loc_8Kd2Qm', name: 'Acme Dental' }

export const contacts: Contact[] = [
  { id: 'ct_01', firstName: 'Maya', lastName: 'Fernandes', email: 'maya.f@gmail.com', phone: '+1 415 555 0118', tags: ['new patient'] },
  { id: 'ct_02', firstName: 'Daniel', lastName: 'Okoro', email: 'd.okoro@outlook.com', phone: '+1 415 555 0192', tags: ['recall due'] },
  { id: 'ct_03', firstName: 'Priya', lastName: 'Raman', email: 'priya@ramandesign.co', phone: '+1 628 555 0143', tags: ['invisalign'] },
  { id: 'ct_04', firstName: 'Tomas', lastName: 'Lindqvist', email: 'tomas.l@fastmail.com', phone: '+1 510 555 0177', tags: ['insurance pending'] },
  { id: 'ct_05', firstName: 'Ana', lastName: 'Duarte', email: 'ana.duarte@icloud.com', phone: '+1 415 555 0165', tags: ['whitening'] },
  { id: 'ct_06', firstName: 'Wes', lastName: 'Halloran', email: 'wes.halloran@gmail.com', phone: '+1 650 555 0134', tags: ['no show'] },
  { id: 'ct_07', firstName: 'Ingrid', lastName: 'Bauer', email: 'ibauer@zohomail.com', phone: '+1 415 555 0109', tags: ['referral'] },
  { id: 'ct_08', firstName: 'Rafael', lastName: 'Costa', email: 'rafa.costa@proton.me', phone: '+1 707 555 0128', tags: ['new patient'] },
]

export const conversations: Conversation[] = [
  { id: 'cv_01', contactId: 'ct_02', lastMessage: 'Can I move Thursday to the afternoon?', unread: 2, updatedAt: '2026-09-02T16:40:00Z' },
  { id: 'cv_02', contactId: 'ct_04', lastMessage: 'Sent the new insurance card over.', unread: 1, updatedAt: '2026-09-02T14:05:00Z' },
  { id: 'cv_03', contactId: 'ct_01', lastMessage: 'Thanks — see you then!', unread: 0, updatedAt: '2026-09-01T22:12:00Z' },
  { id: 'cv_04', contactId: 'ct_06', lastMessage: 'Sorry about last week, can we rebook?', unread: 3, updatedAt: '2026-09-01T09:30:00Z' },
  { id: 'cv_05', contactId: 'ct_07', lastMessage: 'My sister is looking for a dentist too.', unread: 0, updatedAt: '2026-08-31T18:55:00Z' },
]

export const events: CalendarEvent[] = [
  { id: 'ev_01', title: 'New patient exam', contactId: 'ct_01', startTime: '2026-09-04T09:00:00Z', endTime: '2026-09-04T10:00:00Z', status: 'confirmed' },
  { id: 'ev_02', title: 'Cleaning + recall', contactId: 'ct_02', startTime: '2026-09-04T11:30:00Z', endTime: '2026-09-04T12:15:00Z', status: 'pending' },
  { id: 'ev_03', title: 'Invisalign check', contactId: 'ct_03', startTime: '2026-09-05T14:00:00Z', endTime: '2026-09-05T14:30:00Z', status: 'confirmed' },
  { id: 'ev_04', title: 'Crown fitting', contactId: 'ct_04', startTime: '2026-09-05T16:00:00Z', endTime: '2026-09-05T17:00:00Z', status: 'cancelled' },
  { id: 'ev_05', title: 'Whitening consult', contactId: 'ct_05', startTime: '2026-09-08T10:15:00Z', endTime: '2026-09-08T10:45:00Z', status: 'confirmed' },
  { id: 'ev_06', title: 'Rebooked cleaning', contactId: 'ct_06', startTime: '2026-09-09T13:00:00Z', endTime: '2026-09-09T13:45:00Z', status: 'pending' },
]
