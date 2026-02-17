import { useState } from "react";
import type { Settings } from "../types";
import { loadDebugEnabled, loadSettings } from "./settings";
import { usePersistedSettings } from "./usePersistedSettings";
import { useDebugToggle } from "./useDebugToggle";

export function useAppPreferences(params: {
  maxLookbackDays: number;
}): {
  settings: Settings;
  debugEnabled: boolean;
  onDebugToggle: (enabled: boolean) => void;
} {
  const [settings] = useState<Settings>(() => loadSettings(localStorage, params.maxLookbackDays));
  const [debugEnabled, setDebugEnabled] = useState<boolean>(() => loadDebugEnabled(localStorage));
  usePersistedSettings({ settings, debugEnabled });
  const onDebugToggle = useDebugToggle({ setDebugEnabled });

  return {
    settings,
    debugEnabled,
    onDebugToggle
  };
}
