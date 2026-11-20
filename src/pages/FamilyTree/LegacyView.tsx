import { useMemo } from 'react';
import { computeLegacyStats, getHeritageSpine } from '@/lib/familyTree/adapter';
import type { TreePerson } from '@/types';

const lifespan = (p: TreePerson) => [p.birthYear, p.deathYear].filter(Boolean).join(' – ');

/**
 * The signature "House of Shteinberg" storytelling view — headline legacy
 * figures plus the heritage spine rendered as a vertical lineage. Reads from
 * the adapter's `computeLegacyStats` / `getHeritageSpine`.
 */
export function LegacyView({
  persons, onOpen,
}: { persons: TreePerson[]; onOpen: (id: string) => void }) {
  const stats = useMemo(() => computeLegacyStats(persons), [persons]);
  const spine = useMemo(() => getHeritageSpine(persons), [persons]);

  const figures: Array<{ num: string; lbl: string }> = [
    { num: stats.founded ? String(stats.founded) : '—', lbl: 'נוסדה' },
    { num: String(stats.generations), lbl: 'דורות' },
    { num: String(stats.members), lbl: 'בני משפחה' },
    { num: String(stats.living), lbl: 'בחיים' },
    { num: String(stats.descendants), lbl: 'צאצאים' },
    { num: String(stats.countries), lbl: 'ארצות' },
  ];

  return (
    <div className="nt-canvas nt-legacy-wrap">
      <div className="nt-lg">
        <div className="nt-lg-hero">
          <div className="nt-lg-kicker">מורשת</div>
          <h1 className="nt-lg-title">בית שטיינברג</h1>
          <div className="nt-lg-en">The House of Shteinberg</div>
        </div>

        <div className="nt-lg-figures">
          {figures.map(f => (
            <div className="nt-lg-fig" key={f.lbl}>
              <div className="nt-lg-num" dir="ltr">{f.num}</div>
              <div className="nt-lg-lbl">{f.lbl}</div>
            </div>
          ))}
        </div>

        {stats.countryList.length > 0 && (
          <div className="nt-lg-journey">
            <div className="nt-lg-section-title">המסע</div>
            <div className="nt-lg-countries">
              {stats.countryList.map((c, i) => (
                <span key={c}>
                  {i > 0 && <span className="nt-lg-arrow" aria-hidden="true"> ← </span>}
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {spine.length > 0 && (
          <div className="nt-lg-spine">
            <div className="nt-lg-section-title">השושלת</div>
            <div className="nt-lg-chain">
              {spine.map((p, i) => (
                <div className="nt-lg-link" key={p.id}>
                  {i > 0 && <span className="nt-lg-down" aria-hidden="true">↓</span>}
                  <button className="nt-lg-person" onClick={() => onOpen(p.id)}>
                    <span className="nt-lg-person-name">{p.nameHe || p.nameLatin || '—'}</span>
                    {lifespan(p) && <span className="nt-lg-person-years" dir="ltr">{lifespan(p)}</span>}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
