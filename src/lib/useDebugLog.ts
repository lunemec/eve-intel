import { useCallback, useState } from "react";
import { safeStringify } from "./appUtils";

export function useDebugLog(params: {
  debugEnabled: boolean;
}): {
  debugLines: string[];
  logDebug: (message: string, data?: unknown) => void;
} {
  const [debugLines, setDebugLines] = useState<string[]>([]);

  const logDebug = useCallback((message: string, data?: unknown) => {
    const suffix = data !== undefined ? ` | ${safeStringify(data)}` : "";
    const line = `[${new Date().toLocaleTimeString()}] ${message}${suffix}`;
    setDebugLines((prev) => [line, ...prev].slice(0, 250));
    if (params.debugEnabled) {
      console.debug(line);
    }
  }, [params.debugEnabled]);

  return {
    debugLines,
    logDebug
  };
}
