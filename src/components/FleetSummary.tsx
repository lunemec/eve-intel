import { memo } from "react";
import type { PilotCard } from "../lib/usePilotIntelPipeline";
import { renderShipPills } from "../lib/ui";
import { engagementStyleFromSoloRatio, engagementStyleTitle, shipHasPotentialCyno, threatClass, threatScore } from "../lib/presentation";
import { pilotDetailAnchorId, smoothScrollToElement, extractErrorMessage } from "../lib/appUtils";
import {
  allianceZkillUrl,
  characterPortraitUrl,
  characterZkillUrl,
  corporationZkillUrl,
  killmailZkillUrl,
  shipIconUrl
} from "../lib/links";

const DEFAULT_SCROLL_DURATION_MS = 120;

export const FleetSummary = memo(function FleetSummary(props: {
  pilotCards: PilotCard[];
  copyableFleetCount: number;
  setNetworkNotice: React.Dispatch<React.SetStateAction<string>>;
  logDebug: (message: string, data?: unknown) => void;
  scrollDurationMs?: number;
}) {
  return (
    <section className="fleet-summary">
      <div className="fleet-summary-header">
        <h4>Fleet Summary</h4>
        <button
          type="button"
          className="fleet-copy-button"
          disabled={props.copyableFleetCount === 0}
          onClick={async () => {
            const lines = props.pilotCards
              .filter((pilot) => Number.isFinite(pilot.characterId))
              .map((pilot) => pilot.characterName ?? pilot.parsedEntry.pilotName);
            if (lines.length === 0) {
              props.setNetworkNotice("No resolved character IDs to copy.");
              return;
            }
            try {
              await navigator.clipboard.writeText(lines.join("\n"));
              props.setNetworkNotice(`Copied ${lines.length} pilot link(s) to clipboard.`);
              props.logDebug("Fleet summary copied to clipboard", { count: lines.length });
            } catch (error) {
              props.setNetworkNotice(`Clipboard copy failed: ${extractErrorMessage(error)}`);
            }
          }}
        >
          Copy to Clipboard
        </button>
      </div>
      <ul className="fleet-summary-list">
        {props.pilotCards.map((pilot) => {
          const detailAnchorId = pilotDetailAnchorId(pilot);
          const topShip = pilot.predictedShips[0];
          const topFit = topShip?.shipTypeId
            ? pilot.fitCandidates.find((entry) => entry.shipTypeId === topShip.shipTypeId)
            : undefined;
          const shipHref = topFit?.sourceLossKillmailId ? killmailZkillUrl(topFit.sourceLossKillmailId) : undefined;
          const topShipCyno = topShip ? shipHasPotentialCyno(topShip) : false;
          const engagementStyle = engagementStyleFromSoloRatio(pilot.stats?.soloRatio);
          return (
            <li
              className={`fleet-summary-line fleet-summary-grid${topShipCyno ? " cyno-highlight" : ""}`}
              key={`summary-${pilot.parsedEntry.pilotName.toLowerCase()}`}
              onClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("a, button, [data-prevent-row-click='true']")) {
                  return;
                }
                const detail = document.getElementById(detailAnchorId);
                if (detail) {
                  smoothScrollToElement(detail, props.scrollDurationMs ?? DEFAULT_SCROLL_DURATION_MS);
                }
              }}
            >
              <span className="fleet-col fleet-col-pilot">
                {pilot.characterId ? (
                  <a
                    href={characterZkillUrl(pilot.characterId)}
                    target="_blank"
                    rel="noreferrer"
                    className="fleet-summary-avatar-link"
                  >
                    <img
                      src={characterPortraitUrl(pilot.characterId)}
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
                    href={characterZkillUrl(pilot.characterId)}
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
                    href={corporationZkillUrl(pilot.corporationId)}
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
                    href={allianceZkillUrl(pilot.allianceId)}
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
                    <span className="fleet-summary-probability">{topShip.probability}%</span>
                    <img
                      src={shipIconUrl(topShip.shipTypeId)}
                      alt={topShip.shipName}
                      className="ship-icon"
                      loading="lazy"
                    />
                    {shipHref ? (
                      <a href={shipHref} target="_blank" rel="noreferrer" className="fleet-summary-ship">
                        {topShip.shipName}
                      </a>
                    ) : (
                      <span className="fleet-summary-ship">{topShip.shipName}</span>
                    )}
                  </>
                ) : (
                  <span className="fleet-summary-muted">No inferred ship</span>
                )}
              </span>
              <span className="fleet-col fleet-col-alerts">
                {engagementStyle ? (
                  <span
                    className={`risk-badge ${engagementStyle === "Fleet" ? "risk-style-fleet" : "risk-style-solo"}`}
                    title={engagementStyleTitle(engagementStyle, pilot.stats?.soloRatio)}
                    data-prevent-row-click="true"
                  >
                    {engagementStyle}
                  </span>
                ) : null}
                {topShip ? renderShipPills(topShip, pilot.cynoRisk, "icon-link") : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
