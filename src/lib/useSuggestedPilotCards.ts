import { useEffect, useMemo, useState } from "react";
import type { ParsedPilotInput } from "../types";
import type { DogmaIndex } from "./dogma/index";
import type { PilotCard } from "./pilotDomain";
import type { ResolvedPilotTask } from "./pipeline/breadthPipeline";
import { runResolvedPilotPipeline } from "./pipeline/runPipeline";
import { DEEP_HISTORY_MAX_PAGES, TOP_SHIP_CANDIDATES } from "./pipeline/constants";
import { patchPilotCardRows } from "./pipeline/cards";
import { createLoadingCard } from "./pipeline/stateTransitions";
import type { RetryBuilder } from "./pipeline/types";

const NOOP_RETRY: RetryBuilder = () => () => undefined;

export function useSuggestedPilotCards(params: {
  suggestedPilotIds: number[];
  lookbackDays: number;
  dogmaIndex: DogmaIndex | null;
  logDebug: (message: string, data?: unknown) => void;
}): PilotCard[] {
  const normalizedSuggestedPilotIds = useMemo(
    () => normalizeSuggestedPilotIds(params.suggestedPilotIds),
    [params.suggestedPilotIds]
  );
  const suggestedPilotIdsKey = useMemo(
    () => normalizedSuggestedPilotIds.join(","),
    [normalizedSuggestedPilotIds]
  );
  const [suggestedPilotCards, setSuggestedPilotCards] = useState<PilotCard[]>([]);

  useEffect(() => {
    if (normalizedSuggestedPilotIds.length === 0) {
      setSuggestedPilotCards((previous) => (previous.length === 0 ? previous : []));
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    const tasks = normalizedSuggestedPilotIds.map((characterId) => buildSuggestedTask(characterId));

    setSuggestedPilotCards((current) => {
      const byCharacterId = new Map<number, PilotCard>();
      for (const row of current) {
        const rowCharacterId = toValidPilotId(row.characterId);
        if (rowCharacterId === null || byCharacterId.has(rowCharacterId)) {
          continue;
        }
        byCharacterId.set(rowCharacterId, row);
      }
      return tasks.map((task) => byCharacterId.get(task.characterId) ?? createLoadingCard(task.entry));
    });

    const updatePilotCard = (pilotName: string, patch: Partial<PilotCard>) => {
      if (cancelled || abortController.signal.aborted) {
        return;
      }
      setSuggestedPilotCards((current) => patchPilotCardRows(current, pilotName, patch));
    };

    void runResolvedPilotPipeline({
      tasks,
      lookbackDays: params.lookbackDays,
      topShips: TOP_SHIP_CANDIDATES,
      dogmaIndex: params.dogmaIndex,
      maxPages: DEEP_HISTORY_MAX_PAGES,
      signal: abortController.signal,
      onRetry: NOOP_RETRY,
      isCancelled: () => cancelled || abortController.signal.aborted,
      updatePilotCard,
      logDebug: params.logDebug,
      logError: (message, error) => {
        params.logDebug("Suggested pilot pipeline error", {
          message,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }).catch((error) => {
      if (cancelled || abortController.signal.aborted) {
        return;
      }
      params.logDebug("Suggested pilot pipeline run failed", {
        suggestedPilots: normalizedSuggestedPilotIds.length,
        error: error instanceof Error ? error.message : String(error)
      });
    });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    params.dogmaIndex,
    params.logDebug,
    params.lookbackDays,
    suggestedPilotIdsKey
  ]);

  return suggestedPilotCards;
}

function buildSuggestedTask(characterId: number): ResolvedPilotTask {
  return {
    characterId,
    priority: "suggested",
    entry: buildSuggestedEntry(characterId)
  };
}

function buildSuggestedEntry(characterId: number): ParsedPilotInput {
  const pilotName = `Character ${characterId}`;
  return {
    pilotName,
    sourceLine: pilotName,
    parseConfidence: 1,
    shipSource: "inferred"
  };
}

function normalizeSuggestedPilotIds(ids: number[]): number[] {
  const unique = new Set<number>();
  for (const id of ids) {
    if (Number.isInteger(id) && id > 0) {
      unique.add(id);
    }
  }
  return [...unique].sort((left, right) => left - right);
}

function toValidPilotId(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}
