# WTRON Android

This Android project is a first-party WTRON launcher for the production web app at `https://wtron.org/app`.

It uses an in-app WebView shell, so WTRON opens without browser chrome while authentication,
QR/camera prompts, copy/share and external TronScan navigation remain governed by the production
web application and Android's platform permissions. No Supabase keys, wallet secrets, private keys,
recovery phrases or signing keys are stored in this Android project.

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

## GitHub release build

The `Android Release` workflow can build the APK from a clean runner. For a signed release, configure
these repository secrets:

- `WTRON_RELEASE_STORE_BASE64`
- `WTRON_RELEASE_STORE_PASSWORD`
- `WTRON_RELEASE_KEY_ALIAS`
- `WTRON_RELEASE_KEY_PASSWORD`

The workflow uploads `wtron-android-release.apk` and `wtron-android-release.apk.sha256` as build
artifacts for every successful build. Unsigned builds are labeled `wtron-android-unsigned-test`.
When all signing secrets are present, the workflow labels the artifact `wtron-android-signed-release`,
publishes a non-draft GitHub Release and marks it as latest. The website's stable `/downloads/...`
URLs redirect to the latest GitHub Release assets, so failed workflow runs do not replace the last
valid signed APK.
