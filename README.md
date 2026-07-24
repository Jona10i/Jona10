&lt;div align="center"&gt; &lt;img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" /&gt; &lt;/div&gt;

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/69fa980b-d678-4f5b-98dd-870ae58b5455

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Copy [.env.example](.env.example) to `.env` and set `GEMINI_API_KEY` to your Gemini API key
3. Run the app: `npm run dev`

## Deploy security rules

Firestore and Storage security rules live in `firestore.rules` and
`storage.rules`, wired up in `firebase.json` (project alias in `.firebaserc`).
They only protect production data once deployed:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,storage
```

Until then the app relies on whatever rules the project currently has live.