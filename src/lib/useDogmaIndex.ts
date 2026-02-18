import { useEffect, useState } from "react";
import { buildDogmaIndex, type DogmaIndex } from "./dogma/index";
import { loadDogmaData } from "./dogma/loader";
import { extractErrorMessage } from "./appUtils";

export function useDogmaIndex(params: {
  logDebug: (message: string, data?: unknown) => void;
}): {
  dogmaIndex: DogmaIndex | null;
  dogmaVersion: string;
  dogmaLoadError: string;
} {
  const [dogmaIndex, setDogmaIndex] = useState<DogmaIndex | null>(null);
  const [dogmaVersion, setDogmaVersion] = useState<string>("");
  const [dogmaLoadError, setDogmaLoadError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void loadDogmaData()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const index = buildDogmaIndex(payload.pack);
        setDogmaIndex(index);
        setDogmaVersion(payload.manifest.activeVersion);
        setDogmaLoadError("");
        params.logDebug("Dogma pack loaded", {
          version: payload.manifest.activeVersion,
          typeCount: payload.pack.typeCount
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const reason = extractErrorMessage(error);
        setDogmaIndex(null);
        setDogmaVersion("");
        setDogmaLoadError(reason);
        params.logDebug("Dogma loader failed", { error: reason });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    dogmaIndex,
    dogmaVersion,
    dogmaLoadError
  };
}
