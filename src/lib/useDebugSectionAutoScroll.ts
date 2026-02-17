import { useEffect } from "react";

export function useDebugSectionAutoScroll(params: {
  debugEnabled: boolean;
  debugSectionRef: React.RefObject<HTMLElement>;
}): void {
  useEffect(() => {
    if (!params.debugEnabled) {
      return;
    }
    params.debugSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [params.debugEnabled, params.debugSectionRef]);
}
