const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// `inlineRem: 16` pins 1rem to 16px. React Native Reusables sizes components in
// rem (`--radius: 0.75rem`, `text-sm`), and without this NativeWind inlines its
// own default, so radii and type land a few pixels off the intended scale.
module.exports = withNativeWind(config, { input: './src/global.css', inlineRem: 16 });
