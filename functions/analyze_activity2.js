const admin = require('firebase-admin');
const fs = require('fs');

// Load token from Firebase CLI stored credentials
const configPath = process.env.USERPROFILE + '\\.config\\configstore\\firebase-tools.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { access_token, refresh_token } = config.tokens;

admin.initializeApp({
  credential: {
    getAccessToken: () => Promise.resolve({ access_token, expires_in: 3600 })
  },
  projectId: 'steinberg-family-c0c32'
});
const db = admin.firestore();

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

async function main() {
  const collections = ['bookings', 'food', 'families', 'events', 'birthdays'];
  const bydow = Array(7).fill(0);
  const byDate = {};
  let total = 0;
  const collectionCounts = {};

  for (const col of collections) {
    const snap = await db.collection(col).get();
    let colCount = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      const ts = data.createdAt;
      if (!ts) continue;
      const date = ts.toDate();
      const dow = date.getDay();
      bydow[dow]++;
      total++;
      colCount++;
      const dateKey = date.toISOString().slice(0, 10);
      byDate[dateKey] = (byDate[dateKey] || 0) + 1;
    }
    collectionCounts[col] = colCount;
  }

  console.log(`\nTotal actions tracked: ${total}`);
  console.log('\nBreakdown by collection (action type):');
  Object.entries(collectionCounts).forEach(([col, n]) => {
    console.log(`  ${col.padEnd(12)} ${n}`);
  });

  const maxDow = Math.max(...bydow);
  console.log('\nActions by day of week:');
  DAYS.forEach((day, i) => {
    const bar = '█'.repeat(maxDow > 0 ? Math.round(bydow[i] / maxDow * 20) : 0);
    console.log(`  ${day.padEnd(10)} ${String(bydow[i]).padStart(3)}  ${bar}`);
  });

  const dates = Object.keys(byDate).sort();
  if (dates.length) {
    const maxDay = Math.max(...Object.values(byDate));
    console.log('\nActions by calendar date:');
    dates.forEach(d => {
      const bar = '█'.repeat(Math.round(byDate[d] / maxDay * 20));
      console.log(`  ${d}  ${String(byDate[d]).padStart(3)}  ${bar}`);
    });

    const firstDate = new Date(dates[0]);
    const lastDate = new Date(dates[dates.length - 1]);
    const spanDays = Math.max(1, (lastDate - firstDate) / 86400000 + 1);
    console.log(`\nDate range: ${dates[0]} → ${dates[dates.length - 1]} (${Math.round(spanDays)} days)`);
    console.log(`Avg actions/active day: ${(total / dates.length).toFixed(1)}`);
    console.log(`Avg actions/calendar day: ${(total / spanDays).toFixed(1)}`);
    console.log(`Avg actions/week: ${(total / (spanDays / 7)).toFixed(1)}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
