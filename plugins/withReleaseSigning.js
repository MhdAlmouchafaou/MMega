// Signs release builds with the keystore given through environment variables (set in CI).
// Without them, the default Expo setup (debug keystore) is kept.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// mmega-release-signing';

const SNIPPET = `
${MARKER}
android {
    signingConfigs {
        mmegaRelease {
            def ks = System.getenv("MMEGA_KEYSTORE")
            if (ks) {
                storeFile file(ks)
                storePassword System.getenv("MMEGA_KEYSTORE_PASSWORD")
                keyAlias System.getenv("MMEGA_KEY_ALIAS")
                keyPassword System.getenv("MMEGA_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv("MMEGA_KEYSTORE")) {
                signingConfig signingConfigs.mmegaRelease
            }
        }
    }
}
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += SNIPPET;
    }
    return cfg;
  });
};
