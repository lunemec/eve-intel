import { useCallback, useEffect, useRef, useState } from "react";
import { safeStringify } from "./appUtils";

export function useDebugLog(params: {
  debugEnabled: boolean;
}): {
  debugLines: string[];
  logDebug: (message: string, data?: unknown) => void;
} {
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const pendingRef = useRef<string[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const mountedRef = useRef<boolean>(true);

  const flushPending = useCallback(() => {
    flushTimerRef.current = null;
    if (pendingRef.current.length === 0) {
      return;
    }
    if (!mountedRef.current || typeof window === "undefined") {
      pendingRef.current = [];
      return;
    }

    const pending = pendingRef.current.slice().reverse();
    pendingRef.current = [];
    setDebugLines((prev) => [...pending, ...prev].slice(0, 250));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) {
      return;
    }
    flushTimerRef.current = globalThis.setTimeout(flushPending, 16) as unknown as number;
  }, [flushPending]);

  useEffect(
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        pendingRef.current = [];
        if (flushTimerRef.current !== null) {
          globalThis.clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
      };
    },
    []
  );

  const logDebug = useCallback((message: string, data?: unknown) => {
    const suffix = data !== undefined ? ` | ${safeStringify(data)}` : "";
    const line = `[${new Date().toLocaleTimeString()}] ${message}${suffix}`;
    pendingRef.current.push(line);
    scheduleFlush();
    if (params.debugEnabled) {
      console.debug(line);
    }
  }, [params.debugEnabled, scheduleFlush]);

  return {
    debugLines,
    logDebug
  };
}
