import { useEffect, useRef, useState } from "react";
import {
  fetchCharacterPublic,
  resolveCharacterIds,
  resolveInventoryTypeIdByName,
  resolveUniverseNames
} from "./lib/api/esi";
import {
  ZKILL_MAX_LOOKBACK_DAYS,
  fetchCharacterStats,
  fetchLatestKills,
  fetchLatestKillsPaged,
  fetchLatestLosses,
  fetchLatestLossesPaged,
  fetchRecentKills,
  fetchRecentLosses,
  type ZkillCharacterStats,
  type ZkillKillmail
} from "./lib/api/zkill";
import { clearIntelCache, getCachedStateAsync, setCachedAsync } from "./lib/cache";
import { estimateShipCynoChance, evaluateCynoRisk, type CynoRisk } from "./lib/cyno";
import { deriveShipRolePills } from "./lib/roles";
import {
  collectItemTypeIds,
  collectShipTypeIdsForNaming,
  deriveFitCandidates,
  derivePilotStats,
  deriveShipPredictions,
  type FitCandidate,
  type PilotStats,
  type ShipPrediction
} from "./lib/intel";
import { formatFitAsEft } from "./lib/eft";
import { parseClipboardText } from "./lib/parser";
import type { ParseResult, ParsedPilotInput, Settings } from "./types";
import { ConstellationBackground } from "./components/ConstellationBackground";

const DEFAULT_SETTINGS: Settings = {
  lookbackDays: ZKILL_MAX_LOOKBACK_DAYS
};
const APP_VERSION = import.meta.env.PACKAGE_VERSION;
const SETTINGS_KEY = "eve-intel.settings.v1";
const DEBUG_KEY = "eve-intel.debug-enabled.v1";

type PilotCard = {
  parsedEntry: ParsedPilotInput;
  status: "idle" | "loading" | "ready" | "error";
  fetchPhase?: "loading" | "enriching" | "ready" | "error";
  error?: string;
  characterId?: number;
  characterName?: string;
  corporationId?: number;
  corporationName?: string;
  allianceId?: number;
  allianceName?: string;
  securityStatus?: number;
  stats?: PilotStats;
  predictedShips: ShipPrediction[];
  fitCandidates: FitCandidate[];
  cynoRisk?: CynoRisk;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
  inferenceKills: ZkillKillmail[];
  inferenceLosses: ZkillKillmail[];
};

type DerivedInference = {
  predictedShips: ShipPrediction[];
  fitCandidates: FitCandidate[];
  cynoRisk: CynoRisk;
};

type ShipRiskFlags = {
  hardCyno: boolean;
  softCyno: boolean;
  bait: boolean;
};

const CYNO_ICON_TYPE_ID = 21096;
const ROLE_ICON_TYPE_IDS: Record<string, number> = {
  "Long Point": 3242,
  Web: 526,
  HIC: 37611,
  Bubble: 22778,
  Boosh: 4383,
  Neut: 16469,
  Cloaky: 11370,
  "Shield Logi": 8635,
  "Armor Logi": 16455
};
const DEEP_HISTORY_MAX_PAGES = 20;
const TOP_SHIP_CANDIDATES = 5;
const DETAIL_FIT_CANDIDATES = 3;
const FAST_SCROLL_DURATION_MS = 120;

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [debugEnabled, setDebugEnabled] = useState<boolean>(() => loadDebugEnabled());
  const [isDesktopApp] = useState<boolean>(() => Boolean(window.eveIntelDesktop));
  const [isWindowMaximized, setIsWindowMaximized] = useState<boolean>(false);
  const [lastPasteAt, setLastPasteAt] = useState<string>("Never");
  const [lastPasteRaw, setLastPasteRaw] = useState<string>("");
  const [manualEntry, setManualEntry] = useState<string>("");
  const [parseResult, setParseResult] = useState<ParseResult>({ entries: [], rejected: [] });
  const [pilotCards, setPilotCards] = useState<PilotCard[]>([]);
  const [networkNotice, setNetworkNotice] = useState<string>("");
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const pasteTrapRef = useRef<HTMLTextAreaElement>(null);
  const debugSectionRef = useRef<HTMLElement>(null);
  const copyableFleetCount = pilotCards.filter((pilot) => Number.isFinite(pilot.characterId)).length;

  const applyPaste = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const parsed = parseClipboardText(trimmed);
    setLastPasteRaw(trimmed);
    setManualEntry(trimmed);
    setParseResult(parsed);
    setLastPasteAt(new Date().toLocaleTimeString());
    logDebug(
      `Paste parsed: entries=${parsed.entries.length}, rejected=${parsed.rejected.length}`,
      parsed.rejected.length > 0 ? { rejected: parsed.rejected } : undefined
    );
  };

  const logDebug = (message: string, data?: unknown) => {
    const suffix = data !== undefined ? ` | ${safeStringify(data)}` : "";
    const line = `[${new Date().toLocaleTimeString()}] ${message}${suffix}`;
    setDebugLines((prev) => [line, ...prev].slice(0, 250));
    if (debugEnabled) {
      console.debug(line);
    }
  };

  useEffect(() => {
    if (!debugEnabled) {
      return;
    }
    debugSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [debugEnabled]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text");
      if (text) {
        applyPaste(text);
      }
    };

    const focusTrap = () => {
      pasteTrapRef.current?.focus();
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("focus", focusTrap);
    focusTrap();

    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("focus", focusTrap);
    };
  }, []);

  useEffect(() => {
    persistSettings(settings);
  }, [settings]);

  useEffect(() => {
    persistDebugEnabled(debugEnabled);
  }, [debugEnabled]);

  useEffect(() => {
    if (!window.eveIntelDesktop?.onClipboardText) {
      return;
    }

    const unsubscribe = window.eveIntelDesktop.onClipboardText((text) => {
      applyPaste(text);
      logDebug("Desktop clipboard update received");
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!window.eveIntelDesktop) {
      return;
    }

    let mounted = true;
    void window.eveIntelDesktop.isWindowMaximized().then((value) => {
      if (mounted) {
        setIsWindowMaximized(value);
      }
    });

    const unsubscribe = window.eveIntelDesktop.onWindowMaximized((value) => {
      setIsWindowMaximized(value);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (parseResult.entries.length === 0) {
      setPilotCards([]);
      logDebug("No parsed entries. Waiting for paste.");
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();

    setNetworkNotice("");
    setPilotCards(
      parseResult.entries.map((entry) => ({
        parsedEntry: entry,
        status: "loading",
        fetchPhase: "loading",
        predictedShips: [],
        fitCandidates: [],
        kills: [],
        losses: [],
        inferenceKills: [],
        inferenceLosses: []
      }))
    );

    const updatePilotCard = (pilotName: string, patch: Partial<PilotCard>) => {
      if (cancelled) {
        return;
      }
      setPilotCards((current) =>
        current.map((row) =>
          row.parsedEntry.pilotName.toLowerCase() === pilotName.toLowerCase()
            ? { ...row, ...patch }
            : row
        )
      );
    };

    const loadDerivedInference = async (row: PilotCard, namesById: Map<number, string>) => {
      const derivedKey = buildDerivedInferenceKey({
        characterId: row.characterId!,
        lookbackDays: settings.lookbackDays,
        topShips: TOP_SHIP_CANDIDATES,
        explicitShip: row.parsedEntry.explicitShip,
        kills: row.inferenceKills,
        losses: row.inferenceLosses
      });

      const cached = await getCachedStateAsync<DerivedInference>(derivedKey);
      if (cached.value && isDerivedInferenceUsable(cached.value, row.parsedEntry.explicitShip)) {
        logDebug("Derived inference cache hit", {
          pilot: row.parsedEntry.pilotName,
          stale: cached.stale,
          predicted: cached.value.predictedShips.length
        });
        if (cached.stale) {
            void recomputeDerivedInference({
              row,
              settings,
              namesById,
              cacheKey: derivedKey,
              debugLog: logDebug
            });
          }
        return cached.value;
      }

      logDebug("Derived inference cache miss/recompute", {
        pilot: row.parsedEntry.pilotName
      });
      return recomputeDerivedInference({
        row,
        settings,
        namesById,
        cacheKey: derivedKey,
        debugLog: logDebug
      });
    };

    const resolveNamesSafely = async (
      ids: number[],
      onRetry: (scope: string) => (info: { status: number; attempt: number; delayMs: number }) => void
    ) => {
      if (ids.length === 0) {
        return new Map<number, string>();
      }
      try {
        const namesById = await resolveUniverseNames(ids, abortController.signal, onRetry("ESI names"));
        logDebug("Universe names resolved", { count: namesById.size });
        return namesById;
      } catch {
        logDebug("Universe names resolution failed; continuing without labels.");
        return new Map<number, string>();
      }
    };

    const processPilot = async (
      entry: ParsedPilotInput,
      characterId: number,
      onRetry: (scope: string) => (info: { status: number; attempt: number; delayMs: number }) => void
    ) => {
      try {
        const [character, kills, losses, zkillStats] = await Promise.all([
          fetchCharacterPublic(characterId, abortController.signal, onRetry("ESI character")),
          fetchRecentKills(characterId, settings.lookbackDays, abortController.signal, onRetry("zKill kills")),
          fetchRecentLosses(characterId, settings.lookbackDays, abortController.signal, onRetry("zKill losses")),
          fetchCharacterStats(characterId, abortController.signal, onRetry("zKill stats"))
        ]);

        if (cancelled) {
          return;
        }

        let inferenceKills = kills;
        let inferenceLosses = losses;
        if (kills.length === 0) {
          inferenceKills = await fetchLatestKills(characterId, abortController.signal, onRetry("zKill latest kills"));
        }
        if (losses.length === 0) {
          inferenceLosses = await fetchLatestLosses(
            characterId,
            abortController.signal,
            onRetry("zKill latest losses")
          );
        }
        if (kills.length === 0 || losses.length === 0) {
          logDebug("Fallback zKill inference window used", {
            pilot: entry.pilotName,
            characterId,
            fallbackKills: inferenceKills.length,
            fallbackLosses: inferenceLosses.length
          });
        }
        logDebug("Fetched zKill data", {
          pilot: entry.pilotName,
          characterId,
          kills: kills.length,
          losses: losses.length,
          zkillStats: Boolean(zkillStats)
        });

        const stageOneIds = [
          ...collectShipTypeIdsForNaming(inferenceKills, inferenceLosses, characterId),
          ...collectItemTypeIds(inferenceLosses),
          character.corporation_id,
          character.alliance_id
        ].filter((value): value is number => Number.isFinite(value));
        const stageOneNames = await resolveNamesSafely(stageOneIds, onRetry);

        const stageOneRow: PilotCard = {
          parsedEntry: entry,
          status: "ready",
          fetchPhase: "enriching",
          characterId,
          characterName: character.name,
          corporationId: character.corporation_id,
          corporationName: stageOneNames.get(character.corporation_id),
          allianceId: character.alliance_id,
          allianceName: character.alliance_id ? stageOneNames.get(character.alliance_id) : undefined,
          securityStatus: character.security_status,
          stats: mergePilotStats({
            derived: derivePilotStats(characterId, kills, losses),
            zkillStats
          }),
          predictedShips: [],
          fitCandidates: [],
          kills,
          losses,
          inferenceKills,
          inferenceLosses
        };

        const stageOneDerived = await loadDerivedInference(stageOneRow, stageOneNames);
        await ensureExplicitShipTypeId(stageOneDerived.predictedShips, entry, abortController.signal, onRetry, logDebug);
        updatePilotCard(entry.pilotName, {
          ...stageOneRow,
          predictedShips: stageOneDerived.predictedShips,
          fitCandidates: stageOneDerived.fitCandidates,
          cynoRisk: stageOneDerived.cynoRisk
        });
        logDebug("Pilot stage 1 ready", {
          pilot: entry.pilotName,
          predicted: stageOneDerived.predictedShips.length
        });

        const [deepKills, deepLosses] = await Promise.all([
          fetchLatestKillsPaged(characterId, DEEP_HISTORY_MAX_PAGES, abortController.signal, onRetry("zKill deep kills")),
          fetchLatestLossesPaged(
            characterId,
            DEEP_HISTORY_MAX_PAGES,
            abortController.signal,
            onRetry("zKill deep losses")
          )
        ]);
        if (cancelled) {
          return;
        }

        const mergedInferenceKills = mergeKillmailLists(inferenceKills, deepKills);
        const mergedInferenceLosses = mergeKillmailLists(inferenceLosses, deepLosses);
        logDebug("Pilot deep history merged", {
          pilot: entry.pilotName,
          inferenceKills: mergedInferenceKills.length,
          inferenceLosses: mergedInferenceLosses.length
        });

        const stageTwoIds = [
          ...collectShipTypeIdsForNaming(mergedInferenceKills, mergedInferenceLosses, characterId),
          ...collectItemTypeIds(mergedInferenceLosses),
          character.corporation_id,
          character.alliance_id
        ].filter((value): value is number => Number.isFinite(value));
        const stageTwoNames = await resolveNamesSafely(stageTwoIds, onRetry);
        const stageTwoRow: PilotCard = {
          ...stageOneRow,
          fetchPhase: "ready",
          corporationName: stageTwoNames.get(character.corporation_id),
          allianceName: character.alliance_id ? stageTwoNames.get(character.alliance_id) : undefined,
          inferenceKills: mergedInferenceKills,
          inferenceLosses: mergedInferenceLosses
        };
        const stageTwoDerived = await loadDerivedInference(stageTwoRow, stageTwoNames);
        await ensureExplicitShipTypeId(stageTwoDerived.predictedShips, entry, abortController.signal, onRetry, logDebug);
        updatePilotCard(entry.pilotName, {
          ...stageTwoRow,
          predictedShips: stageTwoDerived.predictedShips,
          fitCandidates: stageTwoDerived.fitCandidates,
          cynoRisk: stageTwoDerived.cynoRisk
        });
        logDebug("Pilot stage 2 ready", {
          pilot: entry.pilotName,
          predicted: stageTwoDerived.predictedShips.length,
          fits: stageTwoDerived.fitCandidates.length
        });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        const reason = extractErrorMessage(error);
        console.error(`Pilot intel fetch failed for ${entry.pilotName}`, error);
        logDebug("Pilot fetch failed", { pilot: entry.pilotName, error: reason });
        updatePilotCard(entry.pilotName, createErrorCard(entry, `Failed to fetch pilot intel: ${reason}`));
      }
    };

    (async () => {
      const onRetry = (scope: string) => (info: { status: number; attempt: number; delayMs: number }) => {
        setNetworkNotice(
          `${scope}: rate-limited/retryable response (${info.status}), retry ${info.attempt} in ${info.delayMs}ms`
        );
      };

      const names = parseResult.entries.map((entry) => entry.pilotName);
      logDebug("Starting intel pipeline", {
        pilots: names,
        lookbackDays: settings.lookbackDays,
        topShips: TOP_SHIP_CANDIDATES
      });
      let idMap = new Map<string, number>();
      let idResolveError: string | null = null;
      try {
        idMap = await resolveCharacterIds(names, abortController.signal, onRetry("ESI IDs"));
        logDebug("ESI IDs resolved", { resolved: idMap.size, requested: names.length });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        idResolveError = extractErrorMessage(error);
        console.error("ESI IDs lookup failed", error);
        setNetworkNotice(`ESI IDs lookup failed: ${idResolveError}`);
        logDebug("ESI IDs failed", { error: idResolveError });
      }

      const unresolved = parseResult.entries.filter((entry) => !idMap.get(entry.pilotName.toLowerCase()));
      for (const entry of unresolved) {
        logDebug("Pilot unresolved in ESI IDs", { pilot: entry.pilotName });
        updatePilotCard(
          entry.pilotName,
          createErrorCard(
            entry,
            idResolveError ? `Character unresolved (ESI IDs error: ${idResolveError})` : "Character not found in ESI."
          )
        );
      }

      const tasks = parseResult.entries
        .map((entry) => ({ entry, characterId: idMap.get(entry.pilotName.toLowerCase()) }))
        .filter((item): item is { entry: ParsedPilotInput; characterId: number } => Boolean(item.characterId))
        .map((item) => processPilot(item.entry, item.characterId, onRetry));

      await Promise.allSettled(tasks);
      if (!cancelled) {
        logDebug("Pipeline complete", {
          pilots: parseResult.entries.length,
          unresolved: unresolved.length
        });
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [parseResult.entries, settings.lookbackDays]);

  return (
    <main className={`app${isDesktopApp ? " desktop-shell" : ""}`}>
      <ConstellationBackground />
      {isDesktopApp ? <div className="window-drag-region" aria-hidden="true" /> : null}
      <textarea
        ref={pasteTrapRef}
        aria-hidden="true"
        className="paste-trap"
        tabIndex={-1}
        onPaste={(event) => {
          const text = event.clipboardData?.getData("text");
          if (text) {
            applyPaste(text);
          }
        }}
      />

      <header className="toolbar">
        <h1>EVE Intel Browser</h1>
        {isDesktopApp ? (
          <div className="window-controls">
            <button
              type="button"
              className="window-btn"
              aria-label="Minimize"
              title="Minimize"
              onClick={() => void window.eveIntelDesktop?.minimizeWindow()}
            >
              _
            </button>
            <button
              type="button"
              className="window-btn"
              aria-label={isWindowMaximized ? "Restore" : "Maximize"}
              title={isWindowMaximized ? "Restore" : "Maximize"}
              onClick={() => void window.eveIntelDesktop?.toggleMaximizeWindow()}
            >
              {isWindowMaximized ? "❐" : "□"}
            </button>
            <button
              type="button"
              className="window-btn window-btn-close"
              aria-label="Close"
              title="Close"
              onClick={() => void window.eveIntelDesktop?.closeWindow()}
            >
              ×
            </button>
          </div>
        ) : null}
      </header>

      {networkNotice ? <p className="notice notice-inline">{networkNotice}</p> : null}

      {pilotCards.length === 0 ? (
        <section className="empty">
          <p>
            Try pasting one pilot per line, for example{" "}
            <span className="inline-example">Bad Player</span> or{" "}
            <span className="inline-example">BadPlayer (Venture)</span>.
          </p>
        </section>
      ) : (
        <>
          {pilotCards.length > 1 ? (
            <section className="fleet-summary">
              <div className="fleet-summary-header">
                <h4>Fleet Summary</h4>
                <button
                  type="button"
                  className="fleet-copy-button"
                  disabled={copyableFleetCount === 0}
                  onClick={async () => {
                    const lines = pilotCards
                      .filter((pilot) => Number.isFinite(pilot.characterId))
                      .map((pilot) => {
                        return pilot.characterName ?? pilot.parsedEntry.pilotName;
                      });
                    if (lines.length === 0) {
                      setNetworkNotice("No resolved character IDs to copy.");
                      return;
                    }
                    try {
                      await navigator.clipboard.writeText(lines.join("\n"));
                      setNetworkNotice(`Copied ${lines.length} pilot link(s) to clipboard.`);
                      logDebug("Fleet summary copied to clipboard", { count: lines.length });
                    } catch (error) {
                      setNetworkNotice(`Clipboard copy failed: ${extractErrorMessage(error)}`);
                    }
                  }}
                >
                  Copy to Clipboard
                </button>
              </div>
              <ul className="fleet-summary-list">
                {pilotCards.map((pilot) => {
                  const detailAnchorId = pilotDetailAnchorId(pilot);
                  const topShip = pilot.predictedShips[0];
                  const topFit = topShip?.shipTypeId
                    ? pilot.fitCandidates.find((entry) => entry.shipTypeId === topShip.shipTypeId)
                    : undefined;
                  const shipHref = topFit?.sourceLossKillmailId
                    ? `https://zkillboard.com/kill/${topFit.sourceLossKillmailId}/`
                    : undefined;
                  const topShipCyno = topShip ? shipHasPotentialCyno(topShip) : false;
                  const isFetching = isPilotFetching(pilot);
                  return (
                    <li
                      className={`fleet-summary-line fleet-summary-grid${topShipCyno ? " cyno-highlight" : ""}`}
                      key={`summary-${pilot.parsedEntry.pilotName.toLowerCase()}`}
                      onClick={(event) => {
                        const target = event.target as HTMLElement;
                        if (target.closest("a, button")) {
                          return;
                        }
                        const detail = document.getElementById(detailAnchorId);
                        if (detail) {
                          smoothScrollToElement(detail, FAST_SCROLL_DURATION_MS);
                        }
                      }}
                    >
                      <span className="fleet-col fleet-col-pilot">
                        {pilot.characterId ? (
                          <a
                            href={`https://zkillboard.com/character/${pilot.characterId}/`}
                            target="_blank"
                            rel="noreferrer"
                            className="fleet-summary-avatar-link"
                          >
                            <img
                              src={`https://images.evetech.net/characters/${pilot.characterId}/portrait?size=64`}
                              alt={pilot.parsedEntry.pilotName}
                              className="fleet-summary-avatar"
                            />
                          </a>
                        ) : (
                          <span className="fleet-summary-avatar-fallback">
                            {pilot.parsedEntry.pilotName.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className={`fleet-efficiency ${threatClass(pilot.stats?.danger)}`}>
                          {threatScore(pilot.stats?.danger)}
                        </span>
                        {pilot.characterId ? (
                          <a
                            href={`https://zkillboard.com/character/${pilot.characterId}/`}
                            target="_blank"
                            rel="noreferrer"
                            className="fleet-summary-name"
                          >
                            {pilot.characterName ?? pilot.parsedEntry.pilotName}
                          </a>
                        ) : (
                          <span className="fleet-summary-name">{pilot.characterName ?? pilot.parsedEntry.pilotName}</span>
                        )}
                      </span>
                      <span className="fleet-col">
                        {pilot.corporationId ? (
                          <a
                            href={`https://zkillboard.com/corporation/${pilot.corporationId}/`}
                            target="_blank"
                            rel="noreferrer"
                            className="fleet-summary-link"
                          >
                            {pilot.corporationName ?? `Corp ${pilot.corporationId}`}
                          </a>
                        ) : (
                          <span className="fleet-summary-muted">No corp</span>
                        )}
                      </span>
                      <span className="fleet-col">
                        {pilot.allianceId ? (
                          <a
                            href={`https://zkillboard.com/alliance/${pilot.allianceId}/`}
                            target="_blank"
                            rel="noreferrer"
                            className="fleet-summary-link"
                          >
                            {pilot.allianceName ?? `Alliance ${pilot.allianceId}`}
                          </a>
                        ) : (
                          <span className="fleet-summary-muted">No alliance</span>
                        )}
                      </span>
                      <span className="fleet-col fleet-col-ship">
                        {topShip ? (
                          <>
                            <img
                              src={
                                topShip.shipTypeId
                                  ? `https://images.evetech.net/types/${topShip.shipTypeId}/icon?size=64`
                                  : "https://images.evetech.net/types/587/icon?size=64"
                              }
                              alt={topShip.shipName}
                              className="ship-icon"
                              loading="lazy"
                            />
                            {shipHref ? (
                              <a href={shipHref} target="_blank" rel="noreferrer" className="fleet-summary-ship">
                                {topShip.shipName} {topShip.probability}%
                              </a>
                            ) : (
                              <span className="fleet-summary-ship">{topShip.shipName} {topShip.probability}%</span>
                            )}
                          </>
                        ) : (
                          <span className="fleet-summary-muted">No inferred ship</span>
                        )}
                      </span>
                      <span className="fleet-col fleet-col-alerts">
                        {topShip ? renderShipPills(topShip, pilot.cynoRisk, "icon") : null}
                      </span>
                      <span className={`fetch-progress-line${isFetching ? " active" : ""}`} aria-hidden="true" />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          <section className="cards">
            {pilotCards.map((pilot) => (
              <article
                className="pilot-card"
                id={pilotDetailAnchorId(pilot)}
                key={pilot.parsedEntry.pilotName.toLowerCase()}
              >
              <div className={`player-card ${threatClass(pilot.stats?.danger)}`}>
                <div
                  className={`fetch-progress-line detail-progress${isPilotFetching(pilot) ? " active" : ""}`}
                  aria-hidden="true"
                />
                <div className="player-card-header">
                  <div className="player-avatar" aria-hidden="true">
                    {pilot.characterId ? (
                      <img
                        src={`https://images.evetech.net/characters/${pilot.characterId}/portrait?size=64`}
                        alt={pilot.parsedEntry.pilotName}
                        className="player-avatar-img avatar-img"
                      />
                    ) : (
                      pilot.parsedEntry.pilotName.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="player-info">
                    <h2 className="player-name">
                      {pilot.characterId ? (
                        <a
                          href={`https://zkillboard.com/character/${pilot.characterId}/`}
                          target="_blank"
                          rel="noreferrer"
                          className="player-link"
                        >
                          {pilot.characterName ?? pilot.parsedEntry.pilotName}
                        </a>
                      ) : (
                        pilot.parsedEntry.pilotName
                      )}
                    </h2>
                    <div className="player-affiliations">
                      {pilot.corporationId ? (
                        <>
                          <div className="corporation">
                            <a
                              href={`https://zkillboard.com/corporation/${pilot.corporationId}/`}
                              target="_blank"
                              rel="noreferrer"
                              className="corp-link"
                            >
                              <img
                                src={`https://images.evetech.net/corporations/${pilot.corporationId}/logo?size=64`}
                                alt={pilot.corporationName ?? "Corporation"}
                                className="corp-logo"
                              />
                              <span className="affiliation-row">
                                <span className="corp-name">
                                  {pilot.corporationName ?? `Corp ${pilot.corporationId}`}
                                </span>
                              </span>
                            </a>
                          </div>
                          {pilot.allianceId ? (
                            <span className="affiliation-item">
                              <a
                                href={`https://zkillboard.com/alliance/${pilot.allianceId}/`}
                                target="_blank"
                                rel="noreferrer"
                                className="corp-link"
                              >
                                <img
                                  src={`https://images.evetech.net/alliances/${pilot.allianceId}/logo?size=64`}
                                  alt={pilot.allianceName ?? "Alliance"}
                                  className="affiliation-logo"
                                />
                                <span>{pilot.allianceName ?? `Alliance ${pilot.allianceId}`}</span>
                              </a>
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span>{pilot.error ?? "Corp/Alliance pending ESI lookup"}</span>
                      )}
                    </div>
                  </div>
                  <div className={`threat-indicator ${threatClass(pilot.stats?.danger)}`}>
                    <div className="threat-score">
                      {pilot.status === "ready" ? threatScore(pilot.stats?.danger) : pilot.status.toUpperCase()}
                    </div>
                    <div className="threat-label">{threatLabel(pilot.stats?.danger)}</div>
                  </div>
                </div>
                <div className="player-card-body">
                  <div className="stats-container">
                    <div className="stats-column">
                      <div className="stat-row"><span className="stat-label">Kills:</span><span className="stat-value">{pilot.stats?.kills ?? "-"}</span></div>
                      <div className="stat-row"><span className="stat-label">Losses:</span><span className="stat-value">{pilot.stats?.losses ?? "-"}</span></div>
                      <div className="stat-row"><span className="stat-label">K/D Ratio:</span><span className="stat-value">{formatRatio(pilot.stats?.kdRatio)}</span></div>
                      <div className="stat-row"><span className="stat-label">Solo:</span><span className="stat-value">{pilot.stats?.solo ?? "-"}</span></div>
                      <div className="stat-row"><span className="stat-label">Security:</span><span className="stat-value">{pilot.securityStatus !== undefined ? pilot.securityStatus.toFixed(1) : "-"}</span></div>
                    </div>
                    <div className="stats-column">
                      <div className="stat-row"><span className="stat-label">ISK Destroyed:</span><span className="stat-value">{formatIsk(pilot.stats?.iskDestroyed)}</span></div>
                      <div className="stat-row"><span className="stat-label">ISK Lost:</span><span className="stat-value">{formatIsk(pilot.stats?.iskLost)}</span></div>
                      <div className="stat-row"><span className="stat-label">ISK Ratio:</span><span className="stat-value">{formatRatio(pilot.stats?.iskRatio)}</span></div>
                      <div className="stat-row"><span className="stat-label">Solo Ratio:</span><span className="stat-value">{pilot.stats ? `${pilot.stats.soloRatio}%` : "-"}</span></div>
                      <div className="stat-row"><span className="stat-label">Danger:</span><span className="stat-value">{pilot.stats ? `${pilot.stats.danger}%` : "-"}</span></div>
                    </div>
                  </div>
                </div>
                <div className="player-card-footer">
                  {pilot.characterId ? (
                    <a href={`https://zkillboard.com/character/${pilot.characterId}/`} target="_blank" rel="noreferrer" className="zkill-link">
                      View on zKillboard
                    </a>
                  ) : <span className="zkill-link">zKill unavailable</span>}
                </div>
                <section className="ship-summary-row">
                  <h4>Ship Summary</h4>
                  <ul className="ship-summary-list">
                    {pilot.predictedShips.length > 0 ? (
                      pilot.predictedShips.map((ship) => {
                        const rowCyno = shipHasPotentialCyno(ship);
                        return (
                          <li
                            className={rowCyno ? "cyno-highlight" : undefined}
                            key={`${pilot.parsedEntry.pilotName}-summary-${ship.shipName}-${ship.probability}`}
                          >
                            <img
                              src={
                                ship.shipTypeId
                                  ? `https://images.evetech.net/types/${ship.shipTypeId}/icon?size=64`
                                  : "https://images.evetech.net/types/587/icon?size=64"
                              }
                              alt={ship.shipName}
                              className="ship-icon"
                              loading="lazy"
                            />
                            <span className="ship-summary-name">{ship.shipName}</span>
                            <span className="ship-summary-prob">{ship.probability}%</span>
                            {renderShipPills(ship, pilot.cynoRisk)}
                          </li>
                        );
                      })
                    ) : (
                      <li className="ship-summary-empty">No ships inferred yet.</li>
                    )}
                  </ul>
                </section>
              </div>
              <aside className="ship-column">
                <h3>Likely Ships</h3>
                <p className="ship-meta">
                  Parse: {(pilot.parsedEntry.parseConfidence * 100).toFixed(0)}% ({pilot.parsedEntry.shipSource})
                </p>
                {(() => {
                  const softPotentialCyno = pilot.predictedShips.some(
                    (ship) => Boolean(ship.cynoCapable) && ship.probability > 20
                  );
                  const aggregateRolePills = orderRolePills(
                    Array.from(new Set(pilot.predictedShips.flatMap((ship) => ship.rolePills ?? [])))
                  );
                  return (
                <div className="risk-row">
                      {pilot.cynoRisk?.potentialCyno ? (
                        <span className="risk-badge risk-cyno">Potential Cyno</span>
                      ) : softPotentialCyno ? (
                        <span className="risk-badge risk-cyno-soft">Potential Cyno</span>
                      ) : null}
                  {pilot.cynoRisk?.jumpAssociation ? <span className="risk-badge risk-bait">Bait</span> : null}
                  {aggregateRolePills.map((role) => (
                    <span key={`${pilot.parsedEntry.pilotName}-risk-${role}`} className={`risk-badge ${roleBadgeClass(role)}`}>
                      {role}
                    </span>
                  ))}
                </div>
                  );
                })()}
                <ul>
                  {pilot.predictedShips.length > 0 ? (
                    pilot.predictedShips.slice(0, DETAIL_FIT_CANDIDATES).map((ship) => {
                      const fit = ship.shipTypeId
                        ? pilot.fitCandidates.find((entry) => entry.shipTypeId === ship.shipTypeId)
                        : undefined;
                      const rowCyno = shipHasPotentialCyno(ship);
                      const eft = formatFitAsEft(ship.shipName, fit);
                      const shipNameLower = ship.shipName.toLowerCase();
                      const isCapsuleLike = shipNameLower.includes("capsule") || shipNameLower.includes("pod");
                      const canCopyEft = Boolean(fit) && !isCapsuleLike;
                      const killmailHref = fit?.sourceLossKillmailId
                        ? `https://zkillboard.com/kill/${fit.sourceLossKillmailId}/`
                        : undefined;
                      return (
                        <li
                          className={rowCyno ? "cyno-highlight" : undefined}
                          key={`${pilot.parsedEntry.pilotName}-${ship.shipName}-${ship.probability}`}
                        >
                          <span className="ship-main">
                            <span className="ship-title-row">
                              {killmailHref ? (
                                <a href={killmailHref} target="_blank" rel="noreferrer" className="ship-link">
                                  <img
                                    src={
                                      ship.shipTypeId
                                        ? `https://images.evetech.net/types/${ship.shipTypeId}/icon?size=64`
                                        : "https://images.evetech.net/types/587/icon?size=64"
                                    }
                                    alt={ship.shipName}
                                    className="ship-icon"
                                    loading="lazy"
                                  />
                                  <span>{ship.shipName}</span>
                                </a>
                              ) : (
                                <>
                                  <img
                                    src={
                                      ship.shipTypeId
                                        ? `https://images.evetech.net/types/${ship.shipTypeId}/icon?size=64`
                                        : "https://images.evetech.net/types/587/icon?size=64"
                                    }
                                    alt={ship.shipName}
                                    className="ship-icon"
                                    loading="lazy"
                                  />
                                  <span>{ship.shipName}</span>
                                </>
                              )}
                              {ship.cynoCapable ? (
                                <>
                                  <span className="ship-cyno-pill">Cyno Capable</span>
                                  <span className="ship-cyno-chance">{ship.cynoChance ?? 0}% cyno</span>
                                </>
                              ) : null}
                              {renderShipPills(ship, pilot.cynoRisk)}
                            </span>
                            <pre className="ship-eft">{eft}</pre>
                            {canCopyEft ? (
                              <button
                                type="button"
                                className="fit-copy-button"
                                onClick={() => {
                                  void navigator.clipboard?.writeText(eft);
                                }}
                              >
                                Copy EFT
                              </button>
                            ) : null}
                          </span>
                          <strong>{ship.probability}%</strong>
                        </li>
                      );
                    })
                  ) : (
                    <li>
                      <span>{pilot.status === "error" ? "No data" : "Waiting for zKill inference"}</span>
                      <strong>-</strong>
                    </li>
                  )}
                </ul>
              </aside>
            </article>
            ))}
          </section>
        </>
      )}

      <section className="raw">
        <h3>Last Clipboard Payload</h3>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            applyPaste(manualEntry);
          }}
          className="manual-entry-form"
        >
          <textarea
            className="manual-entry-input"
            value={manualEntry}
            placeholder="Paste or type pilot names here..."
            onChange={(event) => setManualEntry(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                applyPaste(manualEntry);
              }
            }}
          />
          <button type="submit" className="manual-entry-submit">Submit</button>
        </form>
      </section>
      <section className="raw controls-panel">
        <div className="controls-panel-row">
          <button
            type="button"
            className="settings-button"
            onClick={async () => {
              await clearIntelCache();
              logDebug("Cache wiped by user");
              setNetworkNotice("Cache wiped.");
              const payload = (lastPasteRaw || manualEntry).trim();
              if (payload) {
                applyPaste(payload);
              } else {
                setPilotCards([]);
              }
            }}
          >
            Wipe Cache
          </button>
          <label className="bottom-debug-toggle">
            <input
              type="checkbox"
              checked={debugEnabled}
              onChange={(event) => setDebugEnabled(event.target.checked)}
            />
            Debug logging
          </label>
        </div>
      </section>
      {debugEnabled ? (
        <section className="raw" ref={debugSectionRef}>
          <h3>Debug Log</h3>
          <pre>{debugLines.length > 0 ? debugLines.join("\n") : "(no events yet)"}</pre>
        </section>
      ) : null}
      <footer className="app-version">v{APP_VERSION}</footer>
    </main>
  );
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createErrorCard(entry: ParsedPilotInput, error: string): PilotCard {
  return {
    parsedEntry: entry,
    status: "error",
    fetchPhase: "error",
    error,
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: []
  };
}

function mergeKillmailLists(primary: ZkillKillmail[], secondary: ZkillKillmail[]): ZkillKillmail[] {
  const map = new Map<number, ZkillKillmail>();
  for (const row of [...primary, ...secondary]) {
    map.set(row.killmail_id, row);
  }
  return [...map.values()].sort((a, b) => Date.parse(b.killmail_time) - Date.parse(a.killmail_time));
}

function isPilotFetching(pilot: PilotCard): boolean {
  return pilot.status === "loading" || pilot.fetchPhase === "enriching";
}

async function ensureExplicitShipTypeId(
  predictedShips: ShipPrediction[],
  parsedEntry: ParsedPilotInput,
  signal: AbortSignal,
  onRetry: (scope: string) => (info: { status: number; attempt: number; delayMs: number }) => void,
  logDebug: (message: string, data?: unknown) => void
): Promise<void> {
  const explicitName = parsedEntry.explicitShip?.trim();
  if (!explicitName) {
    return;
  }

  const explicitRow = predictedShips.find((row) => row.source === "explicit");
  if (!explicitRow || explicitRow.shipTypeId) {
    return;
  }

  try {
    const typeId = await resolveInventoryTypeIdByName(explicitName, signal, onRetry("ESI type search"));
    if (typeId) {
      explicitRow.shipTypeId = typeId;
      logDebug("Explicit ship type resolved via ESI search", {
        pilot: parsedEntry.pilotName,
        ship: explicitName,
        typeId
      });
    } else {
      logDebug("Explicit ship type unresolved; icon fallback will be used", {
        pilot: parsedEntry.pilotName,
        ship: explicitName
      });
    }
  } catch (error) {
    logDebug("Explicit ship type lookup failed; icon fallback will be used", {
      pilot: parsedEntry.pilotName,
      ship: explicitName,
      error: extractErrorMessage(error)
    });
  }
}

function buildDerivedInferenceKey(params: {
  characterId: number;
  lookbackDays: number;
  topShips: number;
  explicitShip?: string;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
}): string {
  const killHead = params.kills.slice(0, 8).map((k) => k.killmail_id).join(",");
  const lossHead = params.losses.slice(0, 8).map((l) => l.killmail_id).join(",");
  return [
    "derived.inference.v6",
    params.characterId,
    params.lookbackDays,
    params.topShips,
    params.explicitShip ?? "-",
    killHead,
    lossHead
  ].join("|");
}

async function recomputeDerivedInference(params: {
  row: PilotCard;
  settings: Settings;
  namesById: Map<number, string>;
  cacheKey: string;
  debugLog?: (message: string, data?: unknown) => void;
}): Promise<DerivedInference> {
  const predictedShips = deriveShipPredictions({
    parsedEntry: params.row.parsedEntry,
    characterId: params.row.characterId!,
    kills: params.row.inferenceKills,
    losses: params.row.inferenceLosses,
    lookbackDays: params.settings.lookbackDays,
    topShips: TOP_SHIP_CANDIDATES,
    shipNamesByTypeId: params.namesById
  });
  const fitCandidates = deriveFitCandidates({
    characterId: params.row.characterId!,
    losses: params.row.inferenceLosses,
    predictedShips,
    itemNamesByTypeId: params.namesById
  });
  const cynoRisk = evaluateCynoRisk({
    predictedShips,
    characterId: params.row.characterId!,
    kills: params.row.inferenceKills,
    losses: params.row.inferenceLosses,
    namesByTypeId: params.namesById
  });
  const cynoByShip = estimateShipCynoChance({
    predictedShips,
    characterId: params.row.characterId!,
    losses: params.row.inferenceLosses,
    namesByTypeId: params.namesById
  });
  const rolePillsByShip = deriveShipRolePills({
    predictedShips,
    fitCandidates,
    losses: params.row.inferenceLosses,
    characterId: params.row.characterId!,
    namesByTypeId: params.namesById,
    onEvidence: (shipName, evidence) => {
      if (evidence.length === 0) {
        return;
      }
      params.debugLog?.("Role pill evidence", {
        pilot: params.row.parsedEntry.pilotName,
        ship: shipName,
        evidence: evidence.map((row) => ({
          role: row.role,
          source: row.source,
          moduleOrReason: row.details,
          killmailId: row.killmailId
        }))
      });
    }
  });
  const predictedShipsWithCyno = predictedShips.map((ship) => {
    const cyno = cynoByShip.get(ship.shipName);
    const rolePills = rolePillsByShip.get(ship.shipName) ?? [];
    return {
      ...ship,
      cynoCapable: cyno?.cynoCapable ?? false,
      cynoChance: cyno?.cynoChance ?? 0,
      rolePills
    };
  });

  const derived: DerivedInference = {
    predictedShips: predictedShipsWithCyno,
    fitCandidates,
    cynoRisk
  };
  await setCachedAsync(params.cacheKey, derived, 1000 * 60 * 15, 1000 * 60 * 5);
  return derived;
}

function isDerivedInferenceUsable(
  value: DerivedInference,
  explicitShip?: string
): boolean {
  if (!value || !Array.isArray(value.predictedShips) || !Array.isArray(value.fitCandidates) || !value.cynoRisk) {
    return false;
  }
  if (!explicitShip) {
    return true;
  }
  return value.predictedShips.some((ship) => ship.shipName === explicitShip);
}

function formatIsk(value?: number): string {
  if (value === undefined) {
    return "-";
  }

  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}b`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}m`;
  }
  return `${Math.round(value)}`;
}

function formatRatio(value?: number): string {
  if (value === undefined) {
    return "-";
  }
  return value.toFixed(2);
}

function threatScore(danger?: number): string {
  if (danger === undefined) {
    return "-";
  }
  return (danger / 10).toFixed(1);
}

function threatLabel(danger?: number): string {
  if (danger === undefined) {
    return "N/A";
  }
  if (danger >= 70) {
    return "HIGH";
  }
  if (danger >= 40) {
    return "MED";
  }
  return "LOW";
}

function threatClass(danger?: number): string {
  if (danger === undefined) {
    return "";
  }
  if (danger >= 70) {
    return "threat-high";
  }
  if (danger >= 40) {
    return "threat-medium";
  }
  return "threat-low";
}

function isLikelyBaitHullName(name: string): boolean {
  return (
    name === "Devoter" ||
    name === "Onyx" ||
    name === "Broadsword" ||
    name === "Phobos" ||
    name === "Praxis" ||
    name === "Abaddon" ||
    name === "Raven" ||
    name === "Hyperion" ||
    name === "Maelstrom"
  );
}

function getShipRiskFlags(ship: ShipPrediction, cynoRisk?: CynoRisk): ShipRiskFlags {
  const normalized = ship.shipName.toLowerCase();
  const isPod = normalized.includes("capsule") || normalized.includes("pod");
  const hardCyno = Boolean(ship.cynoCapable) && (ship.cynoChance ?? 0) >= 50;
  const softCyno = Boolean(ship.cynoCapable) && !hardCyno && ship.probability > 20;
  const bait =
    !isPod &&
    ship.probability >= 20 &&
    Boolean(cynoRisk?.jumpAssociation) &&
    (Boolean(ship.cynoCapable) || isLikelyBaitHullName(ship.shipName));

  return { hardCyno, softCyno, bait };
}

function shipHasPotentialCyno(ship: ShipPrediction): boolean {
  return Boolean(ship.cynoCapable) && (ship.cynoChance ?? 0) > 30;
}

function renderShipPills(
  ship: ShipPrediction,
  cynoRisk?: CynoRisk,
  mode: "pill" | "icon" = "pill"
) {
  const flags = getShipRiskFlags(ship, cynoRisk);
  const elements = [];

  if (flags.bait) {
    elements.push(
      <span key={`${ship.shipName}-pill-bait`} className="risk-badge risk-bait">Bait</span>
    );
  }

  if (flags.hardCyno) {
    elements.push(
      mode === "icon" ? (
        <img
          key={`${ship.shipName}-pill-cyno`}
          src={`https://images.evetech.net/types/${CYNO_ICON_TYPE_ID}/icon?size=64`}
          className="alert-icon-img alert-cyno"
          title="Potential Cyno"
          aria-label="Potential Cyno"
          alt="Potential Cyno"
          loading="lazy"
        />
      ) : (
        <span key={`${ship.shipName}-pill-cyno`} className="risk-badge risk-cyno">Potential Cyno</span>
      )
    );
  } else if (flags.softCyno) {
    elements.push(
      mode === "icon" ? (
        <img
          key={`${ship.shipName}-pill-cyno-soft`}
          src={`https://images.evetech.net/types/${CYNO_ICON_TYPE_ID}/icon?size=64`}
          className="alert-icon-img alert-cyno-soft"
          title="Potential Cyno"
          aria-label="Potential Cyno"
          alt="Potential Cyno"
          loading="lazy"
        />
      ) : (
        <span key={`${ship.shipName}-pill-cyno-soft`} className="risk-badge risk-cyno-soft">Potential Cyno</span>
      )
    );
  }

  for (const role of ship.rolePills ?? []) {
    const iconTypeId = ROLE_ICON_TYPE_IDS[role];
    elements.push(
      mode === "icon" ? (
        iconTypeId ? (
          <img
            key={`${ship.shipName}-pill-${role}`}
            src={`https://images.evetech.net/types/${iconTypeId}/icon?size=64`}
            className={`alert-icon-img ${roleIconClass(role)}`}
            title={role}
            aria-label={role}
            alt={role}
            loading="lazy"
          />
        ) : (
          <span
            key={`${ship.shipName}-pill-${role}`}
            className={`alert-icon ${roleIconClass(role)}`}
            title={role}
            aria-label={role}
          >
            {roleShort(role)}
          </span>
        )
      ) : (
        <span key={`${ship.shipName}-pill-${role}`} className={`risk-badge ${roleBadgeClass(role)}`}>
          {role}
        </span>
      )
    );
  }

  return elements;
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case "HIC":
    case "Bubble":
    case "Boosh":
      return "risk-role-hard";
    case "Long Point":
    case "Web":
      return "risk-role-control";
    case "Neut":
      return "risk-role-pressure";
    case "Cloaky":
      return "risk-role-stealth";
    case "Shield Logi":
    case "Armor Logi":
      return "risk-role-support";
    default:
      return "risk-role";
  }
}

function roleIconClass(role: string): string {
  switch (role) {
    case "HIC":
    case "Bubble":
    case "Boosh":
      return "alert-role-hard";
    case "Long Point":
    case "Web":
      return "alert-role-control";
    case "Neut":
      return "alert-role-pressure";
    case "Cloaky":
      return "alert-role-stealth";
    case "Shield Logi":
    case "Armor Logi":
      return "alert-role-support";
    default:
      return "alert-role";
  }
}

function roleShort(role: string): string {
  switch (role) {
    case "Long Point":
      return "LP";
    case "Web":
      return "WB";
    case "HIC":
      return "HC";
    case "Bubble":
      return "BB";
    case "Boosh":
      return "BS";
    case "Neut":
      return "NT";
    case "Cloaky":
      return "CL";
    case "Shield Logi":
      return "SL";
    case "Armor Logi":
      return "AL";
    default:
      return role.slice(0, 2).toUpperCase();
  }
}

function orderRolePills(pills: string[]): string[] {
  const order = [
    "Long Point",
    "Web",
    "HIC",
    "Bubble",
    "Boosh",
    "Neut",
    "Cloaky",
    "Shield Logi",
    "Armor Logi"
  ];
  return pills.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function mergePilotStats(params: {
  derived: PilotStats;
  zkillStats: ZkillCharacterStats | null;
}): PilotStats {
  const source = params.zkillStats;
  if (!source) {
    return params.derived;
  }

  const kills = source.kills ?? params.derived.kills;
  const losses = source.losses ?? params.derived.losses;
  const solo = source.solo ?? params.derived.solo;
  const iskDestroyed = source.iskDestroyed ?? params.derived.iskDestroyed;
  const iskLost = source.iskLost ?? params.derived.iskLost;

  return {
    kills,
    losses,
    solo,
    soloRatio: kills > 0 ? Number(((solo / kills) * 100).toFixed(1)) : 0,
    iskDestroyed,
    iskLost,
    kdRatio: losses > 0 ? Number((kills / losses).toFixed(2)) : kills > 0 ? kills : 0,
    iskRatio: iskLost > 0 ? Number((iskDestroyed / iskLost).toFixed(2)) : iskDestroyed > 0 ? iskDestroyed : 0,
    danger: kills + losses > 0 ? Number(((kills / (kills + losses)) * 100).toFixed(1)) : params.derived.danger
  };
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    void (JSON.parse(raw) as Partial<Settings>);
    return {
      lookbackDays: ZKILL_MAX_LOOKBACK_DAYS
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures; app still works with in-memory settings.
  }
}

function loadDebugEnabled(): boolean {
  try {
    return localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDebugEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(DEBUG_KEY, enabled ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
}

function pilotDetailAnchorId(pilot: PilotCard): string {
  const stableKey = pilot.characterId
    ? `char-${pilot.characterId}`
    : pilot.parsedEntry.pilotName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `pilot-detail-${stableKey}`;
}

function smoothScrollToElement(element: HTMLElement, durationMs: number): void {
  const startY = window.scrollY;
  const targetY = startY + element.getBoundingClientRect().top;
  const delta = targetY - startY;
  if (Math.abs(delta) < 2) {
    return;
  }

  const start = performance.now();
  const duration = Math.max(40, durationMs);
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    window.scrollTo(0, startY + delta * easeOutCubic(progress));
    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
}
