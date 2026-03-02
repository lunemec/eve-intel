import type { PilotCard } from "../lib/pilotDomain";
import { renderShipPills } from "./shipPillRender";
import {
  engagementStyleFromSoloRatio,
  engagementStyleTitle,
  formatShipLikelihoodPercent,
  shipHasPotentialCyno,
  threatClass,
  threatScore
} from "../lib/presentation";
import { extractErrorMessage, pilotDetailAnchorId, smoothScrollToElement } from "../lib/appUtils";
import {
  allianceZkillUrl,
  characterPortraitUrl,
  characterZkillUrl,
  corporationZkillUrl,
  killmailZkillUrl,
  shipIconUrl
} from "../lib/links";

const DEFAULT_SCROLL_DURATION_MS = 120;
const FLEET_SUMMARY_ALLOWED_ROLE_PILLS = new Set(["HIC", "Bubble", "Dictor"]);
const BOTH_SHIPS_PILL_PROBABILITY_MIN = 45;
const BOTH_SHIPS_PILL_PROBABILITY_MAX = 55;

function isBothShipPillProbabilityRange(probability: number): boolean {
  return (
    Number.isFinite(probability) &&
    probability >= BOTH_SHIPS_PILL_PROBABILITY_MIN &&
    probability <= BOTH_SHIPS_PILL_PROBABILITY_MAX
  );
}

export function FleetSummaryHeaderSubview(props: {
  pilotCards: PilotCard[];
  copyableFleetCount: number;
  setNetworkNotice: React.Dispatch<React.SetStateAction<string>>;
  logDebug: (message: string, data?: unknown) => void;
}): JSX.Element {
  const { copyableFleetCount, pilotCards, setNetworkNotice, logDebug } = props;
  return (
    <div className="fleet-summary-header">
      <h4>Fleet Summary</h4>
      <button
        type="button"
        className="fleet-copy-button"
        disabled={copyableFleetCount === 0}
        onClick={async () => {
          const lines = pilotCards
            .filter((pilot) => Number.isFinite(pilot.characterId))
            .map((pilot) => pilot.characterName ?? pilot.parsedEntry.pilotName);
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
  );
}

export function FleetSummaryRowSubview(props: {
  pilot: PilotCard;
  scrollDurationMs?: number;
}): JSX.Element {
  const { pilot, scrollDurationMs } = props;
  const detailAnchorId = pilotDetailAnchorId(pilot);
  const topShip = pilot.predictedShips[0];
  const secondShip = pilot.predictedShips[1];
  const topFit = topShip?.shipTypeId
    ? pilot.fitCandidates.find((entry) => entry.shipTypeId === topShip.shipTypeId)
    : undefined;
  const secondFit = secondShip?.shipTypeId
    ? pilot.fitCandidates.find((entry) => entry.shipTypeId === secondShip.shipTypeId)
    : undefined;
  const topShipHref = topFit?.sourceLossKillmailId ? killmailZkillUrl(topFit.sourceLossKillmailId) : undefined;
  const secondShipHref = secondFit?.sourceLossKillmailId ? killmailZkillUrl(secondFit.sourceLossKillmailId) : undefined;
  const topShipCyno = topShip ? shipHasPotentialCyno(topShip) : false;
  const includeSecondShipPills = Boolean(
    topShip &&
    secondShip &&
    isBothShipPillProbabilityRange(topShip.probability) &&
    isBothShipPillProbabilityRange(secondShip.probability)
  );
  const fleetSummaryPillShips = (includeSecondShipPills ? [topShip, secondShip] : [topShip])
    .filter((ship): ship is NonNullable<typeof ship> => Boolean(ship))
    .map((ship) => ({
      ...ship,
      rolePills: (ship.rolePills ?? []).filter((pill) => FLEET_SUMMARY_ALLOWED_ROLE_PILLS.has(pill))
    }));
  const engagementStyle = engagementStyleFromSoloRatio(pilot.stats?.soloRatio);

  return (
    <li
      className={`fleet-summary-line fleet-summary-grid${topShipCyno ? " cyno-highlight" : ""}`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a, button, [data-prevent-row-click='true']")) {
          return;
        }
        const detail = document.getElementById(detailAnchorId);
        if (detail) {
          smoothScrollToElement(detail, scrollDurationMs ?? DEFAULT_SCROLL_DURATION_MS);
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
      <span className="fleet-col fleet-col-corporation">
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
      <span className="fleet-col fleet-col-alliance">
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
      <span className="fleet-col fleet-col-ship fleet-col-ship-primary">
        {topShip ? (
          <>
            <span className="fleet-summary-probability">{formatShipLikelihoodPercent(topShip.probability)}</span>
            <img
              src={shipIconUrl(topShip.shipTypeId)}
              alt={topShip.shipName}
              className="ship-icon"
              loading="lazy"
            />
            {topShipHref ? (
              <a href={topShipHref} target="_blank" rel="noreferrer" className="fleet-summary-ship">
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
      <span className="fleet-col fleet-col-ship fleet-col-ship-secondary">
        {secondShip ? (
          <>
            <span className="fleet-summary-probability">{formatShipLikelihoodPercent(secondShip.probability)}</span>
            <img
              src={shipIconUrl(secondShip.shipTypeId)}
              alt={secondShip.shipName}
              className="ship-icon"
              loading="lazy"
            />
            {secondShipHref ? (
              <a href={secondShipHref} target="_blank" rel="noreferrer" className="fleet-summary-ship">
                {secondShip.shipName}
              </a>
            ) : (
              <span className="fleet-summary-ship">{secondShip.shipName}</span>
            )}
          </>
        ) : null}
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
        {fleetSummaryPillShips.flatMap((ship) => renderShipPills(ship, pilot.cynoRisk, "icon-link"))}
      </span>
    </li>
  );
}
