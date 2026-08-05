import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { triggerListenerTick } from "@/lib/deposits.functions";

/**
 * Client-side heartbeat for the blockchain listener.
 *
 * The listener also runs on a schedule server-side; this hook simply asks for
 * an extra pass while a screen with live deposits is open so the demo reacts
 * within seconds instead of the cron interval.
 */
export function useListenerHeartbeat(enabled: boolean, intervalMs = 20_000) {
  const tick = useServerFn(triggerListenerTick);
  const [running, setRunning] = useState(false);
  const [lastBlock, setLastBlock] = useState<number | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    try {
      const result = await tick({});
      setLastBlock(result.latestBlock ?? null);
      setOnline(result.ok);
    } catch {
      setOnline(false);
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  }, [tick]);

  useEffect(() => {
    if (!enabled) return;
    void run();
    const timer = setInterval(() => void run(), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs, run]);

  return { run, running, lastBlock, online };
}
