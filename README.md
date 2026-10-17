# Fleet Checkpoint

Daily vehicle & equipment defect tracking for warehouse operations.  
Cloud database: **Google Firebase Firestore** — real-time sync across all devices.

---

## 📂 Files
```
index.html   — HTML structure
styles.css   — All styling (light + dark mode)
app.js       — App logic + Firebase Firestore integration
README.md
```

---

## 🚀 Setup (one-time, ~10 minutes)

### Step 1 — Create a Firebase project
1. Go to [console.firebase.google.com](https://console.firebase.google.com/)
2. Click **Add project** → name it (e.g. `fleet-checkpoint`) → Continue
3. Disable Google Analytics if you don't need it → Create project

### Step 2 — Create Firestore database
1. In your project, click **Firestore Database** in the left menu
2. Click **Create database**
3. Choose **Production mode** → select the nearest region → Enable

### Step 3 — Set Firestore security rules
1. In Firestore → click the **Rules** tab
2. Replace the existing rules with:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
3. Click **Publish**

> ⚠️ These open rules are fine for internal warehouse use on a private URL.
> For production, see the **Security** section below.

### Step 4 — Get your Firebase config
1. In Firebase Console → click the **gear icon ⚙️** → **Project settings**
2. Scroll to **Your apps** → click the **Web icon (</>)**
3. Register the app (any nickname) → copy the `firebaseConfig` object shown

### Step 5 — Add config to app.js
Open `app.js` and replace the `FIREBASE_CONFIG` block at the top:

```js
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSy...",       // ← paste your values here
  authDomain:        "your-project.firebaseapp.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};
```

Save the file. The app is now connected to your cloud database.

---

## 🌐 Deploy on GitHub Pages
1. Create a new GitHub repository (can be private)
2. Upload `index.html`, `styles.css`, `app.js`
3. Go to **Settings → Pages → Source** → select branch `main`, folder `/root`
4. Your URL: `https://yourusername.github.io/your-repo-name/`

## 🌐 Deploy on Netlify (even simpler)
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag and drop the folder → instant live URL

## 🌐 Deploy on Vercel
1. Push to GitHub
2. Import the repo in [vercel.com](https://vercel.com) → Deploy

---

## 🔒 Security (production hardening)

### Option A — Restrict by domain (quick)
In Firebase Console → **Project Settings → API restrictions**,  
restrict the API key to your deployed domain only (e.g. `yoursite.github.io`).

### Option B — Firebase Authentication (recommended)
1. Enable Firebase Auth (Email/Password) in the console
2. Add the Firebase Auth SDK to `index.html`
3. Wrap Firestore rules to require login:
```
allow read, write: if request.auth != null;
```
4. Add a login screen to `app.js` before the checker name modal

---

## 📊 Data structure (Firestore collections)
| Collection    | Fields |
|---------------|--------|
| `vehicles`    | name, type |
| `operators`   | name, photo (base64), addedAt |
| `checkpoints` | vehicleId, vehicleName, vehicleType, date, time, checkerName, driverName, operatorId, overallStatus, defectCount, items, reportedAt |
| `defects`     | vehicleId, vehicleName, checkpointId, driverName, item, severity, notes, status, reportedAt, reportedBy, resolvedAt, resolvedBy |

---

## 📦 Dependencies (CDN, no install needed)
- Firebase App + Firestore Compat SDK v10 — `gstatic.com/firebasejs`
- SheetJS v0.18.5 — Excel export — `cdnjs.cloudflare.com`
