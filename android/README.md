# WTRON Android

This Android project is a first-party WTRON launcher for the production web app at `https://wtron.org/app`.

It uses Android Custom Tabs instead of an embedded WebView, so authentication, QR/camera prompts,
copy/share and external TronScan navigation remain governed by the production web application and
the user's browser security model. No Supabase keys, wallet secrets, private keys, recovery phrases
or signing keys are stored in this Android project.

## Build

Install Android Studio or Android command-line tools with:

- JDK 17
- Android SDK platform 35
- Android build tools compatible with Android Gradle Plugin 8.6.1
- Gradle, or add a Gradle wrapper generated from a trusted local Gradle install

Debug build:

```bash
gradle -p android :app:assembleDebug
```

Unsigned release build:

```bash
gradle -p android :app:assembleRelease
```

Signed release builds require owner-controlled credentials in `android/local.properties` or
environment variables:

```properties
WTRON_RELEASE_STORE_FILE=C:\\secure\\wtron-release.jks
WTRON_RELEASE_STORE_PASSWORD=...
WTRON_RELEASE_KEY_ALIAS=...
WTRON_RELEASE_KEY_PASSWORD=...
```

Do not commit signing files, passwords, APKs or AABs. After signing, publish the APK and checksum to the website
download path:

```bash
npm run android:publish-apk -- android/app/build/outputs/apk/release/app-release.apk
```

This creates:

```text
public/downloads/wtron-android-release.apk
public/downloads/wtron-android-release.apk.sha256
```

Those files are intentionally ignored by Git and should be attached through the deployment/release
artifact process.
