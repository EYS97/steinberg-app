// src/lib/db.js
// כל פעולות מסד הנתונים במקום אחד
// ---------------------------------------------------------
// מבנה Firestore:
//
// /families/{familyId}
//   name, members (adults, kids), needs[], createdAt
//
// /events/{eventId}
//   title, date (timestamp), type (shabbat|chag|other)
//   hebrewDate, parasha
//
// /bookings/{bookingId}
//   eventId, roomId, familyId, adults, kids, needs[], status
//
// /food/{foodId}
//   eventId, familyId, category, description, notes, status
//
// /birthdays/{birthdayId}
//   familyId, personName, date (timestamp), hebrewDate
//
// /notifications/{notifId}
//   type, message, read, createdAt, targetFamilyId (null=all)
// ---------------------------------------------------------

import {
  collection, doc,
  addDoc, setDoc, updateDoc, deleteDoc,
  getDocs, getDoc, onSnapshot,
  query, where, orderBy, serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';

// ── FAMILIES ──────────────────────────────────────────────

export const getFamilies = (callback) =>
  onSnapshot(collection(db, 'families'), snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

export const addFamily = (data) =>
  addDoc(collection(db, 'families'), { ...data, createdAt: serverTimestamp() });

export const updateFamily = (id, data) =>
  updateDoc(doc(db, 'families', id), data);

export const deleteFamily = (id) =>
  deleteDoc(doc(db, 'families', id));

// ── EVENTS (שבתות וחגים) ──────────────────────────────────

export const getEvents = (callback) =>
  onSnapshot(
    query(collection(db, 'events'), orderBy('date', 'asc')),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );

export const addEvent = (data) =>
  addDoc(collection(db, 'events'), { ...data, createdAt: serverTimestamp() });

export const updateEvent = (id, data) =>
  updateDoc(doc(db, 'events', id), data);

export const deleteEvent = (id) =>
  deleteDoc(doc(db, 'events', id));

// ── ROOMS (קבועים, מוגדרים ב-config) ─────────────────────

export const ROOMS = [
  {
    id: 'penina',
    name: 'חדר פנינה',
    icon: '🛏',
    capacity: { adults: 4, kids: 0, babies: 0 },
    description: '4 מיטות בודדות',
  },
  {
    id: 'israel',
    name: 'חדר ישראל',
    icon: '🛏',
    capacity: { adults: 2, kids: 0, babies: 0 },
    description: 'זוג או 2 בודדים',
  },
  {
    id: 'yehuda',
    name: 'חדר יהודה',
    icon: '🛏',
    capacity: { adults: 2, kids: 0, babies: 1 },
    description: 'זוג + תינוק',
  },
  {
    id: 'hayechida',
    name: 'היחידה',
    icon: '🏠',
    capacity: { adults: 2, kids: 0, babies: 1 },
    description: 'זוג + תינוק · כניסה עצמאית',
  },
];

// ── BOOKINGS ──────────────────────────────────────────────

export const getBookingsForEvent = (eventId, callback) =>
  onSnapshot(
    query(collection(db, 'bookings'), where('eventId', '==', eventId)),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );

export const addBooking = (data) =>
  addDoc(collection(db, 'bookings'), { ...data, createdAt: serverTimestamp() });

export const updateBooking = (id, data) =>
  updateDoc(doc(db, 'bookings', id), data);

export const deleteBooking = (id) =>
  deleteDoc(doc(db, 'bookings', id));

export const lockRoom = (eventId, roomId, locked) =>
  setDoc(doc(db, 'roomLocks', `${eventId}_${roomId}`), { eventId, roomId, locked });

// ── FOOD ──────────────────────────────────────────────────

export const FOOD_CATEGORIES = [
  { id: 'starter',  label: 'מנה ראשונה', icon: '🥗' },
  { id: 'main',     label: 'מנה עיקרית', icon: '🍖' },
  { id: 'dessert',  label: 'קינוח',       icon: '🍰' },
  { id: 'drinks',   label: 'שתייה',       icon: '🥤' },
  { id: 'bread',    label: 'לחם / חלות',  icon: '🍞' },
  { id: 'fruits',   label: 'פירות / ממתקים', icon: '🍬' },
];

export const getFoodForEvent = (eventId, callback) =>
  onSnapshot(
    query(collection(db, 'food'), where('eventId', '==', eventId)),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );

export const addFood = (data) =>
  addDoc(collection(db, 'food'), { ...data, createdAt: serverTimestamp() });

export const updateFood = (id, data) =>
  updateDoc(doc(db, 'food', id), data);

export const deleteFood = (id) =>
  deleteDoc(doc(db, 'food', id));

// ── BIRTHDAYS ─────────────────────────────────────────────

export const getBirthdays = (callback) =>
  onSnapshot(
    query(collection(db, 'birthdays'), orderBy('date', 'asc')),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );

export const addBirthday = (data) =>
  addDoc(collection(db, 'birthdays'), { ...data, createdAt: serverTimestamp() });

export const updateBirthday = (id, data) =>
  updateDoc(doc(db, 'birthdays', id), data);

export const deleteBirthday = (id) =>
  deleteDoc(doc(db, 'birthdays', id));

// ── NOTIFICATIONS ─────────────────────────────────────────

export const getNotifications = (familyId, callback) =>
  onSnapshot(
    query(
      collection(db, 'notifications'),
      where('targetFamilyId', 'in', [familyId, null]),
      orderBy('createdAt', 'desc')
    ),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );

export const markNotifRead = (id) =>
  updateDoc(doc(db, 'notifications', id), { read: true });

// ── HELPERS ───────────────────────────────────────────────

export const toDate = (ts) =>
  ts instanceof Timestamp ? ts.toDate() : new Date(ts);

export const daysUntil = (date) => {
  const diff = toDate(date) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};
