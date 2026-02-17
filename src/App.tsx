import { useEffect, useRef, useState } from "react";
import { ZKILL_MAX_LOOKBACK_DAYS } from "./lib/api/zkill";
import { clearIntelCache } from "./lib/cache";
import type { CynoRisk } from "./lib/cyno";
import {
  type FitCandidate,
  type ShipPrediction
} from "./lib/intel";
import { formatFitAsEft } from "./lib/eft";
import { parseClipboardText } from "./lib/parser";
import { buildDogmaIndex, type DogmaIndex } from "./lib/dogma/index";
import { loadDogmaData } from "./lib/dogma/loader";
import type { ParseResult, Settings } from "./types";
import { ConstellationBackground } from "./components/ConstellationBackground";
import { useDesktopBridge } from "./lib/useDesktopBridge";
import {
  loadDebugEnabled,
  loadSettings,
  persistDebugEnabled,
  persistSettings
} from "./lib/settings";
import { usePilotIntelPipeline, type PilotCard } from "./lib/usePilotIntelPipeline";
import { createFitMetricsResolver, type FitMetricResult } from "./lib/useFitMetrics";
import {
  formatEhp,
  formatIsk,
  formatRange,
  formatRatio,
  formatSpeedRange,
  orderRolePills,
  roleBadgeClass,
  shipHasPotentialCyno,
  threatClass,
  threatLabel,
  threatScore,
  toPct
} from "./lib/presentation";
import { formatUpdaterStatus, renderResistCell, renderShipPills } from "./lib/ui";
import {
  aggregatePilotProgress,
  extractErrorMessage,
  pilotDetailAnchorId,
  safeStringify,
  smoothScrollToElement
} from "./lib/appUtils";

const APP_VERSION = import.meta.env.PACKAGE_VERSION;

const DETAIL_FIT_CANDIDATES = 3;
const FAST_SCROLL_DURATION_MS = 120;

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings(localStorage, ZKILL_MAX_LOOKBACK_DAYS));
  const [debugEnabled, setDebugEnabled] = useState<boolean>(() => loadDebugEnabled(localStorage));
  const [lastPasteAt, setLastPasteAt] = useState<string>("Never");
  const [lastPasteRaw, setLastPasteRaw] = useState<string>("");
  const [manualEntry, setManualEntry] = useState<string>("");
  const [parseResult, setParseResult] = useState<ParseResult>({ entries: [], rejected: [] });
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const [dogmaIndex, setDogmaIndex] = useState<DogmaIndex | null>(null);
  const [dogmaVersion, setDogmaVersion] = useState<string>("");
  const [dogmaLoadError, setDogmaLoadError] = useState<string>("");
  const fitMetricsResolverRef = useRef<ReturnType<typeof createFitMetricsResolver> | null>(null);
  const pasteTrapRef = useRef<HTMLTextAreaElement>(null);
  const debugSectionRef = useRef<HTMLElement>(null);

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

  const { isDesktopApp, isWindowMaximized, updaterState } = useDesktopBridge({
    applyPaste,
    logDebug
  });

  const { pilotCards, setPilotCards, networkNotice, setNetworkNotice } = usePilotIntelPipeline({
    entries: parseResult.entries,
    settings,
    dogmaIndex,
    logDebug
  });
  useEffect(() => {
    fitMetricsResolverRef.current = null;
  }, [dogmaIndex, logDebug]);
  const copyableFleetCount = pilotCards.filter((pilot) => Number.isFinite(pilot.characterId)).length;
  const globalLoadProgress = aggregatePilotProgress(pilotCards);
  const showGlobalLoad = pilotCards.length > 0 && globalLoadProgress < 1;

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
    persistSettings(localStorage, settings);
  }, [settings]);

  useEffect(() => {
    persistDebugEnabled(localStorage, debugEnabled);
  }, [debugEnabled]);

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
        logDebug("Dogma pack loaded", {
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
        logDebug("Dogma loader failed", { error: reason });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const getFitMetrics = (pilot: PilotCard, fit: FitCandidate | undefined): FitMetricResult => {
    if (!fitMetricsResolverRef.current) {
      fitMetricsResolverRef.current = createFitMetricsResolver({
        dogmaIndex,
        logDebug
      });
    }
    return fitMetricsResolverRef.current(pilot, fit);
  };

  return (
    <main className={`app${isDesktopApp ? " desktop-shell" : ""}`}>
      <ConstellationBackground />
      {isDesktopApp ? (
        <div className="window-topbar">
          <div className="window-controls" aria-hidden="true">
            <button
              type="button"
              className="window-btn"
              aria-label="Minimize"
              title="Minimize"
              onClick={() => void window.eveIntelDesktop?.minimizeWindow()}
            >
              <span className="window-icon icon-minimize" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="window-btn"
              aria-label={isWindowMaximized ? "Restore" : "Maximize"}
              title={isWindowMaximized ? "Restore" : "Maximize"}
              onClick={() => void window.eveIntelDesktop?.toggleMaximizeWindow()}
            >
              <span
                className={`window-icon ${isWindowMaximized ? "icon-restore" : "icon-maximize"}`}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className="window-btn window-btn-close"
              aria-label="Close"
              title="Close"
              onClick={() => void window.eveIntelDesktop?.closeWindow()}
            >
              <span className="window-icon icon-close" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
      {isDesktopApp ? (
        <div className={`global-load-line${showGlobalLoad ? " active" : ""}`} aria-hidden="true">
          <span className="global-load-fill" style={{ width: `${Math.round(globalLoadProgress * 100)}%` }} />
        </div>
      ) : null}
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
        <p
          style={{
            margin: 0,
            fontSize: "0.86rem",
            color: "#d7c27d",
            textAlign: "right",
            whiteSpace: "nowrap"
          }}
        >
          Like the app? Donate ISK to{" "}
          <a
            href="https://zkillboard.com/character/93227004/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#f6d77d", fontWeight: 700, textDecoration: "none" }}
          >
            Lukas Nemec
          </a>
          .
        </p>
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
                      const metrics = getFitMetrics(pilot, fit);
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
                            <div className="ship-fit-and-metrics">
                              <pre className="ship-eft">{eft}</pre>
                              {fit ? (
                                <div
                                  className={`ship-metrics ${metrics.status === "ready" && metrics.value.confidence < 60 ? "ship-metrics-low" : ""}`}
                                >
                                  {metrics.status === "ready" ? (
                                    <>
                                      <div className="ship-metrics-grid">
                                        <div className="ship-metric-tile">
                                          <span>DPS</span>
                                          <strong>{metrics.value.dpsTotal}</strong>
                                          <div className="damage-inline">
                                            <span className="damage-em">{toPct(metrics.value.damageSplit.em)}</span>
                                            <span className="damage-th">{toPct(metrics.value.damageSplit.therm)}</span>
                                            <span className="damage-ki">{toPct(metrics.value.damageSplit.kin)}</span>
                                            <span className="damage-ex">{toPct(metrics.value.damageSplit.exp)}</span>
                                          </div>
                                        </div>
                                        <div className="ship-metric-tile">
                                          <span>Alpha</span>
                                          <strong>{metrics.value.alpha}</strong>
                                        </div>
                                        <div className="ship-metric-tile ship-metric-tile-wide">
                                          <span>Range</span>
                                          <strong>
                                            O {formatRange(metrics.value.engagementRange.optimal)} + F {formatRange(metrics.value.engagementRange.falloff)} | Eff {formatRange(metrics.value.engagementRange.effectiveBand)}
                                          </strong>
                                        </div>
                                      </div>
                                      <div className="ship-ehp-block">
                                        <div className="ship-ehp-head">
                                          <span>EHP</span>
                                          <strong>{formatEhp(metrics.value.ehp)}</strong>
                                        </div>
                                        <table className="ship-resist-table">
                                          <tbody>
                                            <tr>
                                              <th scope="row">S</th>
                                              {renderResistCell(metrics.value.resists.shield.em, "damage-em")}
                                              {renderResistCell(metrics.value.resists.shield.therm, "damage-th")}
                                              {renderResistCell(metrics.value.resists.shield.kin, "damage-ki")}
                                              {renderResistCell(metrics.value.resists.shield.exp, "damage-ex")}
                                            </tr>
                                            <tr>
                                              <th scope="row">A</th>
                                              {renderResistCell(metrics.value.resists.armor.em, "damage-em")}
                                              {renderResistCell(metrics.value.resists.armor.therm, "damage-th")}
                                              {renderResistCell(metrics.value.resists.armor.kin, "damage-ki")}
                                              {renderResistCell(metrics.value.resists.armor.exp, "damage-ex")}
                                            </tr>
                                            <tr>
                                              <th scope="row">H</th>
                                              {renderResistCell(metrics.value.resists.hull.em, "damage-em")}
                                              {renderResistCell(metrics.value.resists.hull.therm, "damage-th")}
                                              {renderResistCell(metrics.value.resists.hull.kin, "damage-ki")}
                                              {renderResistCell(metrics.value.resists.hull.exp, "damage-ex")}
                                            </tr>
                                          </tbody>
                                        </table>
                                      </div>
                                      <div className="ship-metric-tile ship-metric-tile-wide">
                                        <span>Speed</span>
                                        <strong>{formatSpeedRange(metrics.value.speed)}</strong>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="ship-metrics-row">
                                      <span>Combat Estimates</span>
                                      <strong title={metrics.reason}>Unavailable</strong>
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
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
                          <strong className="ship-probability">{ship.probability}%</strong>
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
          {isDesktopApp ? (
            <span className={`updater-status updater-status-right updater-${updaterState?.status ?? "idle"}`}>
              {formatUpdaterStatus(updaterState)}
            </span>
          ) : null}
          {isDesktopApp && updaterState?.status === "downloaded" ? (
            <button
              type="button"
              className="settings-button"
              onClick={() => {
                void window.eveIntelDesktop?.quitAndInstallUpdate();
              }}
            >
              Restart to Update
            </button>
          ) : null}
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
