import { useMemo } from 'react';
import { buildTimeline } from '@/lib/familyTree/adapter';
import { FLAG_CC } from '@/lib/treeLayout';
import type { TreePerson } from '@/types';

const birthVerb = (p: TreePerson) => (p.gender === 'f' ? 'נולדה' : 'נולד');
const deathVerb = (p: TreePerson) => (p.gender === 'f' ? 'נפטרה' : 'נפטר');

/**
 * Chronological family story — every birth and death, oldest first, on a
 * single editorial timeline. Reads from the adapter's `buildTimeline`.
 */
export function TimelineView({
  persons, onOpen,
}: { persons: TreePerson[]; onOpen: (id: string) => void }) {
  const events = useMemo(() => buildTimeline(persons), [persons]);

  return (
    <div className="nt-canvas nt-timeline-wrap">
      <div className="nt-tl">
        {events.map((e, i) => {
          const p = e.person;
          const prevYear = i > 0 ? events[i - 1].year : null;
          const showYear = e.year !== prevYear;
          const place = (p.birthCity || p.originCountry || '').trim();
          const flag = p.originCountry ? FLAG_CC[p.originCountry.trim()] || '' : '';
          const verb = e.type === 'birth' ? birthVerb(p) : deathVerb(p);
          return (
            <div className={`nt-tl-row ${e.type}`} key={`${p.id}-${e.type}`}>
              <div className="nt-tl-year" dir="ltr">{showYear ? e.year : ''}</div>
              <div className="nt-tl-track" aria-hidden="true">
                <span className="nt-tl-dot">{e.type === 'birth' ? '🌱' : '🕯'}</span>
              </div>
              <button className="nt-tl-card" onClick={() => onOpen(p.id)}>
                <span className="nt-tl-verb">{verb}</span>
                <span className="nt-tl-name">{p.nameHe || p.nameLatin || '—'}</span>
                {place && (
                  <span className="nt-tl-place">
                    {flag && (
                      <img src={`https://flagcdn.com/16x12/${flag}.png`} alt="" width={13} height={10}
                        style={{ verticalAlign: 'middle', marginInlineEnd: 4, borderRadius: 1 }} />
                    )}
                    {place}
                  </span>
                )}
              </button>
            </div>
          );
        })}
        {events.length === 0 && (
          <div className="nt-soon"><div className="nt-soon-sub">אין עדיין תאריכים לשרטוט ציר הזמן.</div></div>
        )}
      </div>
    </div>
  );
}
