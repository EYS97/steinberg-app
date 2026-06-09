const https = require('https');
const fs = require('fs');

const configPath = process.env.USERPROFILE + '\\.config\\configstore\\firebase-tools.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const token = config.tokens.access_token;
const PROJECT = 'steinberg-family-c0c32';

const authExport = JSON.parse(fs.readFileSync('C:/Users/shtei/AppData/Local/Temp/users_export.json', 'utf8'));
const users = authExport.users || [];

function firestorePatch(docPath, body, fieldMask) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const maskQS = fieldMask.map(f => `updateMask.fieldPaths=${f}`).join('&');
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}?${maskQS}`,
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(out);
          if (parsed.error) reject(new Error(parsed.error.message));
          else resolve(parsed);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log(`Seeding ${users.length} users into userActivity...`);
  for (const u of users) {
    const name = u.displayName || u.email || 'משתמש';
    const firstSeen = new Date(parseInt(u.createdAt)).toISOString();
    const lastSeen  = new Date(parseInt(u.lastSignedInAt || u.createdAt)).toISOString();
    const body = {
      fields: {
        uid:       { stringValue: u.localId },
        name:      { stringValue: name },
        email:     { stringValue: u.email || '' },
        firstSeen: { timestampValue: firstSeen },
        lastSeen:  { timestampValue: lastSeen },
      }
    };
    // Only update identity/date fields — loginCount is left untouched on existing docs
    const mask = ['uid', 'name', 'email', 'firstSeen', 'lastSeen'];
    try {
      await firestorePatch(`userActivity/${u.localId}`, body, mask);
      console.log(`  ✓ ${name} | ${u.email} | joined: ${firstSeen.slice(0,10)}`);
    } catch (e) {
      console.log(`  ✗ ${name}: ${e.message}`);
    }
  }
  console.log('Done.');
}

main().catch(console.error);
