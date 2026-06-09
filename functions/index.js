// functions/index.js
// Firebase Cloud Functions — שולח התראות אוטומטיות

const { onSchedule }        = require('firebase-functions/v2/scheduler');
const { onCall }            = require('firebase-functions/v2/https');
const { initializeApp }     = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const Anthropic             = require('@anthropic-ai/sdk');

initializeApp();
const db = getFirestore();

// ── יום שלישי 09:00 — תזכורת חדרים פנויים ────────────────
exports.tuesdayReminder = onSchedule(
  { schedule: '0 9 * * 2', timeZone: 'Asia/Jerusalem' },
  async () => {
    const now     = new Date();
    const nextFri = getNextFriday(now);
    const nextSat = new Date(nextFri); nextSat.setDate(nextFri.getDate() + 1);

    const eventsSnap = await db.collection('events')
      .where('date', '>=', Timestamp.fromDate(nextFri))
      .where('date', '<=', Timestamp.fromDate(nextSat))
      .get();

    for (const eventDoc of eventsSnap.docs) {
      const event       = eventDoc.data();
      const bookingsSnap = await db.collection('bookings').where('eventId', '==', eventDoc.id).get();
      const bookedRooms  = bookingsSnap.docs.map(d => d.data().roomId);
      const ROOM_IDS     = ['penina', 'israel', 'yehuda', 'hayechida'];
      const freeRooms    = ROOM_IDS.filter(r => !bookedRooms.includes(r));
      const foodSnap     = await db.collection('food').where('eventId', '==', eventDoc.id).get();
      const takenCats    = foodSnap.docs.map(d => d.data().category);
      const ALL_CATS     = ['starter','main','dessert','drinks','bread','fruits'];
      const missingCats  = ALL_CATS.filter(c => !takenCats.includes(c));
      if (freeRooms.length === 0 && missingCats.length === 0) continue;
      const lines = [];
      if (freeRooms.length > 0) lines.push(`🏡 חדרים פנויים ל${event.title}: ${freeRooms.join(', ')}`);
      if (missingCats.length > 0) lines.push(`🍽 חסר לסעודה: ${missingCats.join(', ')}`);
      await db.collection('notifications').add({
        type: 'tuesday_reminder', message: lines.join('\n'),
        targetFamilyId: null, eventId: eventDoc.id,
        read: false, createdAt: Timestamp.now(),
      });
    }
  }
);

// ── יום רביעי 20:00 — דוח מסכם לאבא ─────────────────────
exports.wednesdayReport = onSchedule(
  { schedule: '0 20 * * 3', timeZone: 'Asia/Jerusalem' },
  async () => {
    // Read config: fatherPhone + callMeBotApiKey from settings/config
    const configDoc = await db.collection('settings').doc('config').get();
    const config    = configDoc.exists ? configDoc.data() : {};
    const fatherPhone  = config.fatherPhone  || '';
    const callMeBotKey = config.callMeBotApiKey || '';
    if (!fatherPhone || !callMeBotKey) {
      console.warn('wednesdayReport: fatherPhone or callMeBotApiKey not set in settings/config');
      return;
    }

    const now      = new Date();
    const nextShab = getNextShabbat(now);           // next Saturday
    const dayBefore = new Date(nextShab); dayBefore.setDate(nextShab.getDate() - 1); // Friday

    // Find matching event id: try shabbat-YYYY-MM-DD first, then Firestore events
    const shabDateStr = fmtDate(nextShab);
    const eventId     = `shabbat-${shabDateStr}`;
    const eventTitle  = `שבת ${shabDateStr}`;

    // Fetch all data for this event
    const [bookSnap, foodSnap, guestSnap] = await Promise.all([
      db.collection('bookings').where('eventId', '==', eventId).get(),
      db.collection('food').where('eventId', '==', eventId).get(),
      db.collection('guests').get(),
    ]);

    const bookings = bookSnap.docs.map(d => d.data());
    const foods    = foodSnap.docs.map(d => d.data());
    const guests   = guestSnap.docs.map(d => d.data());

    const DEFAULT_DINERS = 4; // אבא, אמא, סבא, פנינה
    const ROOM_NAMES = { penina:'חדר פנינה', israel:'חדר ישראל', yehuda:'חדר יהודה', hayechida:'היחידה' };

    const lines = [];
    lines.push(`*דוח שבתי — משפחת שטיינברג* 🏡`);
    lines.push(`*${eventTitle}* — ${formatDateHe(nextShab)}`);
    lines.push(`_________________________`);

    // All 4 rooms — booked or free
    const ROOM_ORDER = ['penina','israel','yehuda','hayechida'];
    lines.push('');
    lines.push('🛏 *חדרים:*');
    ROOM_ORDER.forEach(rid => {
      const b = bookings.find(b => b.roomId === rid);
      const roomLabel = ROOM_NAMES[rid] || rid;
      if (b) {
        const pax = `${b.adults||0} מבוגרים${(b.kids||0)>0?' + '+b.kids+' ילדים':''}`;
        const mealNote = b.mealParticipation && b.mealParticipation !== 'all' && Array.isArray(b.mealParticipation)
          ? ` · ${b.mealParticipation.join(', ')}` : '';
        lines.push(`• ${roomLabel}: ${b.isExternalGuest?'👤 ':''}${b.familyName} (${pax})${mealNote}`);
      } else {
        lines.push(`• ${roomLabel}: פנוי`);
      }
    });

    // Per-meal attendees — everyone including defaults
    const evGuests   = guests.filter(g => !g.isPermanent && g.eventId === eventId);
    const permGuests = guests.filter(g => g.isPermanent);
    const MEALS = ['ליל שבת','סעודת שבת','סעודה שלישית'];
    lines.push('');
    lines.push('👥 *סועדים לפי סעודה:*');
    MEALS.forEach(meal => {
      // Calculate total
      let total = DEFAULT_DINERS;
      const seenKeys = new Set();
      bookings.forEach(b => {
        const mp = b.mealParticipation;
        if (mp && mp !== 'all' && Array.isArray(mp) && !mp.includes(meal)) return;
        const key = b.familyId || b.familyName;
        if (!key || seenKeys.has(key)) return;
        seenKeys.add(key);
        total += (b.adults||0) + (b.kids||0);
      });
      total += permGuests.filter(g=>g.mealType===meal).reduce((s,g)=>s+(g.count||1),0);
      total += evGuests.filter(g=>!g.allMeals&&g.mealType===meal).reduce((s,g)=>s+(g.count||1),0);
      total += evGuests.filter(g=>g.allMeals).reduce((s,g)=>s+(g.count||1),0);
      lines.push(`*${meal}* — ${total} סועדים:`);
      // Household defaults always present
      lines.push(`  🏠 אבא, אמא, סבא ופנינה (${DEFAULT_DINERS})`);
      // Room bookings joining this meal
      const seenK2 = new Set();
      bookings.forEach(b => {
        const mp = b.mealParticipation;
        if (mp && mp !== 'all' && Array.isArray(mp) && !mp.includes(meal)) return;
        const key = b.familyId || b.familyName;
        if (!key || seenK2.has(key)) return;
        seenK2.add(key);
        const pax = (b.adults||0)+(b.kids||0);
        lines.push(`  ${b.isExternalGuest?'👤':'👨‍👩‍👧'} ${b.familyName} (${pax})`);
      });
      // Permanent guests for this meal
      permGuests.filter(g=>g.mealType===meal).forEach(g=>lines.push(`  ⭐ ${g.name} (${g.count||1})`));
      // External guests — this meal or all meals
      evGuests.filter(g=>g.allMeals).forEach(g=>lines.push(`  👤 ${g.name} 🍽 (${g.count||1})`));
      evGuests.filter(g=>!g.allMeals&&g.mealType===meal).forEach(g=>lines.push(`  👤 ${g.name} (${g.count||1})`));
    });

    // Food by meal
    if (foods.length) {
      const MEAL_ORDER = ['ליל שבת','סעודת שבת','סעודה שלישית','ליל חג','סעודת חג'];
      const byMeal = {};
      foods.forEach(f => { const m = f.mealType||f.category||'?'; if (!byMeal[m]) byMeal[m]=[]; byMeal[m].push(f); });
      const sortedMeals = [...MEAL_ORDER.filter(m=>byMeal[m]), ...Object.keys(byMeal).filter(m=>!MEAL_ORDER.includes(m))];
      lines.push('');
      lines.push('🍽 *סעודות:*');
      sortedMeals.forEach(meal => {
        lines.push(`*${meal}:*`);
        byMeal[meal].forEach(f => lines.push(`  • ${f.dish}${f.family?' — '+f.family:''}`));
      });
    }

    // Special needs
    const needs = bookings.flatMap(b => b.needs||[]).filter(Boolean);
    if (needs.length) {
      lines.push('');
      lines.push(`⚠️ *צרכים מיוחדים:* ${[...new Set(needs)].join(', ')}`);
    }

    const message = lines.join('\n');

    // Send via CallMeBot
    const url = `https://api.callmebot.com/whatsapp.php?phone=${fatherPhone}&text=${encodeURIComponent(message)}&apikey=${callMeBotKey}`;
    try {
      const resp = await fetch(url);
      const body = await resp.text();
      console.log('CallMeBot response:', resp.status, body.slice(0,200));
      await db.collection('notifications').add({
        type: 'wednesday_report', message,
        targetFamilyId: 'father', eventId, read: false, createdAt: Timestamp.now(),
      });
    } catch (e) {
      console.error('Failed to send WhatsApp to father:', e);
    }
  }
);

// ── יום הולדת — שבוע לפני ────────────────────────────────
exports.birthdayAlert = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'Asia/Jerusalem' },
  async () => {
    const now = new Date();
    const bdaySnap = await db.collection('birthdays').get();
    for (const bdoc of bdaySnap.docs) {
      const bday   = bdoc.data();
      if (!bday.date) continue;
      const bdDate = bday.date.toDate();
      const thisYear = new Date(now.getFullYear(), bdDate.getMonth(), bdDate.getDate());
      const daysLeft = Math.ceil((thisYear - now) / 86400000);
      if (daysLeft === 7) {
        await db.collection('notifications').add({
          type: 'birthday_alert',
          message: `🎂 ${bday.name} חוגג/ת יום הולדת בעוד שבוע! (${formatDateHe(thisYear)})`,
          targetFamilyId: null, birthdayId: bdoc.id, read: false, createdAt: Timestamp.now(),
        });
      }
      if (daysLeft === 0) {
        await db.collection('notifications').add({
          type: 'birthday_today',
          message: `🎉 היום יום הולדת של ${bday.name}! אחלו לו/לה מזל טוב!`,
          targetFamilyId: null, birthdayId: bdoc.id, read: false, createdAt: Timestamp.now(),
        });
      }
    }
  }
);

// ── ברכת יום הולדת עם AI ─────────────────────────────────
exports.generateBirthdayGreeting = onCall(async (request) => {
  const { name, familyContext } = request.data || {};
  if (!name) return { greeting: null };

  const configDoc = await db.collection('settings').doc('config').get();
  const apiKey = configDoc.exists ? configDoc.data().anthropicApiKey : null;
  if (!apiKey) return { greeting: null };

  const client = new Anthropic({ apiKey });
  const contextLine = familyContext ? `מה שאנחנו יודעים עליו/עליה: ${familyContext}.` : '';
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 120,
    messages: [{
      role: 'user',
      content: `אתה כותב ברכות יום הולדת מצחיקות ואישיות בעברית למשפחת שטיינברג מקרמיאל.
כתוב ברכה מצחיקה ל${name}. ${contextLine}
כללים: 1-2 משפטים בלבד, עברית, חמה ומצחיקה, מתאים לכל הגילאים, אישי ולא גנרי. בלי "מזל טוב" גנרי בהתחלה.`
    }]
  });
  return { greeting: msg.content[0].text.trim() };
});

// ── HELPERS ───────────────────────────────────────────────
function getNextFriday(from) {
  const d = new Date(from);
  const daysToFri = (5 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + daysToFri);
  d.setHours(0,0,0,0);
  return d;
}

function getNextShabbat(from) {
  const d = new Date(from);
  const daysToSat = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + daysToSat);
  d.setHours(0,0,0,0);
  return d;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateHe(d) {
  const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
