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
npm run doctor
```

## Docs

| Need | Read |
| --- | --- |
| What Spotly is / feature list | [`docs/PRODUCT.md`](docs/PRODUCT.md) |
| Tech stack | [`docs/TECH_STACK.md`](docs/TECH_STACK.md) |
| Project folder structure | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| A specific feature | [`docs/features/`](docs/features/) |
