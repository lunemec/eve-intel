import { useCallback, useEffect, useState } from "react";
import type { Settings } from "../types";
import {
  loadDebugEnabled,
  loadSettings,
  persistDebugEnabled,
  persistSettings
} from "./settings";

export function useAppPreferences(params: {
  maxLookbackDays: number;
}): {
  settings: Settings;
  debugEnabled: boolean;
  onDebugToggle: (enabled: boolean) => void;
} {
  const [settings] = useState<Settings>(() => loadSettings(localStorage, params.maxLookbackDays));
  const [debugEnabled, setDebugEnabled] = useState<boolean>(() => loadDebugEnabled(localStorage));
  useEffect(() => {
    persistSettings(localStorage, settings);
  }, [settings]);
  useEffect(() => {
    persistDebugEnabled(localStorage, debugEnabled);
  }, [debugEnabled]);
  const onDebugToggle = useCallback((enabled: boolean) => {
    setDebugEnabled(enabled);
  }, []);

  return {
    settings,
    debugEnabled,
    onDebugToggle
  };
}
