const https = require('https');
const fs = require('fs');

const configPath = process.env.USERPROFILE + '\\.config\\configstore\\firebase-tools.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const token = config.tokens.access_token;
const PROJECT = 'steinberg-family-c0c32';
const BASE = `firestore.googleapis.com`;

function request(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE,
      path: `/v1/projects/${PROJECT}/databases/(default)/documents${path}`,
      headers: { Authorization: `Bearer ${token}` }
    };
    https.get(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(data)); }
      });
    }).on('error', reject);
  });
}

function parseTimestamp(val) {
  if (!val) return null;
  if (val.timestampValue) return new Date(val.timestampValue);
  return null;
}

async function getDocs(collection, pageToken) {
  const qs = pageToken ? `?pageToken=${pageToken}&pageSize=300` : `?pageSize=300`;
  return request(`/${collection}${qs}`);
}

async function getAllDocs(collection) {
  const docs = [];
  let pageToken = null;
  do {
    const res = await getDocs(collection, pageToken);
    if (res.error) { console.error(`Error in ${collection}:`, res.error.message); break; }
    if (res.documents) docs.push(...res.documents);
    pageToken = res.nextPageToken || null;
  } while (pageToken);
  return docs;
}

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

async function main() {
  const collections = ['bookings', 'food', 'families', 'events', 'birthdays'];
  const bydow = Array(7).fill(0);
  const byDate = {};
  let total = 0;
  const collectionCounts = {};

  for (const col of collections) {
    const docs = await getAllDocs(col);
    let colCount = 0;
    for (const doc of docs) {
      const fields = doc.fields || {};
      const ts = parseTimestamp(fields.createdAt);
      if (!ts) continue;
      const dow = ts.getDay();
      bydow[dow]++;
      total++;
      colCount++;
      const dateKey = ts.toISOString().slice(0, 10);
      byDate[dateKey] = (byDate[dateKey] || 0) + 1;
    }
    collectionCounts[col] = colCount;
  }

  console.log(`\nTotal actions tracked: ${total}`);
  console.log('\nBreakdown by action type:');
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
    console.log('\nActions by date:');
    dates.forEach(d => {
      const bar = '█'.repeat(Math.round(byDate[d] / maxDay * 20));
      console.log(`  ${d}  ${String(byDate[d]).padStart(3)}  ${bar}`);
    });

    const firstDate = new Date(dates[0]);
    const lastDate = new Date(dates[dates.length - 1]);
    const spanDays = Math.max(1, (lastDate - firstDate) / 86400000 + 1);
    console.log(`\nDate range: ${dates[0]} → ${dates[dates.length - 1]} (${Math.round(spanDays)} days)`);
    console.log(`Avg per active day: ${(total / dates.length).toFixed(1)}`);
    console.log(`Avg per calendar day: ${(total / spanDays).toFixed(1)}`);
    console.log(`Avg per week: ${(total / (spanDays / 7)).toFixed(1)}`);
  }
}

main().catch(console.error);
