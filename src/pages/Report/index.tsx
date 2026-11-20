import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Flame, BedDouble, Users, Gift, Home, Calendar, MapPin, Printer, Cake,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { useActiveEvent } from '@/hooks/useActiveEvent';
import { resolveDefaultEventId, upcomingEventsFrom } from '@/lib/eventState';
import { useFamilies } from '@/hooks/useFamilies';
import { useSeudot, useSeudahRegistrations } from '@/hooks/useSeudot';
import { useBookingsForEvent, useLocks, useClosedEvents } from '@/hooks/useBookings';
import { useBirthdays } from '@/hooks/useBirthdays';
import { useMemorials } from '@/hooks/useMemorials';
import { useCalendarMode } from '@/hooks/useCalendarMode';
import { formatDateByMode } from '@/lib/dates';
import { buildSummaryReport, NOT_ENTERED } from '@/lib/summaryReport';
import { SEUDAH_ICONS } from '@/types';
import type { FamilyEvent } from '@/lib/familyEvents';

interface ReportProps {
  isAdmin?: boolean;
}

// ── Small presentational helpers ────────────────────────────────────────────
function SummaryCard({
  icon, label, value,
}: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card padding="sm" className="text-center">
      <div className="flex items-center justify-center text-accent mb-1.5">{icon}</div>
      <p className="text-3xl font-bold text-primary leading-none">{value}</p>
      <p className="text-xs text-text-muted mt-1.5">{label}</p>
    </Card>
  );
}

function Section({
  icon, title, extra, children,
}: { icon: React.ReactNode; title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="report-section break-inside-avoid">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-h3 font-bold text-primary flex items-center gap-2">
          <span className="text-accent">{icon}</span> {title}
        </h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

const FAMILY_EVENT_META: Record<string, { icon: string; label: string }> = {
  birthday: { icon: '🎂', label: 'יום הולדת' },
  yahrzeit: { icon: '🕯', label: 'יום זיכרון' },
  anniversary: { icon: '💍', label: 'יום נישואין' },
};

function familyEventLine(fe: FamilyEvent): string {
  const meta = FAMILY_EVENT_META[fe.kind] ?? { icon: '📅', label: '' };
  const when =
    fe.days === 0 ? 'היום' : fe.days === 1 ? 'מחר' : `בעוד ${fe.days} ימים`;
  const ord = fe.count ? ` · ${fe.count}` : '';
  return `${meta.icon} ${fe.name}${ord} · ${meta.label} · ${when}`;
}

export function Report({ isAdmin = false }: ReportProps) {
  void isAdmin;
  const { eventId: routeEventId } = useParams();
  const { events, now } = useActiveEvent();
  const { data: families } = useFamilies();
  const { data: seudot } = useSeudot();
  const { data: registrations } = useSeudahRegistrations();
  const { data: birthdays } = useBirthdays();
  const { data: memorials } = useMemorials();
  const locks = useLocks();
  const closedEventIds = useClosedEvents();
  const [calMode] = useCalendarMode();

  const upcomingEvents = upcomingEventsFrom(events, now, { shabbatHolidayOnly: true });
  const [selectedEventId, setSelectedEventId] = useState('');
  const eventId =
    selectedEventId ||
    routeEventId ||
    resolveDefaultEventId(events, now) ||
    upcomingEvents[0]?.id ||
    '';
  const event = events.find(e => e.id === eventId);
  const isClosed = closedEventIds.includes(eventId);

  const { bookings } = useBookingsForEvent(eventId);

  const report = useMemo(
    () =>
      event
        ? buildSummaryReport({
            event, families, bookings, seudot, registrations,
            locks, isClosed, birthdays, memorials,
          })
        : null,
    [event, families, bookings, seudot, registrations, locks, isClosed, birthdays, memorials]
  );

  const eventOptions = upcomingEvents.map(e => ({
    value: e.id,
    label: `${e.title} — ${formatDateByMode(e.date?.toDate?.() ?? null, calMode, 'short')}`,
  }));

  return (
    <div className="report-page p-4 sm:p-6 max-w-3xl mx-auto print:p-0 print:max-w-none">
      {/* Event picker + print — hidden when printing */}
      <div className="no-print mb-5 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <Select
            label="בחר שבת או חג"
            options={eventOptions}
            value={eventId}
            onChange={e => setSelectedEventId(e.target.value)}
            placeholder="-- בחר שבת או חג --"
          />
        </div>
        <Button variant="outline" onClick={() => window.print()} disabled={!report}>
          <Printer size={16} /> הדפסה
        </Button>
      </div>

      {!report ? (
        <EmptyState icon="📋" title="בחרו שבת או חג כדי להפיק דוח" />
      ) : (
        <div className="space-y-7">
          {/* ── 1. Header ───────────────────────────────────────────── */}
          <header className="text-center border-b border-border pb-5">
            <p className="text-sm font-semibold text-accent mb-1">
              דוח הכנה ל{report.header.kindLabel}
            </p>
            <h1 className="text-h2 font-bold text-primary">
              {report.header.title}
              {report.header.parasha && (
                <span className="text-text-mid font-semibold"> · פרשת {report.header.parasha}</span>
              )}
            </h1>
            <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-text-mid">
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={14} className="text-text-muted" /> {report.header.hebrewDate}
              </span>
              <span className="inline-flex items-center gap-1.5 text-text-muted">
                {report.header.gregorianDate}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={14} className="text-text-muted" /> {report.header.hostCity}
              </span>
            </div>
          </header>

          {/* ── 2. Summary cards ────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard icon={<Flame size={20} />}     label="סה״כ נרות שבת"           value={report.cards.totalCandles} />
            <SummaryCard icon={<BedDouble size={20} />}  label="סה״כ לנים"               value={report.cards.totalSleepers} />
            <SummaryCard icon={<Users size={20} />}      label="שיא סועדים בסעודה"       value={report.cards.peakDiners} />
            <SummaryCard icon={<Gift size={20} />}       label="התחייבויות להביא"        value={report.cards.totalCommitments} />
          </div>

          {/* ── 3. Candles ──────────────────────────────────────────── */}
          <Section icon={<Flame size={20} />} title="נרות שבת">
            <div className="overflow-hidden rounded-card border border-border">
              <table className="w-full text-sm text-right">
                <thead className="bg-surface-alt text-text-mid">
                  <tr>
                    <th className="px-3 py-2 font-semibold">משפחה</th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">לנים בכרמיאל?</th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">מספר נפשות</th>
                    <th className="px-3 py-2 font-semibold">נרות</th>
                  </tr>
                </thead>
                <tbody>
                  {report.candles.rows.map(row => (
                    <tr key={row.key} className="border-t border-border">
                      <td className="px-3 py-2 font-medium text-text-base">{row.familyName}</td>
                      <td className="px-3 py-2 text-text-mid">{row.sleepsInKarmiel ? 'כן' : 'לא'}</td>
                      <td className="px-3 py-2 text-text-mid">{row.people ?? '—'}</td>
                      <td className="px-3 py-2 font-semibold text-primary">{row.candles}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-accent/40 bg-accent/5">
                    <td className="px-3 py-2.5 font-bold text-primary" colSpan={3}>סה״כ נרות</td>
                    <td className="px-3 py-2.5 font-bold text-lg text-accent">{report.candles.total}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>

          {/* ── 4. Seudot ───────────────────────────────────────────── */}
          <Section icon={<Users size={20} />} title="סעודות">
            <div className="space-y-3">
              {report.meals.perSeudah.map(({ seudah, registrations: regs, roomGuests, diners }) => (
                <Card key={seudah.id} padding="none" className="break-inside-avoid">
                  <div className="px-4 py-2.5 bg-primary/5 border-b border-border rounded-t-card flex items-center justify-between">
                    <h3 className="font-bold text-primary">
                      {SEUDAH_ICONS[seudah.type]} {seudah.type}
                    </h3>
                    <span className="text-sm font-semibold text-accent whitespace-nowrap">
                      {diners} סועדים
                    </span>
                  </div>
                  <ul className="divide-y divide-border">
                    <li className="px-4 py-2 flex justify-between gap-3 text-sm">
                      <span className="text-text-base">🏠 בני הבית ואורח קבוע</span>
                      <span className="text-text-muted whitespace-nowrap">
                        {report.autoAttendees.residents.join(', ')}, {report.autoAttendees.permanentGuests.join(', ')} · {report.autoAttendees.count} סועדים
                      </span>
                    </li>
                    {regs.map(r => (
                      <li key={r.id} className="px-4 py-2 flex justify-between gap-3 text-sm">
                        <span className="text-text-base">משפחת {r.familyName}</span>
                        <span className="text-text-muted whitespace-nowrap">
                          {r.adults} מבוגרים · {r.kids} ילדים · {r.diners} סועדים
                        </span>
                      </li>
                    ))}
                    {roomGuests.map(b => (
                      <li key={b.id} className="px-4 py-2 flex justify-between gap-3 text-sm">
                        <span className="text-text-base">
                          {b.isExternalGuest ? '👤 ' : 'משפחת '}{b.familyName}
                          <span className="text-text-muted text-xs"> (מתארחים ללינה)</span>
                        </span>
                        <span className="text-text-muted whitespace-nowrap">
                          {(b.adults || 0)} מבוגרים · {(b.kids || 0)} ילדים · {(b.adults || 0) + (b.kids || 0)} סועדים
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </Section>

          {/* ── 5. Who brings what ──────────────────────────────────── */}
          <Section icon={<Gift size={20} />} title="מי מביא מה">
            {report.commitments.length === 0 ? (
              <p className="text-sm text-text-muted">{NOT_ENTERED}</p>
            ) : (
              <div className="overflow-hidden rounded-card border border-border">
                <table className="w-full text-sm text-right">
                  <thead className="bg-surface-alt text-text-mid">
                    <tr>
                      <th className="px-3 py-2 font-semibold">משפחה / שם</th>
                      <th className="px-3 py-2 font-semibold">מה מביאים</th>
                      <th className="px-3 py-2 font-semibold">לאיזו סעודה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.commitments.map(c => (
                      <tr key={c.key} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-text-base">{c.name}</td>
                        <td className="px-3 py-2 text-text-mid">{c.bringing}</td>
                        <td className="px-3 py-2 text-text-muted whitespace-nowrap">{c.seudahType ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── 6. Rooms & lodging ──────────────────────────────────── */}
          <Section
            icon={<Home size={20} />}
            title="חדרים ולינה"
            extra={
              <span className="text-sm font-semibold text-accent whitespace-nowrap">
                סה״כ לנים: {report.totalSleepers}
              </span>
            }
          >
            <div className="grid sm:grid-cols-2 gap-3">
              {report.rooms.perRoom.map(({ room, guests, assigned }) => (
                <Card key={room.id} padding="sm" className="break-inside-avoid">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-text-base">{room.icon} {room.name}</p>
                    <span className="text-sm text-text-mid whitespace-nowrap">
                      {guests} / {room.maxAdults}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-1">
                    {assigned.length ? assigned.join(' · ') : 'פנוי'}
                  </p>
                </Card>
              ))}
            </div>
          </Section>

          {/* ── 7. Sleepers list ────────────────────────────────────── */}
          <Section icon={<BedDouble size={20} />} title="רשימת לנים">
            {report.sleepers.length === 0 ? (
              <p className="text-sm text-text-muted">{NOT_ENTERED}</p>
            ) : (
              <div className="overflow-hidden rounded-card border border-border">
                <table className="w-full text-sm text-right">
                  <thead className="bg-surface-alt text-text-mid">
                    <tr>
                      <th className="px-3 py-2 font-semibold">משפחה</th>
                      <th className="px-3 py-2 font-semibold">עיר</th>
                      <th className="px-3 py-2 font-semibold">מבוגרים</th>
                      <th className="px-3 py-2 font-semibold">ילדים</th>
                      <th className="px-3 py-2 font-semibold">סה״כ</th>
                      <th className="px-3 py-2 font-semibold">חדר משובץ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sleepers.map(s => (
                      <tr key={s.key} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-text-base">{s.familyName}</td>
                        <td className="px-3 py-2 text-text-mid">{s.city}</td>
                        <td className="px-3 py-2 text-text-mid">{s.adults}</td>
                        <td className="px-3 py-2 text-text-mid">{s.children}</td>
                        <td className="px-3 py-2 font-semibold text-primary">{s.total}</td>
                        <td className="px-3 py-2 text-text-mid">{s.roomName}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-accent/40 bg-accent/5">
                      <td className="px-3 py-2.5 font-bold text-primary" colSpan={4}>סה״כ לנים</td>
                      <td className="px-3 py-2.5 font-bold text-accent">{report.totalSleepers}</td>
                      <td className="px-3 py-2.5" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Section>

          {/* ── 8. Upcoming birthdays / memorials (optional) ────────── */}
          {report.familyEvents.length > 0 && (
            <Section icon={<Cake size={20} />} title="ימי הולדת וימי זיכרון קרובים">
              <Card padding="sm">
                <ul className="space-y-1.5 text-sm text-text-mid">
                  {report.familyEvents.map(fe => (
                    <li key={fe.id}>{familyEventLine(fe)}</li>
                  ))}
                </ul>
              </Card>
            </Section>
          )}

          {/* Print footer */}
          <p className="only-print text-center text-xs text-text-muted pt-4 border-t border-border">
            דוח הכנה ל{report.header.kindLabel} · {report.header.title} · {report.header.gregorianDate}
          </p>
        </div>
      )}
    </div>
  );
}
