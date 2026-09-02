import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";

const destination = "public/downloads/wtron-android-release.apk";
const checksumDestination = `${destination}.sha256`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const sourceArg = process.argv[2];
if (!sourceArg) {
  fail("Usage: npm run android:publish-apk -- <path-to-signed-release.apk>");
}

const source = resolve(sourceArg);
if (!existsSync(source)) {
  fail(`APK not found: ${source}`);
}

const stat = statSync(source);
if (!stat.isFile() || stat.size <= 0) {
  fail(`APK is not a readable non-empty file: ${source}`);
}

if (!source.toLowerCase().endsWith(".apk")) {
  fail(`Expected an .apk file, got: ${basename(source)}`);
}

const apkBytes = readFileSync(source);
const sha256 = createHash("sha256").update(apkBytes).digest("hex");

mkdirSync("public/downloads", { recursive: true });
copyFileSync(source, destination);
writeFileSync(checksumDestination, `${sha256}  wtron-android-release.apk\n`, "utf8");

console.log(`Published ${destination}`);
console.log(`Wrote ${checksumDestination}`);
console.log(`SHA-256 ${sha256}`);
