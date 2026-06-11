import { useState, useEffect, useMemo } from 'react';
import { orderBy, Timestamp } from 'firebase/firestore';
import { useFirestoreCollection } from './useFirestoreCollection';
import {
  convertGregorianToHebrew,
  getRecurringHebrewDateOccurrences,
  getRecurringGregorianOccurrences,
  parseHebrewDateParts,
  formatGregorianDate,
} from '@/lib/dates';
import type { AppEvent, EventType } from '@/types';

// The old vanilla-JS app never stored Shabbat/holiday events in Firestore — it
// generated them client-side (ids `shabbat-YYYY-MM-DD` / `holiday-YYYY-MM-DD`)
// and bookings/food reference those ids. This hook reproduces that behaviour
// and merges the generated events with manual Firestore events.

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface HebcalData {
  parashot: Record<string, string>; // YYYY-MM-DD → parasha name (no "פרשת" prefix)
  holidays: { dateStr: string; title: string }[];
}

let _hebcalPromise: Promise<HebcalData> | null = null;

function loadHebcal(): Promise<HebcalData> {
  if (_hebcalPromise) return _hebcalPromise;
  _hebcalPromise = (async () => {
    const today = new Date();
    const start = new Date(today); start.setMonth(start.getMonth() - 6);
    const end = new Date(today); end.setFullYear(end.getFullYear() + 1);
    const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&start=${fmt(start)}&end=${fmt(end)}&s=on&maj=on&c=off&lg=he&i=on`;
    const parashot: Record<string, string> = {};
    const holidays: { dateStr: string; title: string }[] = [];
    try {
      const res = await fetch(url);
      const data = await res.json();
      for (const item of data.items || []) {
        if (item.category === 'parashat') {
          parashot[item.date] = (item.hebrew || '').replace(/^פרשת\s+/, '');
        } else if (item.category === 'holiday' && !(item.hebrew || item.title || '').startsWith('ערב ')) {
          holidays.push({ dateStr: item.date, title: item.hebrew || item.title });
        }
      }
    } catch {
      // Offline / Hebcal down — Shabbatot are still generated, just without parashot
    }
    return { parashot, holidays };
  })();
  return _hebcalPromise;
}

const PAST_WEEKS = 52;
const FUTURE_WEEKS = 12;

function generateShabbatot(parashot: Record<string, string>): AppEvent[] {
  const out: AppEvent[] = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(today);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7)); // this/next Saturday
  d.setDate(d.getDate() - PAST_WEEKS * 7);
  for (let i = 0; i < PAST_WEEKS + FUTURE_WEEKS; i++) {
    const dateStr = fmt(d);
    const parasha = parashot[dateStr] || '';
    out.push({
      id: `shabbat-${dateStr}`,
      title: parasha
        ? `שבת פרשת ${parasha}`
        : `שבת ${formatGregorianDate(d, 'short')}`,
      date: Timestamp.fromDate(new Date(`${dateStr}T12:00:00`)),
      type: 'shabbat',
      notes: '',
      parasha,
      auto: true,
    });
    d.setDate(d.getDate() + 7);
  }
  return out;
}

function generateHolidays(holidays: { dateStr: string; title: string }[]): AppEvent[] {
  return holidays.map(h => ({
    id: `holiday-${h.dateStr}`,
    title: h.title,
    date: Timestamp.fromDate(new Date(`${h.dateStr}T12:00:00`)),
    type: 'holiday' as EventType,
    notes: '',
    isHoliday: true,
    auto: true,
  }));
}

// Old app stored manual event types in Hebrew
const TYPE_NORM: Record<string, EventType> = {
  'שבת': 'shabbat',
  'חג': 'holiday',
  'אירוע': 'event',
  'אירוע משפחתי': 'event',
  'יום זיכרון': 'memorial',
  'ארוחה': 'meal',
  'אירוח': 'hosting',
};

// Expand an annually-recurring event into occurrences inside the app's window.
// Hebrew-anchored events recur by the Hebrew calendar (e.g. a yahrzeit on
// כ׳ בכסלו falls on a different Gregorian date every year).
function expandRecurring(ev: AppEvent): AppEvent[] {
  const base = ev.date?.toDate?.();
  if (!ev.recurrenceCalendar || !base) return [ev];

  const start = new Date(); start.setMonth(start.getMonth() - 6);
  const end = new Date(); end.setMonth(end.getMonth() + 13);

  const occurrences = ev.recurrenceCalendar === 'hebrew'
    ? getRecurringHebrewDateOccurrences(
        parseHebrewDateParts(ev.hebrewDate) ?? convertGregorianToHebrew(base),
        start, end,
        ev.type === 'memorial' ? 'yahrzeit' : 'birthday'
      )
    : getRecurringGregorianOccurrences(base.getMonth() + 1, base.getDate(), start, end);

  const out: AppEvent[] = [ev];
  for (const g of occurrences) {
    if (g.toDateString() === base.toDateString()) continue;
    const dateStr = fmt(g);
    out.push({
      ...ev,
      id: `${ev.id}__${dateStr}`,
      sourceId: ev.id,
      date: Timestamp.fromDate(new Date(`${dateStr}T12:00:00`)),
    });
  }
  return out;
}

export function useEvents() {
  const { data: manual, loading, error } = useFirestoreCollection<AppEvent>('events', [orderBy('date')]);
  const [hebcal, setHebcal] = useState<HebcalData>({ parashot: {}, holidays: [] });

  useEffect(() => {
    let active = true;
    loadHebcal().then(h => { if (active) setHebcal(h); });
    return () => { active = false; };
  }, []);

  const data = useMemo(() => {
    const taken = new Set<string>();
    const out: AppEvent[] = [];

    // Manual Firestore events take priority on their date
    manual.forEach(ev => {
      const normalized = { ...ev, type: TYPE_NORM[ev.type as string] ?? ev.type };
      for (const occ of expandRecurring(normalized)) {
        const d = occ.date?.toDate?.();
        if (d) taken.add(d.toDateString());
        out.push(occ);
      }
    });

    // Then Hebcal holidays, then Shabbatot fill the remaining dates
    for (const ev of [...generateHolidays(hebcal.holidays), ...generateShabbatot(hebcal.parashot)]) {
      const key = ev.date.toDate().toDateString();
      if (taken.has(key)) continue;
      taken.add(key);
      out.push(ev);
    }

    out.sort((a, b) => (a.date?.toDate?.()?.getTime() ?? 0) - (b.date?.toDate?.()?.getTime() ?? 0));
    return out;
  }, [manual, hebcal]);

  return { data, loading, error };
}
