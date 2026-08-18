import { runOrderWorkerTick } from "@/lib/order-worker.server";

const pollMs = Number(process.env["ORDER_WORKER_POLL_MS"] ?? 15_000);
let stopping = false;
let running = false;

function stop(signal: string) {
  console.log(`[order-worker] received ${signal}, stopping after current tick`);
  stopping = true;
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

async function loop() {
  console.log(`[order-worker] started, polling every ${pollMs}ms`);
  while (!stopping) {
    if (!running) {
      running = true;
      try {
        const result = await runOrderWorkerTick();
        console.log("[order-worker] tick", JSON.stringify(result));
      } catch (error) {
        console.error("[order-worker] tick failed", error instanceof Error ? error.message : error);
      } finally {
        running = false;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  console.log("[order-worker] stopped");
}

void loop();
