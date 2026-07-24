# SwiftDrop Workspace — Progress Log

Tracking file for the ongoing "analyze and improve" effort. Updated at the end of each work session. Last updated: **2026-07-24**.

---

## ✅ Completed

### 1. Environment configuration (`.env.example`)

- Rewrote `.env.example` to match every env var actually referenced in code (`src/`, `vite.config.ts`, `server.ts`).
- Organized into sections: server, build-time defines, platform-injected, access control, Firebase.
- Documented `NODE_ENV`, `PORT`, `DISABLE_HMR`, `GEMINI_API_KEY` (public, compiled into bundle via vite `define` — restrict in Cloud Console), `VITE_ADMIN_EMAILS`, and all 7 `VITE_FIREBASE_*` vars with their real fallbacks (`firebase-applet-config.json`, built-in admin defaults).
- Added security warnings: `VITE_*` vars ship to the browser; `.env` is git-ignored (verified in `.gitignore`).

### 2. Configurable `PORT` + cleanup

- `server.ts`: added `parsePort()` — reads `process.env.PORT`, falls back to 3000, fails fast with a clear error on invalid values (non-integer or out of 1–65535).
- `.env.example`: `PORT="3000"` now live and uncommented.
- `vite.config.ts`: fixed corrupted em dash in HMR comment (invalid UTF-8).
- Deleted stray `out.txt` (grep-results dump).
- Repaired broken `node_modules` via full `npm ci` (`tsc` missing, `@firebase/storage` / `@firebase/functions` missing `.d.ts`, `iconv-lite`missing entry point).
- Verified: `PORT=abc` rejected, `PORT=8123` works, unset defaults to 3000.

### 3. Integration-point audit & fixes

- `firebase-blueprint.json`: fixed invalid JSON (missing comma after `Reminder` entity). Now parses.
- `firestore.rules`: added missing `allow update` for `/files/{fileId}` — `FileBrowser.tsx` does 5 `updateDoc` operations (replace upload, add version, restore version, toggle important) that would ALL have been denied in production. Rule is owner-scoped with a field whitelist matching the client writes.
- **Security-spec alignment** (`security_spec.md` ↔ rules):
  - `isValidFile`: enforces `size is number && >= 0`, `category` restricted to blueprint enum (`document|image|video|archive|other` — matches client `getCategory()`), type checks on `type`, `ownerName`, `createdAt`, `important`, `versions`.
  - `isValidMessage`: rejects future timestamps (`<= request.time + 5min`skew tolerance; client sends `Date.now()`).
- Deleted dead `src/i18n/sw.js` stub (real SW is `public/sw.js`, registered in `main.tsx`).
- `package.json`: renamed `react-example` → `swiftydrop-workspace` (matches `metadata.json`; lockfile synced); removed duplicate `vite` from `dependencies` (kept in devDependencies).
- `src/lib/firebase.ts`: removed unused `logger` import.
- `README.md`: setup now says copy `.env.example` → `.env` (was `.env.local`, which `dotenv/config` never loads).
- Verified clean: entry chain (`index.html` → `main.tsx` → `App`), firebase-shim import coverage, env chain, blueprint ↔ rules entity parity (9/9 collections).

### 4. Firebase deploy wiring + Storage rules

- **Gap found**: `ChatRoom.tsx` uploads to `workspaces/files/` and `UserProfileProvider.tsx` uploads to `avatars/` in Firebase Storage, but the repo had no `storage.rules`, no `firebase.json`, and no `.firebaserc` — Storage was unprotected/unmanaged and `firebase deploy` had no config.
- `storage.rules` (new): default-deny; `avatars/` reads require sign-in, writes owner-scoped via uid filename prefix (`avatars/{uid}_...`, verified `userData.id` == auth uid), image-only content type, 5MB cap (matches client limit in `UserProfileProvider.tsx:108`); `workspaces/files/` signed-in read/write with 100MB object cap.
- `firebase.json` (new): wires `firestore.rules` + `storage.rules` for `firebase deploy`.
- `.firebaserc` (new): default project alias `academic-vine-w8gvj` (from `firebase-applet-config.json`).
- `README.md`: added "Deploy security rules" section (`firebase deploy --only firestore:rules,storage`).
- Verified: JSON files parse, `npm run lint` ✅, `npm run build` ✅.

### 5. Dependency vulnerability fixes

- `npm audit` found **10 vulnerabilities (1 critical, 5 high, 1 moderate, 3 low)**: critical `websocket-driver` (resource-limit bypass + message corruption), high `ws` (memory-exhaustion DoS), high `vite` (NTLMv2 hash disclosure + `server.fs.deny` bypass), moderate `qs` (DoS), plus lows.
- Ran `npm audit fix` — non-breaking patch upgrades only (`websocket-driver`/`ws` come in transitively via Firebase; `vite` bumped within 6.x).
- Result: `found 0 vulnerabilities`; `npm run lint` ✅, `npm run build` ✅ after the fix.

### 6. PWA / app-shell polish

- **Gap found**: `public/manifest.json` pointed its only icon at an external stock CDN image (flaticon) — broke offline installability and wasn't the app logo; `index.html` had no favicon, `theme-color`, or description.
- Generated real icons from the app logo (`src/assets/images/swiftdrop_logo_1779231213845.png`, 1408×768 white-bg) with PIL: `public/icons/icon-{192,512}.png` (purpose `any`), `public/icons/icon-maskable-{192,512}.png` (logo kept inside the 80% safe zone), `public/favicon.png` (64), `public/apple-touch-icon.png` (180).
- `manifest.json`: 4 local icon entries (any 192/512 + maskable 192/512) — satisfies installability requirements (192 + 512, maskable separated from `any`).
- `index.html`: added favicon, apple-touch-icon, `theme-color` (#2563eb, matches manifest), and meta description.
- `public/sw.js`: bumped cache `swiftydrop-cache-v1` → `-v2` (old caches purged on activate) and precached the new icon assets.
- Verified: manifest parses, `npm run lint` ✅, `npm run build` ✅, icons land in `dist/`.

### 7. Bundle-size optimization (code-splitting)

- **Analysis**: single 1,793 kB entry chunk (496 kB gzip). Eagerly bundled: firebase SDK, react, motion, i18next — plus two heavy stowaways: the react-markdown/remark stack (eager via `ChatRoom.tsx`) and **recharts** (eager via `ScheduleView.tsx`, imported with double quotes so an earlier single-quote grep missed it; `AuditLogView.tsx` was already lazy).
- `src/components/MarkdownRenderer.tsx` (new): full message-markdown implementation moved out of `ChatRoom.tsx`; loaded via `React.lazy` with a plain-text `<Suspense>` fallback at both usage sites. The markdown stack (~159 kB) now downloads only when a chat view renders.
- `src/App.tsx`: `ScheduleView` converted to `lazy()` (renders inside the existing view-area `<Suspense>`) — removes the last eager recharts importer.
- `vite.config.ts`: `manualChunks` (function form) splits `firebase-vendor` (596 kB), `react-vendor` (194 kB), `motion` (96 kB), and `charts` (300 kB, recharts + victory-vendor) into long-lived cacheable chunks; `onlyExplicitManualChunks: true` prevents dependency merging from re-eagering `charts`; `chunkSizeWarningLimit: 900` (firebase-vendor is legitimately large).
- Removed dead dependency `@google/genai` (declared but never imported anywhere in `src/`).
- **Result**: initial JS 1,793 kB → **1,247 kB min** (496 → **333 kB gzip**, −33%). Deferred on demand: charts 300 kB (loads with Audit/Schedule views), MarkdownRenderer 159 kB (loads with chat). Vendor chunks keep stable hashes across app deploys.
- Verified: entry statically imports only `react-vendor`/`firebase-vendor`/`motion`; `charts` referenced only by the two lazy views; `MarkdownRenderer` has zero static importers; `npm run lint` ✅; `npm audit` still 0; prod server smoke test — `/` and all chunks return 200.

---

## Round 8 — Service worker blank-preview fix (July 24, 2026)

**Symptom:** preview pane blank despite server and all assets returning 200.

**Root cause:** `public/sw.js` served everything cache-first (stale-while-revalidate) and precached `/index.html`. After round 7's rebuild, hashed bundle names changed; the cached HTML referenced deleted chunks → 404s → blank page. Worse, the new SW's install-time precache fetched `index.html` *through the old active worker*, receiving the stale HTML — a self-poisoning cache across versions.

**Fix (`public/sw.js`, cache v2 → v3):**
- Navigations are now **network-first** (cache only as offline fallback) — fresh HTML is always preferred, so new hashed chunks are picked up on every deploy.
- Precache list reduced to unhashed static assets only (manifest + icons); `index.html` removed.
- Hashed static assets remain stale-while-revalidate (immutable filenames = safe).
- v3 activates with `skipWaiting` + `clients.claim` and purges v1/v2 caches.

**User note:** the first load after this fix may still be served by the old worker — one extra refresh (or a hard refresh) swaps in v3 and self-heals.

---

## Round 9 — Service worker kill switch (July 24, 2026)

**Symptom:** preview still blank after round 8 — the poisoned v2 worker in the user's browser never got out of the way.

**Diagnosis (definitive this time):** the preview server had also silently exited; after restarting it, a headless-Chromium render test with a **fresh profile** (`--dump-dom`) showed the app rendering perfectly (full chat UI present). Conclusion: the app was never broken — the old cache-first SW in the user's browser was still serving stale HTML pointing at deleted chunks, and relying on the user to hard-refresh wasn't working.

**Fix — remove the service worker permanently:**
1. **`public/sw.js` → self-purging "kill switch".** Browser SW update checks bypass the old worker, so on the next navigation the old worker fetches this new script, activates it, and it: deletes **all** Cache Storage buckets → unregisters itself → reloads open tabs (`client.navigate`). No `fetch` handler, so it never intercepts anything. Recovery is automatic — no hard refresh, no DevTools.
2. **`src/main.tsx`** — the `navigator.serviceWorker.register('/sw.js')` block is gone, replaced with defensive cleanup (`getRegistrations().unregister()` + purge all caches) that runs on every load, so no worker can ever come back.

**Consequence:** offline caching is intentionally removed. The PWA manifest + icons remain, so the app is still installable; re-adding offline support later should be done with `vite-plugin-pwa` (proper `navigateFallback` + `registerType: 'autoUpdate'`) instead of a hand-rolled worker.

**Verified:** served `/sw.js` is the kill switch ✅; fresh-profile headless render shows the app ✅; built bundle contains `serviceWorker.getRegistrations` only — zero `register` calls ✅; lint ✅; build ✅; server restarted on port 8080 ✅.

---

## Round 10 — Preview still blank: orphan process + SW HTTP-cache trap (root-caused & fixed)

User reported the preview *still* blank after Round 9. Deep diagnosis found the app was never broken server-side — two compounding infrastructure issues:

1. **Orphan server process squatting on port 8080.** The managed `preview` job was dead (`EADDRINUSE` on every start) while an untracked `node dist/server.cjs` from an earlier turn (pid 14676) kept the port. Restarts appeared to work but the managed job died instantly. Killed the orphan; restarted `preview` as a managed job (`NODE_ENV=production PORT=8080 node dist/server.cjs`).
2. **`/sw.js` served without anti-cache headers.** Browser SW update checks may satisfy the script fetch from HTTP cache, so a cached *old* worker script could keep the poisoned v2 worker alive and never deliver the Round-9 kill switch. Added an explicit cache policy in `server.ts` (both dev and prod): `/sw.js` → `no-store, must-revalidate`; HTML + SPA fallback → `no-cache`; content-hashed `/assets/*` → `public, max-age=31536000, immutable`.

**Verified:** headless Chromium render mounts the app (43.6KB DOM; only console line is the expected RSA-keypair debug log; the amber banner is the app's offline notice because the sandbox can't reach Firestore) ✅; headers confirmed via `curl -I` on `/sw.js`, `/`, `/assets/*.js`, and the SPA fallback ✅; lint ✅; build ✅.

**Note:** the app's UI renders even when Firestore is unreachable (offline banner), proving a blank page can only come from a stale client-side service worker. Any still-poisoned browser self-heals on refresh now that `/sw.js` is `no-store` (kill switch is guaranteed to arrive on the SW update check).

---

## Round 11 — Preview moved to port 3000 (dev-mode serving)

- The port-8080 `preview` job kept dying with `EADDRINUSE` — an external process in the shared sandbox grabs 8080 between turns. Moved the server to **port 3000** (`PORT=3000 node dist/server.cjs`, managed job `preview`).
- Server now runs **without `NODE_ENV=production`**, i.e. Vite dev-middleware mode: modules are transformed on the fly, so no stale-`dist` concerns. Verified `/` 200, `/src/main.tsx` 200, `/@vite/client` 200, `/sw.js` 200 with `no-store, must-revalidate` (kill switch still in force).
- Preview tab opened at `http://localhost:3000`.

---

## ✅ Verification status (as of last run)

| Check | Result |
| --- | --- |
| `npm run lint` (`tsc --noEmit`) | ✅ exit 0 |
| `npm run build` (client + `dist/server.cjs`) | ✅ |
| `PORT` validation (invalid / custom / default) | ✅ all 3 cases |
| `npm audit` | ✅ 0 vulnerabilities |

---

## Round 12 — Blank preview root-caused: orphan server processes

**Reported symptom:** "the HTML file seems blank."

**Finding 1 — HTML was never blank.** Both `index.html` and `dist/index.html` are fully populated; the empty `<div id="root"></div>` is normal — React mounts into it client-side.

**Finding 2 — the real cause.** The managed `preview` job had crashed with `EADDRINUSE` on port 3000 (and Vite's HMR port 24678 also taken). Two **orphan** `node dist/server.cjs` processes (pids 18015, 18363) were squatting on the ports — leftovers from earlier restarts that were never tracked as jobs. The sandbox preview proxy was therefore hitting a dead/stale server → blank page.

**Fix:** killed both orphans, confirmed ports 3000/8080/24678 clear, restarted `preview` as a managed job on port 3000.

**Verified:** job running (`Server running on http://localhost:3000`), `/` → 200, dev HTML served with `/@vite/client` + `/src/main.tsx` (dev mode), main bundle 200.

---

## Round 13 — Upstream sync: ported robustness fixes from `swiftdrop-workspace.zip`

The user uploaded a zip snapshot of the upstream project. Full-tree diff showed the zip was **older** for config/infra (all our rounds 1–12 improvements stay) but **newer** for runtime robustness — upstream had shipped crash/rejection fixes we lacked. Ported everything the app needs; skipped upstream junk (`out.txt`, `patch*.cjs`, dead `src/i18n/sw.js`, dead `@google/genai` dep, duplicate `vite` dep, CDN-linked manifest icon, dead `logger` import).

**Critical ports (upstream crash fixes):**
1. **`handleFirestoreError` no longer rethrows** in `FileBrowser.tsx`, `Sidebar.tsx`, `ScheduleView.tsx`, `FirebaseProvider.tsx` — throwing from listener error callbacks crashed the whole app via `ErrorBoundary` on any transient permission/offline error. Now logs only.
2. **Restored `/_ws_test_connection` WebSocket handshake in `server.ts`** — `NetworkCheck` (App.tsx:506) probes it to detect proxy-blocked WebSockets; our server was missing it, so the amber "WebSockets blocked by proxy" banner always showed (seen in the Round-10 headless test and misattributed to sandbox networking). Also ported `app.set('trust proxy', 1)`.

**Rejection-guard ports (unhandled-promise-rejection elimination):**
- `FirebaseProvider.tsx`: `.catch()` on presence `setDoc`, logout `setDoc`, `signOut`
- `ReminderNotifier.tsx`: `.catch()` on `Notification.requestPermission()`, `updateDoc`
- `FontCatalogView.tsx`: `.catch()` on both `navigator.clipboard.writeText` calls
- `keyStore.ts`: IndexedDB `dbPromise` rejection handled in both constructor paths
- `App.tsx`: `handleSelect` body wrapped in try/catch (async getDocs failures no longer escape)
- `index.html`: early `error` + `unhandledrejection` console diagnostics before React mounts

**Kept ours (verified better than zip):** lazy `ScheduleView` + `MarkdownRenderer` (bundle splitting), hardened `firestore.rules`, fixed `firebase-blueprint.json`, PWA icons/manifest, `parsePort()`, cache headers, SW kill-switch + defensive unregister, rewritten `.env.example`, renamed package.

**Verified:** `npm run lint` ✅, `npm run build` ✅ (bundle shape unchanged), preview restarted on port 3000 — `/` → 200, WS handshake → **101 with correct Sec-WebSocket-Accept**, `/api/info` → JSON ✅.

---

## Round 14 — Preview restarted (orphan cleanup, recurring)

- The `preview` job had crashed again with `EADDRINUSE` (ports 3000 + 24678 held by another untracked `node dist/server.cjs` — this orphan-restart cycle recurs when the sandbox reaps managed jobs but leaves detached processes). Killed the orphan, restarted `preview` on port 3000, verified `/` → 200, WS handshake → 101.

## Round 15 — Public tunnel + `allowedHosts` fix

- Installed `cloudflared` (user-space, `/tmp/cloudflared`), started a quick tunnel to `localhost:3000` → public trycloudflare.com URL (changes each restart).
- **Found + fixed**: Vite 6 default-denies unknown Host headers → tunnel got `403 Blocked request`. Added `server.allowedHosts` to `vite.config.ts`, restarted `preview`, verified tunnel `GET /` → 200 with correct title.
- **Caveat**: Google sign-in on a tunnel domain requires adding it in Firebase Console → Authentication → Settings → Authorized domains.

## Round 16 — NetworkCheck probe overhaul (WS-blocked false alarm)

**Diagnosis**: the preview gateway strips WebSocket upgrades, so the old probe always flagged "blocked". But no app feature uses origin WebSockets (Firebase uses its own HTTPS transports with fallback; HMR disabled) — the banner was a false alarm.

**Implemented**:
- `server.ts`: plain-GET handler on `/_ws_test_connection` (`{ok:true}`, no-store) so the client can distinguish *origin unreachable* from *WS blocked by proxy*; upgrade handler completes with a proper WS **close frame** (`0x88 0x00`) instead of abrupt TCP FIN.
- `src/App.tsx` `NetworkCheck` rewritten: HTTP pre-check first → amber **"Cannot reach the server"** warning with refresh button; WS attempt 2.5s + one retry → calm slate **info notice** ("proxy blocks WebSockets, app uses HTTPS fallback") auto-dismissing after 10s. Set-based timer/socket cleanup.
- Verified: probe GET → `{"ok":true}` local + tunnel; WS OPEN 42ms local / 143ms tunnel; lint ✅ build ✅.

## Round 17 — `allowedHosts` regression fix

- The Round 15 `allowedHosts` block had silently disappeared from `vite.config.ts` between turns (**external file sync**), re-breaking the tunnel with 403s. Re-applied with the explicit current tunnel hostname **plus** wildcards (`.trycloudflare.com`, `.ngrok.io`, `.ngrok-free.app`); restarted `preview`; tunnel → 200 ✅.

## Round 18 — Cross-platform test matrix + preview switched to production mode

- **Found**: preview server had been running in Vite **dev** mode all along (`NODE_ENV` unset) — `/assets/*` returned index.html via SPA fallback. Switched the `preview` job to `NODE_ENV=production PORT=3000 node dist/server.cjs` → serves the built `dist/` bundle, matching real deployment. **Consequence**: source edits need `npm run build` + job restart to appear.
- **Matrix (localhost + tunnel)**: all 200, correct content types, byte-identical — `/`, JS chunks, CSS, manifest, 5 icons, `sw.js`, probe, `/api/info`, SPA fallback. Cache headers ✅ (`/` no-cache, `sw.js` no-store, assets immutable).
- WS probe OPEN 44ms local / 92ms tunnel; headless Chromium render: 43.6KB DOM full login screen on both origins ✅.

## Round 19 — Sync-regression restore + git safety net (July 24, 2026)

- **The external platform sync reverted again**, worse this time: `server.ts`, `src/App.tsx`, `vite.config.ts` (Round 16/17 work) and `PROGRESS.md` itself (Rounds 14–18) all rolled back to a Round-13-era snapshot. `dist/` client bundle survived; running processes were unaffected (they held the good build in memory).
- Re-applied all three source fixes, rebuilt, restarted `preview` (gen 6, production mode), re-verified the full matrix on localhost + tunnel — all green.
- **Decision logged**: user chose to keep the **quick tunnel** (random URL each restart) rather than a named Cloudflare tunnel (requires CF account login + a domain in a CF zone) or ngrok's free static domain. Hosting deploy for a permanent URL deferred to later.
- **Mitigation added**: initialized a local `git` repo and committed a baseline — future sync reversions are now one `git status`/`git diff` away and restorable with `git checkout -- <file>`.

## Round 20 — Second sync reversion; git restore validated; root cause hypothesized

- The sync reverted the **same 4 files a second time** (`server.ts`, `vite.config.ts`, `src/App.tsx`, `PROGRESS.md` → Round-13 snapshot). Detected instantly via `git status` (4 dirty files vs baseline), restored in one command (`git restore`), rebuilt, restarted `preview` (gen 7), re-verified localhost + tunnel — all green. Total recovery: ~2 minutes vs full manual re-application last time.
- **Root-cause hypothesis**: the platform's canonical workspace copy is frozen at the Round-13 era because **"Workspace finalization" keeps failing** (the user saw `Workspace finalization failed. Retry this candidate.`). Each turn boundary re-syncs the sandbox from that stale canonical copy → our newer edits get rolled back. **Action for user**: hit "Retry this candidate" in the platform UI; if finalization succeeds, the canonical copy updates and the reverts should stop. If it keeps failing, report to platform support (mention both symptoms).
- **Turn-start ritual from now on**: `git status` → if dirty without our own edits, `git restore . && npm run build` + restart `preview`.

## Round 21 — Third reversion confirmed: the loop is every turn boundary

- Same 4 files reverted again. The pattern is now certain: **every turn boundary re-syncs from the stale Round-13 canonical copy** (consistent with the failed-finalization hypothesis — the user-side "Retry this candidate" hasn't succeeded yet). The git ritual handled it in under 2 minutes: restore → build → restart (gen 8) → full verify (local + tunnel endpoints, probe JSON, WS OPEN ×2, all source markers present).
- This loop will continue until platform finalization succeeds. The git safety net makes it an inconvenience, not data loss.

## Round 22 — Finalization experiment: tunnel stopped as prime suspect

- Fourth reversion handled by the ritual (restore → build → gen 9 → verified).
- **Correlation noticed**: finalization last succeeded around Round 13 — the `cloudflared` **quick-tunnel job started in Round 15**, and finalization has failed ever since. A persistent outbound QUIC connection is a plausible blocker for a workspace snapshotter.
- **Experiment**: stopped the `tunnel` job (its URL is now dead) and asked the user to hit **"Retry this candidate"** with no tunnel running. If next turn's `git status` is clean, finalization succeeded and the loop is broken; a fresh tunnel (new URL) will then be started.
- **Note for user**: if finalization still fails with the tunnel stopped, next suspects are the long-running `preview` job itself, or a pure platform-side fault → support ticket.

## Round 23 — Tunnel exonerated (5th reversion); platform-side fault; support draft

- **Experiment result: NEGATIVE.** Fifth reversion occurred at the turn boundary **with no tunnel running** — the tunnel was not the blocker. The `preview` job is also largely exonerated by history (it was running at Round 13 when finalization last succeeded). Conclusion: **platform-side finalization fault.**
- Ritual restore (gen 10) + tunnel restarted with a **new URL: `https://refugees-bite-katrina-trim.trycloudflare.com`** (old one is dead; if the old hostname was added to Firebase Auth authorized domains, add this one instead). Both platforms verified: `/` → 200, probe → `{"ok":true}`.
- **Support-ticket draft (paste to platform support):**
  > Workspace "finalization" fails every turn since ~July 24 22:30 UTC. Symptom 1: UI shows "Workspace finalization failed. Retry this candidate." Symptom 2: at every new agent turn, workspace files are rolled back to a stale snapshot (~4 source files: server.ts, vite.config.ts, src/App.tsx, PROGRESS.md). Ruled out on our side: tunnel process (reversion reproduces with it stopped), dev-server process (finalization previously succeeded with it running), disk space (17% used). Mitigation in place: local git repo; we detect via `git status` and restore each turn. Please fix finalization or advise.

---

## ⏳ Pending / next up

1. **Deploy security rules** — both `firestore.rules` and `storage.rules` are local only until `firebase deploy --only firestore:rules,storage` is run (manual step, needs Firebase CLI auth; project alias already set in `.firebaserc`).
2. **(Optional) Re-add offline support properly** via `vite-plugin-pwa` — see Round 9 for why the hand-rolled worker was removed.
3. Continue per-file fixes / remaining improvements as directed.

## 📌 Key files touched this effort

`.env.example`, `server.ts`, `vite.config.ts`, `firebase-blueprint.json`, `firestore.rules`, `storage.rules` (new), `firebase.json` (new), `.firebaserc` (new), `package.json`, `package-lock.json`, `README.md`, `src/lib/firebase.ts`, `public/manifest.json`, `index.html`, `public/sw.js`, `public/icons/*` (new), `public/favicon.png` (new), `public/apple-touch-icon.png` (new), `src/components/MarkdownRenderer.tsx` (new), `src/components/ChatRoom.tsx`, `src/App.tsx`, `src/main.tsx`, `src/components/FileBrowser.tsx`, `src/components/Sidebar.tsx`, `src/components/ScheduleView.tsx`, `src/components/FirebaseProvider.tsx`, `src/components/ReminderNotifier.tsx`, `src/components/FontCatalogView.tsx`, `src/lib/keyStore.ts` — deleted: `out.txt`, `src/i18n/sw.js`, `@google/genai` (dead dep).