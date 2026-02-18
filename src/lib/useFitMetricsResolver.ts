import { useCallback, useEffect, useRef } from "react";
import type { FitCandidate } from "./intel";
import type { DogmaIndex } from "./dogma/index";
import type { PilotCard } from "./usePilotIntelPipeline";
import { createFitMetricsResolver, type FitMetricResult } from "./useFitMetrics";

export function useFitMetricsResolver(params: {
  dogmaIndex: DogmaIndex | null;
  logDebug: (message: string, data?: unknown) => void;
}): (pilot: PilotCard, fit: FitCandidate | undefined) => FitMetricResult {
  const resolverRef = useRef<ReturnType<typeof createFitMetricsResolver> | null>(null);

  useEffect(() => {
    resolverRef.current = null;
  }, [params.dogmaIndex, params.logDebug]);

  return useCallback(
    (pilot: PilotCard, fit: FitCandidate | undefined): FitMetricResult => {
      if (!resolverRef.current) {
        resolverRef.current = createFitMetricsResolver({
          dogmaIndex: params.dogmaIndex,
          logDebug: params.logDebug
        });
      }
      return resolverRef.current(pilot, fit);
    },
    [params.dogmaIndex, params.logDebug]
  );
}
