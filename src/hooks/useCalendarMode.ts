import { useEffect, useState } from 'react';
import type { CalendarMode } from '@/lib/dates';

const STORAGE_KEY = 'steinberg-calendar-mode';
const EVENT = 'calendar-mode-changed';

function readMode(): CalendarMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'gregorian' || v === 'hebrew' || v === 'combined' ? v : 'combined';
}

/** Global calendar display mode (Gregorian / Hebrew / combined), persisted in localStorage */
export function useCalendarMode(): [CalendarMode, (m: CalendarMode) => void] {
  const [mode, setModeState] = useState<CalendarMode>(readMode);

  useEffect(() => {
    const sync = () => setModeState(readMode());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setMode = (m: CalendarMode) => {
    localStorage.setItem(STORAGE_KEY, m);
    window.dispatchEvent(new Event(EVENT));
  };

  return [mode, setMode];
}
