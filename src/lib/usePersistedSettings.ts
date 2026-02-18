import { useEffect } from "react";
import type { Settings } from "../types";
import { persistDebugEnabled, persistSettings } from "./settings";

export function usePersistedSettings(params: {
  settings: Settings;
  debugEnabled: boolean;
}): void {
  useEffect(() => {
    persistSettings(localStorage, params.settings);
  }, [params.settings]);

  useEffect(() => {
    persistDebugEnabled(localStorage, params.debugEnabled);
  }, [params.debugEnabled]);
}
