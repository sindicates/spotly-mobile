# Spotly

A `.edu`-verified mobile app for finding campus study spots at CWRU. Search in your own words; see live occupancy reported by other students.

This project uses a custom Expo dev client, not Expo Go.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env`. Do not give any other secret an `EXPO_PUBLIC_` prefix.

Then link EAS and install a development build on a device:

```bash
npx eas init
npx eas build --profile development --platform ios
```

Add `spotly://auth/callback` to the Supabase redirect allowlist. The app scheme is already `spotly`.

## Run

```bash
npm start
```

Open the project from the installed dev client. Other useful commands: `npm run typecheck`, `npm run doctor`.
