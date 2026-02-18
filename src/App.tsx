import { useRef } from "react";
import { ZKILL_MAX_LOOKBACK_DAYS } from "./lib/api/zkill";
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
import { deriveAppViewModel, sortPilotCardsByDanger } from "./lib/appViewModel";
import { useClearPilotCards } from "./lib/useClearPilotCards";
import { useManualEntryHandlers } from "./lib/useManualEntryHandlers";
import { useAppPreferences } from "./lib/useAppPreferences";
import { usePasteInputIntegration } from "./lib/usePasteInputIntegration";
import { extractErrorMessage } from "./lib/appUtils";

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

  const sortedPilotCards = sortPilotCardsByDanger(pilotCards);
  const { copyableFleetCount, globalLoadProgress, showGlobalLoad } = deriveAppViewModel(sortedPilotCards);
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
          {sortedPilotCards.length > 1 ? (
            <FleetSummary
              pilotCards={sortedPilotCards}
              copyableFleetCount={copyableFleetCount}
              setNetworkNotice={setNetworkNotice}
              logDebug={logDebug}
            />
          ) : null}
          <section className="cards">
            {sortedPilotCards.map((pilot) => (
              <PilotCardView
                key={pilot.parsedEntry.pilotName.toLowerCase()}
                pilot={pilot}
                getFitMetrics={getFitMetrics}
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
