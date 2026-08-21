/**
 * Extends app.json at evaluate time. The Maps SDK key has to be a real string
 * in AndroidManifest — putting `process.env.FOO` in app.json bakes the literal
 * into the binary and the map still crashes.
 */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    [
      'react-native-maps',
      {
        // Temporary — remove before committing. Native manifest only.
        androidGoogleMapsApiKey: 'AIzaSyDwHcMtn9KkJ09tC0vtiafDThTQfGF8wNg',
      },
    ],
  ],
});
