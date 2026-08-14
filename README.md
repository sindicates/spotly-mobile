# Spotly

Spotly is a mobile app for finding study spots on the CWRU campus.

Students search the way they'd say it out loud ("place to lock in," "good wifi and no small talk") and get spots whose **reviews** actually read that way.

Each spot shows live **occupancy** reported by someone in the last hour.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`, then install a development build. Build locally when you can. EAS is already configured if you need a cloud build.

Local iOS builds require a Mac with Xcode. If you do not have a Mac, use EAS cloud builds instead. Local Android builds need Android Studio.

For anything React Native after the first install, use `npx expo install` instead of `npm install` so versions stay SDK-57-compatible.

NativeWind 4 requires Tailwind 3.x. Do not install `tailwindcss@latest`. That pulls v4 and styles stop applying even though the bundle still builds.

### Local builds (preferred)

```bash
npx expo run:ios
npx expo run:android
```

These compile on your machine, install the dev client, and start Metro. Pass `--device` to pick a connected phone.

Rerun one of these after pulling a change that adds a native module — `react-native-mmkv` is one, so a dev client built before it landed will crash on launch rather than fail gracefully. A JS-only change needs nothing but Metro.

### EAS cloud builds

Use this when you cannot build locally (no Mac, or no native toolchain set up).

```bash
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
```

Install the finished build from the EAS dashboard, then start Metro with `npm start` and open the project in the installed client.

## Run

If you used `npx expo run:ios` or `npx expo run:android`, Metro is already running. Otherwise:

```bash
npm start
```

Open the project from the installed dev client.

```bash
npm run typecheck
npm run lint
npm run doctor
```

## Database

Schema lives in `supabase/migrations/`. Never edit the hosted schema by hand — local and remote drift the moment you do.

```bash
npm run db:reset      # rebuild the local database and load supabase/seed.sql
npm run gen:types     # regenerate src/lib/database.types.ts from the linked project
```

After writing a migration: apply it locally, regenerate types, then `npx supabase db push` to send it up. `gen:types` needs the project linked and a `supabase login`, and `db:reset` needs Docker running.

`src/lib/database.types.ts` is generated output. Editing it by hand works right up until the next regeneration silently reverts you.

Seed data is local only — `db push` applies migrations, not `seed.sql`.

## Docs

| Need | Read |
| --- | --- |
| What Spotly is / feature list | [`docs/PRODUCT.md`](docs/PRODUCT.md) |
| Tech stack | [`docs/TECH_STACK.md`](docs/TECH_STACK.md) |
| Project folder structure | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| A specific feature | [`docs/features/`](docs/features/) |
