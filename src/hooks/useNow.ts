import { useEffect, useState } from 'react';

// A clock that ticks so time-dependent UI (the active Shabbat/holiday) rolls
// over on its own — no manual refresh. Recomputes on a coarse interval and,
// crucially, the moment the app is brought back to the foreground (tab focus
// or returning from background), which is when a stale "now" is most likely.
//
// State only changes when the truncated tick actually advances, so an open
// page re-renders at most once per `intervalMs` rather than on every timer.
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () =>
      setNow(prev => {
        const next = new Date();
        // Avoid redundant re-renders within the same interval bucket.
        if (Math.floor(next.getTime() / intervalMs) === Math.floor(prev.getTime() / intervalMs)) {
          return prev;
        }
        return next;
      });

    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') setNow(new Date()); };
    const onFocus = () => setNow(new Date());

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [intervalMs]);

  return now;
}
