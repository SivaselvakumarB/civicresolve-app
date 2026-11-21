# CivicResolve

CivicResolve is a deployable civic issue reporting and municipal triage prototype built with React, Node.js (Express), Firebase Google Sign-In, Cloud Firestore, and live server-side Gemini triage.

## Features

- **Citizen Issue Submission**: Signed-in citizens submit a title, description, location, category (or **Auto-detect**), and an optional compressed photo. Each report saves to Firestore with a tracking ID (`CR-YYYY-XXXXXX`) and status `Reported`.
- **Server-Side Live Gemini Triage**: `POST /api/triage` calls live Gemini (`gemini-4-hydrogen`) once per report using server-only `GEMINI_API_KEY`. Returned `category`, `urgency`, and `reason` are validated strictly against fixed allowlists, mapped deterministically to a municipal department, and shown as an advisory recommendation. If Gemini is unavailable or fails validation, the ticket still saves as `Reported` with triage marked **Pending review**.
- **Owner-Scoped My Reports & Status Timeline**: Citizens view only their own reports (`where('ownerId', '==', uid)` enforced by Firestore Security Rules) along with a chronological `Reported -> In Progress -> Resolved` timeline.
- **Admin Triage Queue (`admins/{uid}` Allowlist)**: Console-managed admins in `/admins/{uid}` review all tickets and advance statuses strictly linearly (`Reported -> In Progress -> Resolved`) with a required resolution note (`>= 10` characters).

## Fixed Municipal Category-to-Department Map

| Category | Fixed Municipal Department |
| --- | --- |
| Road & Sidewalk | Department of Transportation & Streets |
| Streetlight & Electrical | Public Lighting & Electrical Services |
| Water & Drainage | Water & Sewer Authority |
| Sanitation & Waste | Department of Sanitation |
| Parks & Trees | Parks & Urban Forestry |
| Public Safety & Signage | Civic Traffic & Safety Bureau |

## Local Setup & Commands

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
   Set `GEMINI_API_KEY` in `.env` (never commit `.env` or expose `GEMINI_API_KEY` to the browser).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run development server (Express API + Vite on port 3000):
   ```bash
   npm run dev
   ```
4. Run focused tests (domain validation, server Gemini triage & fallback, Firestore rule invariants):
   ```bash
   npm test
   ```
5. Run production build & start:
   ```bash
   npm run build
   npm start
   ```

## Granting Admin Access in Firebase Console

Admin access is controlled strictly by a console-managed Firestore allowlist at `admins/{uid}` (client writes and `list` queries on `/admins` are denied by `firestore.rules`).

1. Sign in to CivicResolve with your Google account and open the **Admin Queue** tab.
2. Copy your displayed **Firebase Auth UID** (or find it in **Firebase Console -> Build -> Authentication -> Users**).
3. Open **Firebase Console -> Build -> Firestore Database**.
4. Select database **`ai-studio-0c62eeb8-2961-408a-af9d-9938b537e9d9`** inside project **`kingly-medley-v5gvv`**.
5. Click **Start collection** (or open existing) and enter Collection ID: `admins`.
6. Set **Document ID** to your exact Firebase Auth UID (paste the UID, do not use Auto-ID).
7. Add descriptive fields (for example `role: "admin"`, `email: "<your-google-email>"`) and click **Save**.
8. Return to CivicResolve's **Admin Queue** tab and click **Re-check Admin Access**.

## Cloud Run Publishing

CivicResolve includes a multi-stage `Dockerfile`, `.dockerignore`, and a `PORT`-aware production Express server (`npm start` runs `NODE_ENV=production node server.ts` serving the built `dist/` bundle and `/api/*`).

```bash
gcloud run deploy civicresolve \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
```

After deploying, add your Cloud Run hostname to **Firebase Console -> Authentication -> Settings -> Authorized domains** so Firebase Google Sign-In popups work on the live URL.

## Judge Walkthrough (PromptWars)

1. **Sign In**: Open the app and click **Sign in with Google**.
2. **Submit with Auto-detect & Optional Photo**: Enter a title, street location, description, keep **Auto-detect** selected, optionally attach a photo, and click **Submit Report**.
3. **Verify Live Triage Recommendation**: Confirm the ticket confirmation displays a unique `CR-YYYY-XXXXXX` ID, status `Reported`, validated Category, fixed Municipal Department recommendation, Urgency, and Rationale (or `Pending review` if `GEMINI_API_KEY` is unset/unavailable).
4. **Check Citizen Privacy & Timeline**: Click **View in My Reports**. Verify only the signed-in citizen's tickets appear and inspect the initial `Reported` timeline entry.
5. **Verify Admin Boundary**: Click **Admin Queue** before allowlisting. Confirm access is denied and your exact UID + Console instructions are shown.
6. **Grant Admin & Resolve Ticket**: Add `admins/{uid}` in Firebase Console, click **Re-check Admin Access**, select the ticket, click **Move to In Progress**, verify **Mark as Resolved** requires a resolution note (`>= 10` characters), enter a resolution note, and click **Mark as Resolved**.
7. **Confirm Timeline Sync**: Return to **My Reports** and verify the full `Reported -> In Progress -> Resolved` timeline with timestamps and the saved resolution note.
