import { useCallback } from "react";

export function useDebugToggle(params: {
  setDebugEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}): (enabled: boolean) => void {
  return useCallback((enabled: boolean) => {
    params.setDebugEnabled(enabled);
  }, [params.setDebugEnabled]);
}
