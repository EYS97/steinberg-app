# 🏡 משפחת שטיינברג — מדריך הרמה לפרודקשן

## מה יש כאן

```
steinberg-app/
├── src/
│   ├── lib/
│   │   ├── firebase.js     ← אתחול Firebase
│   │   └── db.js           ← כל פעולות מסד הנתונים
│   └── hooks/
│       └── useAuth.js      ← כניסה / זיהוי משתמשים
├── functions/
│   └── index.js            ← Cloud Functions (תזכורות, דוחות)
├── firestore.rules          ← הרשאות אבטחה
├── firebase.json            ← הגדרות Firebase
├── .env.example             ← משתני סביבה (template)
└── family-app.html          ← ה-UI הקיים (לשלב עם React)
```

---

## שלב 1 — הקמת פרויקט Firebase (15 דק׳)

1. כנס ל-[console.firebase.google.com](https://console.firebase.google.com)
2. **"Add project"** → שם: `steinberg-family`
3. בפרויקט, לחץ **"</> Web"** → העתק את ה-`firebaseConfig`
4. הפעל שירותים:
   - **Authentication** → Sign-in methods → הפעל **Google** + **Phone**
   - **Firestore Database** → Create database → **Production mode** → Region: `europe-west1`
   - **Functions** → Upgrade to Blaze plan (חינמי עד ~2M קריאות/חודש)
   - **Hosting** → Get started

---

## שלב 2 — הגדרת הסביבה המקומית (10 דק׳)

```bash
# התקן Node.js 20+ אם אין
node -v

# התקן Firebase CLI
npm install -g firebase-tools

# התחבר
firebase login

# בתוך תיקיית הפרויקט
npm install
cd functions && npm install && cd ..

# צור קובץ env
cp .env.example .env.local
# ערוך את .env.local עם הערכים מ-Firebase Console
```

---

## שלב 3 — הכנסת נתוני Bootstrap (5 דק׳)

הרץ את הסקריפט הבא פעם אחת כדי לאכלס את Firestore עם נתוני ברירת מחדל:

```js
// הרץ זאת מ-Firebase Console → Firestore → ממשק ידני
// או צור סקריפט Node.js עם firebase-admin

// משפחות:
families/parents  → { name: "אבא ואמא", adults: 2, kids: 0, needs: [], isParent: true }
families/yonatan  → { name: "יונתן ורות", adults: 2, kids: 1, needs: ["עריסת תינוק"] }
families/shimon   → { name: "שמעון ולאה", adults: 2, kids: 2, needs: ["אמבטיית תינוק"] }
families/sarah    → { name: "שרה ומיכאל", adults: 2, kids: 3, needs: [] }
families/miriam   → { name: "מרים ואלי", adults: 2, kids: 1, needs: ["עריסת תינוק"] }
families/dina     → { name: "דינה ונחום", adults: 2, kids: 0, needs: [] }
families/aharon   → { name: "אהרן", adults: 1, kids: 0, needs: [] }
families/binyamin → { name: "בנימין", adults: 1, kids: 0, needs: [] }
families/rivka    → { name: "רבקה", adults: 1, kids: 0, needs: [] }
```

---

## שלב 4 — Deploy (5 דק׳)

```bash
# בנה את ה-React app
npm run build

# העלה הכל ל-Firebase
firebase deploy

# או בנפרד:
firebase deploy --only hosting      # רק ה-UI
firebase deploy --only functions    # רק ה-Cloud Functions
firebase deploy --only firestore    # רק ה-rules
```

**הכתובת שתקבל:** `https://steinberg-family.web.app`

---

## שלב 5 — חיבור WhatsApp (אופציונלי, 30 דק׳)

1. פתח חשבון ב-[Twilio](https://twilio.com) (יש trial חינמי)
2. הפעל WhatsApp Sandbox
3. ב-`functions/index.js`, בטל הערה על `sendWhatsApp()`
4. הוסף את ה-credentials ל-Firebase Functions config:

```bash
firebase functions:config:set twilio.sid="ACxxx" twilio.token="xxx" twilio.from="whatsapp:+14155238886"
```

---

## מבנה Firestore

| Collection | תיאור |
|---|---|
| `families` | כל יחידה משפחתית |
| `events` | שבתות וחגים |
| `bookings` | הזמנות חדרים |
| `food` | מה מביאים לסעודות |
| `birthdays` | ימי הולדת |
| `notifications` | התראות |
| `userProfiles` | מיפוי uid → familyId |
| `roomLocks` | נעילת חדרים |

---

## עלות חודשית משוערת

| שירות | תוכנית חינמית (Spark) | Blaze (pay-as-you-go) |
|---|---|---|
| Hosting | 10GB/חודש | $0.026/GB |
| Firestore | 50K reads/יום | $0.06/100K |
| Functions | אין | $0.40/M קריאות |
| Auth | ∞ | חינמי |

**למשפחת שטיינברג: ~$0/חודש** (מתחת לסף החינמי)

---

## שאלות?

צור issue ב-GitHub או פנה למפתח 🙂
