import { memo } from "react";
import { formatFitAsEft } from "../lib/eft";
import {
  engagementStyleFromSoloRatio,
  engagementStyleTitle,
  shipHasPotentialCyno,
  threatClass,
  threatLabel,
  threatScore,
  toPct,
  formatRange,
  formatEhp,
  formatSpeedRange,
  formatRatio,
  formatIsk
} from "../lib/presentation";
import { renderResistCell, renderShipPills } from "../lib/ui";
import { characterPortraitUrl, characterZkillUrl, corporationLogoUrl, corporationZkillUrl, allianceLogoUrl, allianceZkillUrl, shipIconUrl, killmailZkillUrl } from "../lib/links";
import { pilotDetailAnchorId } from "../lib/appUtils";
import type { PilotCard } from "../lib/usePilotIntelPipeline";
import type { FitMetricResult } from "../lib/useFitMetrics";
import type { PilotStats } from "../lib/intel";

const DETAIL_FIT_CANDIDATES = 3;

function formatGangProfile(stats: PilotStats): string {
  const avgGang = stats.avgGangSize;
  const gangRatio = stats.gangRatio;
  if (!Number.isFinite(avgGang) && !Number.isFinite(gangRatio)) {
    return "-";
  }
  if (Number.isFinite(avgGang) && Number.isFinite(gangRatio)) {
    return `${Number(avgGang).toFixed(1)} (${Math.round(Number(gangRatio))}%)`;
  }
  if (Number.isFinite(avgGang)) {
    return Number(avgGang).toFixed(1);
  }
  return `${Math.round(Number(gangRatio))}%`;
}

export const PilotCardView = memo(function PilotCardView(props: {
  pilot: PilotCard;
  getFitMetrics: (pilot: PilotCard, fit: PilotCard["fitCandidates"][number] | undefined) => FitMetricResult;
}) {
  const { pilot } = props;
  const engagementStyle = engagementStyleFromSoloRatio(pilot.stats?.soloRatio);
  const engagementStyleClass = engagementStyle === "Fleet" ? "risk-style-fleet" : "risk-style-solo";
  const renderEngagementStylePill = () => (
    engagementStyle ? (
      <span
        className={`risk-badge ${engagementStyleClass}`}
        title={engagementStyleTitle(engagementStyle, pilot.stats?.soloRatio)}
      >
        {engagementStyle}
      </span>
    )
      : null
  );

  return (
    <article className="pilot-card" id={pilotDetailAnchorId(pilot)}>
      <div className={`player-card ${threatClass(pilot.stats?.danger)}`}>
        <div className="player-card-header">
          <div className="player-avatar" aria-hidden="true">
            {pilot.characterId ? (
              <img
                src={characterPortraitUrl(pilot.characterId)}
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
                  href={characterZkillUrl(pilot.characterId)}
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
                      href={corporationZkillUrl(pilot.corporationId)}
                      target="_blank"
                      rel="noreferrer"
                      className="corp-link"
                    >
                      <img
                        src={corporationLogoUrl(pilot.corporationId)}
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
                        href={allianceZkillUrl(pilot.allianceId)}
                        target="_blank"
                        rel="noreferrer"
                        className="corp-link"
                      >
                        <img
                          src={allianceLogoUrl(pilot.allianceId)}
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
          <div className="player-threat-stack">
            <div className={`threat-indicator ${threatClass(pilot.stats?.danger)}`}>
              <div className="threat-score">
                {pilot.status === "ready" ? threatScore(pilot.stats?.danger) : pilot.status.toUpperCase()}
              </div>
              <div className="threat-label">{threatLabel(pilot.stats?.danger)}</div>
            </div>
            <div className="player-threat-pill">{renderEngagementStylePill()}</div>
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
              <div className="stat-row">
                <span className="stat-label">Gang:</span>
                <span className="stat-value">
                  {pilot.stats ? formatGangProfile(pilot.stats) : "-"}
                </span>
              </div>
              <div className="stat-row"><span className="stat-label">Danger:</span><span className="stat-value">{pilot.stats ? `${pilot.stats.danger}%` : "-"}</span></div>
            </div>
          </div>
        </div>
        <div className="player-card-footer">
          {pilot.characterId ? (
            <a href={characterZkillUrl(pilot.characterId)} target="_blank" rel="noreferrer" className="zkill-link">
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
                      src={shipIconUrl(ship.shipTypeId)}
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
        <ul>
          {pilot.predictedShips.length > 0 ? (
            pilot.predictedShips.slice(0, DETAIL_FIT_CANDIDATES).map((ship) => {
              const fit = ship.shipTypeId
                ? pilot.fitCandidates.find((entry) => entry.shipTypeId === ship.shipTypeId)
                : undefined;
              const metrics = props.getFitMetrics(pilot, fit);
              const rowCyno = shipHasPotentialCyno(ship);
              const eft = formatFitAsEft(ship.shipName, fit);
              const shipNameLower = ship.shipName.toLowerCase();
              const isCapsuleLike = shipNameLower.includes("capsule") || shipNameLower.includes("pod");
              const canCopyEft = Boolean(fit) && !isCapsuleLike;
              const killmailHref = fit?.sourceLossKillmailId ? killmailZkillUrl(fit.sourceLossKillmailId) : undefined;
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
                            src={shipIconUrl(ship.shipTypeId)}
                            alt={ship.shipName}
                            className="ship-icon"
                            loading="lazy"
                          />
                          <span>{ship.shipName}</span>
                        </a>
                      ) : (
                        <>
                          <img
                            src={shipIconUrl(ship.shipTypeId)}
                            alt={ship.shipName}
                            className="ship-icon"
                            loading="lazy"
                          />
                          <span>{ship.shipName}</span>
                        </>
                      )}
                      {ship.cynoCapable ? (
                        <>
                          <span
                            className="ship-cyno-pill"
                            title={`Cyno Capable: ${ship.shipName} can fit a cynosural module, but this does not imply proven recent usage.`}
                          >
                            Cyno Capable
                          </span>
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
  );
});
