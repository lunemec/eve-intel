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

  const flushPending = useCallback(() => {
    flushTimerRef.current = null;
    if (pendingRef.current.length === 0) {
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
    flushTimerRef.current = window.setTimeout(flushPending, 16);
  }, [flushPending]);

  useEffect(
    () => () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
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
