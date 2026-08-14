// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions is Deno, not React Native. `Deno` is a global there and
    // `npm:` / `.ts` imports are how its resolver works — the Expo config reports
    // all of it as errors. tsconfig excludes the same folder, for the same reason.
    ignores: ["dist/*", "supabase/functions/*"],
  }
]);
