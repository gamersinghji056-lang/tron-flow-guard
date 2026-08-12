import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { triggerListenerTick } from "@/lib/deposits.functions";

type HeartbeatMode = "fast" | "manual";

/**
 * Client-side heartbeat for the blockchain listener.
 *
 * `fast` passes poll only addresses with live orders / recent activity, so they
 * are cheap enough to run every few seconds. That is what closes the gap
 * between a real TRC20 transfer landing on chain and the UI leaving "Waiting" —
 * the manual "check now" button is only a fallback now, not the primary path.
 */
export function useListenerHeartbeat(enabled: boolean, intervalMs = 6_000) {
  const tick = useServerFn(triggerListenerTick);
  const [running, setRunning] = useState(false);
  const [lastBlock, setLastBlock] = useState<number | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (mode: HeartbeatMode = "manual") => {
      if (inFlight.current) return;
      inFlight.current = true;
      setRunning(true);
      try {
        const result = await tick({ data: { mode } });
        setLastBlock(result.latestBlock ?? null);
        setLastDurationMs(result.durationMs ?? null);
        setOnline(result.ok);
      } catch {
        setOnline(false);
      } finally {
        inFlight.current = false;
        setRunning(false);
      }
    },
    [tick],
  );

  useEffect(() => {
    if (!enabled) return;
    void run("fast");
    const timer = setInterval(() => void run("fast"), intervalMs);
    // A visible tab that regains focus gets an immediate pass.
    const onFocus = () => void run("fast");
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, intervalMs, run]);

  return { run: () => run("manual"), running, lastBlock, online, lastDurationMs };
}
