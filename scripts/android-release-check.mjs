import { existsSync, readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const isWindows = process.platform === "win32";
const apkPath = "public/downloads/wtron-android-release.apk";
const checksumPath = `${apkPath}.sha256`;
const buildGradlePath = "android/app/build.gradle";
const releaseConstantsPath = "src/lib/app-release.ts";
const localPropertiesPath = "android/local.properties";

const requiredEnv = [
  "WTRON_RELEASE_STORE_FILE",
  "WTRON_RELEASE_STORE_PASSWORD",
  "WTRON_RELEASE_KEY_ALIAS",
  "WTRON_RELEASE_KEY_PASSWORD",
];

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
}

function commandExists(command) {
  const lookup = isWindows ? "where.exe" : "command";
  const args = isWindows ? [command] : ["-v", command];
  const result = spawnSync(lookup, args, { encoding: "utf8", shell: !isWindows });
  return result.status === 0;
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function findPackageScript(command) {
  if (existsSync("gradlew.bat")) return "gradlew.bat";
  if (existsSync("gradlew")) return "./gradlew";
  return commandExists(command) ? command : null;
}

function loadLocalProperties() {
  if (!existsSync(localPropertiesPath)) return new Map();
  const props = new Map();
  for (const line of readText(localPropertiesPath).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 1) continue;
    props.set(trimmed.slice(0, equals).trim(), trimmed.slice(equals + 1).trim());
  }
  return props;
}

function signingKeyPresent(key, localProperties) {
  return Boolean(process.env[key] || localProperties.get(key));
}

function checkVersionConsistency() {
  const gradle = readText(buildGradlePath);
  const constants = readText(releaseConstantsPath);
  const gradleVersionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
  const gradleVersionCode = gradle.match(/versionCode\s+(\d+)/)?.[1];
  const tsVersionName = constants.match(/WTRON_ANDROID_VERSION\s*=\s*"([^"]+)"/)?.[1];
  const tsVersionCode = constants.match(/WTRON_ANDROID_VERSION_CODE\s*=\s*(\d+)/)?.[1];
  const ok = gradleVersionName === tsVersionName && gradleVersionCode === tsVersionCode;
  record(
    "version metadata",
    ok,
    ok
      ? `${gradleVersionName} (${gradleVersionCode})`
      : `Gradle ${gradleVersionName}/${gradleVersionCode}, web ${tsVersionName}/${tsVersionCode}`,
  );
}

function checkArtifact(path, label) {
  record(label, existsSync(path), existsSync(path) ? path : `${path} not present`);
}

async function main() {
  const pathEntries = (process.env.PATH || "").split(delimiter).filter(Boolean).length;
  const localProperties = loadLocalProperties();
  const gradleCommand = findPackageScript("gradle");

  record("PATH", pathEntries > 0, `${pathEntries} entries`);
  record("JDK", commandExists("java"), commandExists("java") ? "java found" : "java not found");
  record(
    "Android SDK",
    Boolean(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT),
    process.env.ANDROID_HOME ||
      process.env.ANDROID_SDK_ROOT ||
      "ANDROID_HOME/ANDROID_SDK_ROOT not set",
  );
  record("Gradle", Boolean(gradleCommand), gradleCommand || "gradle/gradlew not found");

  for (const key of requiredEnv) {
    record(`signing ${key}`, signingKeyPresent(key, localProperties), "value presence only");
  }

  checkVersionConsistency();
  checkArtifact(apkPath, "release APK");
  checkArtifact(checksumPath, "release checksum");

  if (existsSync(apkPath) && existsSync(checksumPath)) {
    try {
      await access(apkPath);
      await access(checksumPath);
      record("download artifacts", true, "APK and checksum are readable");
    } catch {
      record("download artifacts", false, "APK or checksum is not readable");
    }
  }

  for (const result of results) {
    const mark = result.ok ? "OK" : "MISSING";
    console.log(`${mark} ${result.name}: ${result.detail}`);
  }

  const required = results.filter(
    (result) =>
      ["JDK", "Android SDK", "Gradle", "version metadata"].includes(result.name) ||
      result.name.startsWith("signing "),
  );

  if (required.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

void main();
