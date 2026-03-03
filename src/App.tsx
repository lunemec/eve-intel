import { useEffect, useMemo, useRef, useState } from "react";
import { ZKILL_MAX_LOOKBACK_DAYS } from "./lib/api/zkill";
import { resolveUniverseNames } from "./lib/api/esi";
import { clearIntelCache } from "./lib/cache";
import { ConstellationBackground } from "./components/ConstellationBackground";
import { FleetSummary } from "./components/FleetSummary";
import { PilotCardView } from "./components/PilotCardView";
import { ControlsPanel } from "./components/ControlsPanel";
import { TopBar } from "./components/TopBar";
import { AppHeader } from "./components/AppHeader";
import { useDesktopBridge } from "./lib/useDesktopBridge";
import { usePilotIntelPipeline } from "./lib/usePilotIntelPipeline";
import { useDogmaIndex } from "./lib/useDogmaIndex";
import { useDebugLog } from "./lib/useDebugLog";
import { useFitMetricsResolver } from "./lib/useFitMetricsResolver";
import { useParsedPaste } from "./lib/useParsedPaste";
import { useDebugSectionAutoScroll } from "./lib/useDebugSectionAutoScroll";
import { useCacheWipeAction } from "./lib/useCacheWipeAction";
import { useDesktopWindowControls } from "./lib/useDesktopWindowControls";
import {
  deriveAppViewModel,
  type GroupPresentation
} from "./lib/appViewModel";
import { useDebouncedFleetGrouping } from "./lib/useDebouncedFleetGrouping";
import { useClearPilotCards } from "./lib/useClearPilotCards";
import { useManualEntryHandlers } from "./lib/useManualEntryHandlers";
import { useAppPreferences } from "./lib/useAppPreferences";
import { usePasteInputIntegration } from "./lib/usePasteInputIntegration";
import { useSuggestedPilotCards } from "./lib/useSuggestedPilotCards";
import { extractErrorMessage } from "./lib/appUtils";
import { deriveGroupRunPositionsByIndex } from "./lib/groupRuns";
import type { PilotCard } from "./lib/pilotDomain";

const APP_VERSION = import.meta.env.PACKAGE_VERSION;

export default function App() {
  const { settings, debugEnabled, onDebugToggle } = useAppPreferences({
    maxLookbackDays: ZKILL_MAX_LOOKBACK_DAYS
  });
  const debugSectionRef = useRef<HTMLElement>(null);
  const { debugLines, logDebug } = useDebugLog({ debugEnabled });
  const { lastPasteRaw, manualEntry, setManualEntry, parseResult, applyPaste } = useParsedPaste({ logDebug });

  const { isDesktopApp, isWindowMaximized, updaterState } = useDesktopBridge({
    applyPaste,
    logDebug
  });
  const { dogmaIndex } = useDogmaIndex({ logDebug });
  const { pasteTrapRef, onPaste } = usePasteInputIntegration({ applyPaste });
  const getFitMetrics = useFitMetricsResolver({ dogmaIndex, logDebug });

  const { pilotCards, setPilotCards, networkNotice, setNetworkNotice } = usePilotIntelPipeline({
    entries: parseResult.entries,
    settings,
    dogmaIndex,
    logDebug
  });
  useDebugSectionAutoScroll({ debugEnabled, debugSectionRef });

  const {
    sortedPilotCards,
    fleetSummaryGroupPresentationByPilotId
  } = useDebouncedFleetGrouping(pilotCards, { logDebug });
  const suggestedPilotIds = useMemo(
    () => collectSuggestedPilotIdsForSummary(sortedPilotCards, fleetSummaryGroupPresentationByPilotId),
    [fleetSummaryGroupPresentationByPilotId, sortedPilotCards]
  );
  const suggestedPilotCards = useSuggestedPilotCards({
    suggestedPilotIds,
    lookbackDays: settings.lookbackDays,
    dogmaIndex,
    logDebug
  });
  const [fleetSummarySuggestedNamesById, setFleetSummarySuggestedNamesById] = useState<ReadonlyMap<number, string>>(new Map());
  const unresolvedFleetSummarySuggestedPilotIds = useMemo(
    () => suggestedPilotIds.filter((pilotId) => !fleetSummarySuggestedNamesById.has(pilotId)),
    [fleetSummarySuggestedNamesById, suggestedPilotIds]
  );
  useEffect(() => {
    if (unresolvedFleetSummarySuggestedPilotIds.length === 0) {
      return;
    }
    const abortController = new AbortController();
    void resolveUniverseNames(unresolvedFleetSummarySuggestedPilotIds, abortController.signal)
      .then((namesById) => {
        if (abortController.signal.aborted) {
          return;
        }
        const validEntries = [...namesById.entries()].filter(
          ([pilotId, name]) =>
            unresolvedFleetSummarySuggestedPilotIds.includes(pilotId) &&
            typeof name === "string" &&
            name.trim().length > 0
        );
        if (validEntries.length === 0) {
          return;
        }
        setFleetSummarySuggestedNamesById((previous) => {
          const merged = new Map(previous);
          let changed = false;
          for (const [pilotId, name] of validEntries) {
            if (merged.get(pilotId) === name) {
              continue;
            }
            merged.set(pilotId, name);
            changed = true;
          }
          return changed ? merged : previous;
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }
        logDebug("Fleet summary suggested name resolution failed", {
          requested: unresolvedFleetSummarySuggestedPilotIds.length,
          error: extractErrorMessage(error)
        });
      });
    return () => {
      abortController.abort();
    };
  }, [logDebug, unresolvedFleetSummarySuggestedPilotIds]);
  const displayPilotCards = useMemo(
    () =>
      buildDisplayPilotCards(
        sortedPilotCards,
        suggestedPilotIds,
        suggestedPilotCards,
        fleetSummarySuggestedNamesById,
        fleetSummaryGroupPresentationByPilotId
      ),
    [
      fleetSummaryGroupPresentationByPilotId,
      fleetSummarySuggestedNamesById,
      sortedPilotCards,
      suggestedPilotCards,
      suggestedPilotIds
    ]
  );
  const displayCopyableFleetCount = useMemo(
    () => displayPilotCards.filter((pilot) => Number.isFinite(pilot.characterId)).length,
    [displayPilotCards]
  );
  const displayGroupRunPositionsByIndex = useMemo(
    () => deriveGroupRunPositionsByIndex(displayPilotCards, fleetSummaryGroupPresentationByPilotId),
    [displayPilotCards, fleetSummaryGroupPresentationByPilotId]
  );
  const { globalLoadProgress, showGlobalLoad } = deriveAppViewModel(displayPilotCards);
  const { onMinimize, onToggleMaximize, onClose, onRestartToUpdate } = useDesktopWindowControls();
  const clearPilotCards = useClearPilotCards({ setPilotCards });
  const { onManualEntryChange, onManualEntrySubmit } = useManualEntryHandlers({
    manualEntry,
    setManualEntry,
    applyPaste
  });
  const onWipeCache = useCacheWipeAction({
    clearCache: clearIntelCache,
    logDebug,
    setNetworkNotice,
    clearPilotCards,
    applyPaste,
    lastPasteRaw,
    manualEntry
  });
  const debugLogText = debugLines.length > 0 ? debugLines.join("\n") : "(no events yet)";
  const onCopyDebugLog = async () => {
    try {
      await navigator.clipboard.writeText(debugLogText);
      setNetworkNotice("Debug log copied.");
    } catch (error) {
      setNetworkNotice(`Debug log copy failed: ${extractErrorMessage(error)}`);
    }
  };

  return (
    <main className={`app${isDesktopApp ? " desktop-shell" : ""}`}>
      <ConstellationBackground />
      <TopBar
        isDesktopApp={isDesktopApp}
        isWindowMaximized={isWindowMaximized}
        showGlobalLoad={showGlobalLoad}
        globalLoadProgress={globalLoadProgress}
        onMinimize={onMinimize}
        onToggleMaximize={onToggleMaximize}
        onClose={onClose}
      />
      <textarea
        ref={pasteTrapRef}
        aria-hidden="true"
        className="paste-trap"
        tabIndex={-1}
        onPaste={onPaste}
      />

      <AppHeader />

      {networkNotice ? <p className="notice notice-inline">{networkNotice}</p> : null}

      {sortedPilotCards.length === 0 ? (
        <section className="empty">
          <p>
            Try pasting one pilot per line, for example{" "}
            <span className="inline-example">Bad Player</span> or{" "}
            <span className="inline-example">BadPlayer (Venture)</span>.
          </p>
        </section>
      ) : (
        <>
          {displayPilotCards.length > 1 ? (
            <FleetSummary
              pilotCards={displayPilotCards}
              copyableFleetCount={displayCopyableFleetCount}
              setNetworkNotice={setNetworkNotice}
              logDebug={logDebug}
              groupPresentationByPilotId={fleetSummaryGroupPresentationByPilotId}
            />
          ) : null}
          <section className="cards">
            {displayPilotCards.map((pilot, index) => (
              <PilotCardView
                key={pilot.parsedEntry.pilotName.toLowerCase()}
                pilot={pilot}
                getFitMetrics={getFitMetrics}
                groupPresentation={resolveGroupPresentation(fleetSummaryGroupPresentationByPilotId, pilot.characterId)}
                groupRunPosition={displayGroupRunPositionsByIndex[index]}
              />
            ))}
          </section>
        </>
      )}

      <ControlsPanel
        manualEntry={manualEntry}
        onManualEntryChange={onManualEntryChange}
        onManualEntrySubmit={onManualEntrySubmit}
        onWipeCache={onWipeCache}
        debugEnabled={debugEnabled}
        onDebugToggle={onDebugToggle}
        isDesktopApp={isDesktopApp}
        updaterState={updaterState}
        onRestartToUpdate={onRestartToUpdate}
      />
      {debugEnabled ? (
        <section className="raw" ref={debugSectionRef}>
          <div className="debug-log-header">
            <h3>Debug Log</h3>
            <button
              type="button"
              className="debug-log-copy-button"
              aria-label="Copy debug log"
              title="Copy debug log"
              onClick={() => {
                void onCopyDebugLog();
              }}
            >
              <svg
                className="debug-log-copy-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <rect x="9" y="9" width="10" height="10" rx="2" />
                <rect x="5" y="5" width="10" height="10" rx="2" />
              </svg>
            </button>
          </div>
          <pre>{debugLogText}</pre>
        </section>
      ) : null}
      <footer className="app-version">v{APP_VERSION}</footer>
    </main>
  );
}

function resolveGroupPresentation(
  groupPresentationByPilotId: ReadonlyMap<number, GroupPresentation>,
  characterId: number | undefined
): GroupPresentation | undefined {
  if (typeof characterId !== "number" || !Number.isInteger(characterId) || characterId <= 0) {
    return undefined;
  }
  return groupPresentationByPilotId.get(characterId);
}

function buildDisplayPilotCards(
  sortedPilotCards: PilotCard[],
  suggestedPilotIds: number[],
  suggestedPilotCards: PilotCard[],
  suggestedPilotNamesById: ReadonlyMap<number, string>,
  groupPresentationByPilotId: ReadonlyMap<number, GroupPresentation>
): PilotCard[] {
  if (sortedPilotCards.length === 0 || suggestedPilotIds.length === 0) {
    return sortedPilotCards;
  }

  const suggestedPilotCardsById = new Map<number, PilotCard>();
  for (const card of suggestedPilotCards) {
    const pilotId = toValidPilotId(card.characterId);
    if (pilotId !== null && !suggestedPilotCardsById.has(pilotId)) {
      suggestedPilotCardsById.set(pilotId, card);
    }
  }

  const selectedPilotIdSet = new Set<number>();
  for (const card of sortedPilotCards) {
    const pilotId = toValidPilotId(card.characterId);
    if (pilotId !== null) {
      selectedPilotIdSet.add(pilotId);
    }
  }

  const orderedSuggestedPilotIds = orderSuggestedPilotIdsForDisplay({
    suggestedPilotIds,
    suggestedPilotCardsById,
    suggestedPilotNamesById
  });
  const remainingSuggestedByGroupId = new Map<string, number[]>();
  const remainingUngroupedSuggestedPilotIds: number[] = [];
  for (const suggestedPilotId of orderedSuggestedPilotIds) {
    if (selectedPilotIdSet.has(suggestedPilotId)) {
      continue;
    }
    const groupId = groupPresentationByPilotId.get(suggestedPilotId)?.groupId;
    if (groupId && groupId.length > 0) {
      const groupSuggestions = remainingSuggestedByGroupId.get(groupId) ?? [];
      groupSuggestions.push(suggestedPilotId);
      remainingSuggestedByGroupId.set(groupId, groupSuggestions);
      continue;
    }
    remainingUngroupedSuggestedPilotIds.push(suggestedPilotId);
  }

  const displayPilotCards: PilotCard[] = [];
  const emittedSuggestedPilotIds = new Set<number>();
  for (let index = 0; index < sortedPilotCards.length; index += 1) {
    const selectedPilot = sortedPilotCards[index];
    displayPilotCards.push(selectedPilot);

    const selectedPilotId = toValidPilotId(selectedPilot.characterId);
    if (selectedPilotId === null) {
      continue;
    }
    const selectedGroupId = groupPresentationByPilotId.get(selectedPilotId)?.groupId;
    if (!selectedGroupId || selectedGroupId.length === 0) {
      continue;
    }

    const nextSelectedGroupId = findNextSelectedGroupId({
      sortedPilotCards,
      fromIndex: index + 1,
      groupPresentationByPilotId
    });
    if (nextSelectedGroupId === selectedGroupId) {
      continue;
    }

    appendSuggestedGroupCards({
      groupId: selectedGroupId,
      remainingSuggestedByGroupId,
      emittedSuggestedPilotIds,
      displayPilotCards,
      suggestedPilotCardsById,
      suggestedPilotNamesById
    });
  }

  for (const groupedSuggestionIds of remainingSuggestedByGroupId.values()) {
    for (const suggestedPilotId of groupedSuggestionIds) {
      appendSuggestedPilotCard({
        suggestedPilotId,
        emittedSuggestedPilotIds,
        displayPilotCards,
        suggestedPilotCardsById,
        suggestedPilotNamesById
      });
    }
  }
  for (const suggestedPilotId of remainingUngroupedSuggestedPilotIds) {
    appendSuggestedPilotCard({
      suggestedPilotId,
      emittedSuggestedPilotIds,
      displayPilotCards,
      suggestedPilotCardsById,
      suggestedPilotNamesById
    });
  }

  return displayPilotCards;
}

function collectSuggestedPilotIdsForSummary(
  sortedPilotCards: PilotCard[],
  groupPresentationByPilotId: ReadonlyMap<number, GroupPresentation>
): number[] {
  if (groupPresentationByPilotId.size === 0) {
    return [];
  }
  const existingPilotIdSet = new Set<number>();
  for (const pilot of sortedPilotCards) {
    const pilotId = toValidPilotId(pilot.characterId);
    if (pilotId !== null) {
      existingPilotIdSet.add(pilotId);
    }
  }

  const suggestedPilotIds: number[] = [];
  for (const [pilotId, presentation] of groupPresentationByPilotId) {
    if (!presentation.isGreyedSuggestion || existingPilotIdSet.has(pilotId)) {
      continue;
    }
    suggestedPilotIds.push(pilotId);
    existingPilotIdSet.add(pilotId);
  }
  suggestedPilotIds.sort((left, right) => left - right);
  return suggestedPilotIds;
}

function createSuggestedSummaryPilotCard(characterId: number, resolvedPilotName: string | undefined): PilotCard {
  const pilotName = resolvedPilotName && resolvedPilotName.trim().length > 0
    ? resolvedPilotName
    : `Character ${characterId}`;
  return {
    parsedEntry: {
      pilotName,
      sourceLine: pilotName,
      parseConfidence: 1,
      shipSource: "inferred"
    },
    status: "ready",
    fetchPhase: "ready",
    characterId,
    characterName: pilotName,
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: []
  };
}

function withResolvedSuggestedPilotName(
  pilotCard: PilotCard,
  resolvedPilotName: string | undefined
): PilotCard {
  if (!resolvedPilotName || resolvedPilotName.trim().length === 0) {
    return pilotCard;
  }
  if (pilotCard.characterName === resolvedPilotName) {
    return pilotCard;
  }
  return {
    ...pilotCard,
    characterName: resolvedPilotName
  };
}

function orderSuggestedPilotIdsForDisplay(params: {
  suggestedPilotIds: number[];
  suggestedPilotCardsById: ReadonlyMap<number, PilotCard>;
  suggestedPilotNamesById: ReadonlyMap<number, string>;
}): number[] {
  const uniqueSuggestedIds = new Set<number>();
  for (const pilotId of params.suggestedPilotIds) {
    if (Number.isInteger(pilotId) && pilotId > 0) {
      uniqueSuggestedIds.add(pilotId);
    }
  }
  return [...uniqueSuggestedIds].sort((leftPilotId, rightPilotId) =>
    compareSuggestedPilotIdsForDisplay({
      leftPilotId,
      rightPilotId,
      suggestedPilotCardsById: params.suggestedPilotCardsById,
      suggestedPilotNamesById: params.suggestedPilotNamesById
    })
  );
}

function compareSuggestedPilotIdsForDisplay(params: {
  leftPilotId: number;
  rightPilotId: number;
  suggestedPilotCardsById: ReadonlyMap<number, PilotCard>;
  suggestedPilotNamesById: ReadonlyMap<number, string>;
}): number {
  const leftName = resolveSuggestedPilotNameForSort({
    pilotId: params.leftPilotId,
    suggestedPilotCardsById: params.suggestedPilotCardsById,
    suggestedPilotNamesById: params.suggestedPilotNamesById
  });
  const rightName = resolveSuggestedPilotNameForSort({
    pilotId: params.rightPilotId,
    suggestedPilotCardsById: params.suggestedPilotCardsById,
    suggestedPilotNamesById: params.suggestedPilotNamesById
  });
  return (
    leftName.localeCompare(rightName, "en", { sensitivity: "base" }) ||
    params.leftPilotId - params.rightPilotId
  );
}

function resolveSuggestedPilotNameForSort(params: {
  pilotId: number;
  suggestedPilotCardsById: ReadonlyMap<number, PilotCard>;
  suggestedPilotNamesById: ReadonlyMap<number, string>;
}): string {
  const resolvedName = params.suggestedPilotNamesById.get(params.pilotId);
  if (resolvedName && resolvedName.trim().length > 0) {
    return resolvedName.trim();
  }
  const cardName = params.suggestedPilotCardsById.get(params.pilotId)?.characterName;
  if (cardName && cardName.trim().length > 0) {
    return cardName.trim();
  }
  return `Character ${params.pilotId}`;
}

function findNextSelectedGroupId(params: {
  sortedPilotCards: PilotCard[];
  fromIndex: number;
  groupPresentationByPilotId: ReadonlyMap<number, GroupPresentation>;
}): string | undefined {
  for (let index = params.fromIndex; index < params.sortedPilotCards.length; index += 1) {
    const pilotId = toValidPilotId(params.sortedPilotCards[index]?.characterId);
    if (pilotId === null) {
      continue;
    }
    return params.groupPresentationByPilotId.get(pilotId)?.groupId;
  }
  return undefined;
}

function appendSuggestedGroupCards(params: {
  groupId: string;
  remainingSuggestedByGroupId: Map<string, number[]>;
  emittedSuggestedPilotIds: Set<number>;
  displayPilotCards: PilotCard[];
  suggestedPilotCardsById: ReadonlyMap<number, PilotCard>;
  suggestedPilotNamesById: ReadonlyMap<number, string>;
}): void {
  const groupSuggestionIds = params.remainingSuggestedByGroupId.get(params.groupId);
  if (!groupSuggestionIds || groupSuggestionIds.length === 0) {
    return;
  }
  for (const suggestedPilotId of groupSuggestionIds) {
    appendSuggestedPilotCard({
      suggestedPilotId,
      emittedSuggestedPilotIds: params.emittedSuggestedPilotIds,
      displayPilotCards: params.displayPilotCards,
      suggestedPilotCardsById: params.suggestedPilotCardsById,
      suggestedPilotNamesById: params.suggestedPilotNamesById
    });
  }
  params.remainingSuggestedByGroupId.delete(params.groupId);
}

function appendSuggestedPilotCard(params: {
  suggestedPilotId: number;
  emittedSuggestedPilotIds: Set<number>;
  displayPilotCards: PilotCard[];
  suggestedPilotCardsById: ReadonlyMap<number, PilotCard>;
  suggestedPilotNamesById: ReadonlyMap<number, string>;
}): void {
  if (params.emittedSuggestedPilotIds.has(params.suggestedPilotId)) {
    return;
  }
  params.displayPilotCards.push(
    withResolvedSuggestedPilotName(
      params.suggestedPilotCardsById.get(params.suggestedPilotId) ??
        createSuggestedSummaryPilotCard(params.suggestedPilotId, params.suggestedPilotNamesById.get(params.suggestedPilotId)),
      params.suggestedPilotNamesById.get(params.suggestedPilotId)
    )
  );
  params.emittedSuggestedPilotIds.add(params.suggestedPilotId);
}

function toValidPilotId(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}
