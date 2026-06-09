const admin = require('firebase-admin');
const app = admin.initializeApp({ projectId: 'steinberg-family-c0c32' });
const db = admin.firestore();

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAYS_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

async function main() {
  // Collections that represent user actions (have createdAt timestamps)
  const collections = ['bookings', 'food', 'families', 'events', 'birthdays'];

  const bydow = Array(7).fill(0); // day-of-week counts
  const byDate = {};
  let total = 0;

  for (const col of collections) {
    const snap = await db.collection(col).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const ts = data.createdAt;
      if (!ts) continue;
      const date = ts.toDate();
      const dow = date.getDay();
      bydow[dow]++;
      total++;
      const dateKey = date.toISOString().slice(0, 10);
      byDate[dateKey] = (byDate[dateKey] || 0) + 1;
    }
  }

  console.log(`\nTotal actions tracked: ${total}`);
  console.log('\nActions by day of week:');
  bydow.forEach((count, i) => {
    const bar = '█'.repeat(Math.round(count / Math.max(...bydow) * 20));
    console.log(`  ${DAYS[i].padEnd(10)} (${DAYS_HE[i].padEnd(6)}) ${String(count).padStart(3)}  ${bar}`);
  });

  const dates = Object.keys(byDate).sort();
  if (dates.length) {
    console.log('\nActions by date:');
    dates.forEach(d => {
      const bar = '█'.repeat(Math.round(byDate[d] / Math.max(...Object.values(byDate)) * 20));
      console.log(`  ${d}  ${String(byDate[d]).padStart(3)}  ${bar}`);
    });

    // Average per day (across dates that have activity)
    const avgPerActiveDay = (total / dates.length).toFixed(1);
    const firstDate = new Date(dates[0]);
    const lastDate = new Date(dates[dates.length - 1]);
    const spanDays = Math.max(1, (lastDate - firstDate) / 86400000 + 1);
    const avgPerCalDay = (total / spanDays).toFixed(1);
    console.log(`\nDate range: ${dates[0]} → ${dates[dates.length-1]} (${Math.round(spanDays)} days)`);
    console.log(`Avg actions/active day: ${avgPerActiveDay}`);
    console.log(`Avg actions/calendar day: ${avgPerCalDay}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
