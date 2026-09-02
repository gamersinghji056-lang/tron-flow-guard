import { createFileRoute } from "@tanstack/react-router";
import {
  WTRON_ANDROID_RELEASE_APK_ASSET,
  WTRON_ANDROID_RELEASE_APK_URL,
  WTRON_ANDROID_RELEASE_SHA256_ASSET,
  WTRON_ANDROID_RELEASE_SHA256_URL,
} from "@/lib/app-release";

const releaseAssets: Record<string, string> = {
  [WTRON_ANDROID_RELEASE_APK_ASSET]: WTRON_ANDROID_RELEASE_APK_URL,
  [WTRON_ANDROID_RELEASE_SHA256_ASSET]: WTRON_ANDROID_RELEASE_SHA256_URL,
};

export const Route = createFileRoute("/downloads/$")({
  server: {
    handlers: {
      GET: async ({ params }) => downloadAssetResponse(params._splat, "GET"),
      HEAD: async ({ params }) => downloadAssetResponse(params._splat, "HEAD"),
    },
  },
});

async function downloadAssetResponse(asset: string | undefined, method: "GET" | "HEAD") {
  const target = asset ? releaseAssets[asset] : null;
  if (!target) {
    return new Response(method === "HEAD" ? null : "Not found", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }

  if (method === "HEAD") {
    return releaseAssetAvailable(target);
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: target,
      "cache-control": "no-store",
    },
  });
}

async function releaseAssetAvailable(target: string) {
  try {
    const response = await fetch(target, {
      method: "HEAD",
      redirect: "manual",
      headers: { "user-agent": "WTRON-release-check" },
    });
    if (response.status >= 200 && response.status < 400) {
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "no-store" },
      });
    }
  } catch {
    // Treat release lookup failures as unavailable so the UI never advertises a missing APK.
  }

  return new Response(null, {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}
