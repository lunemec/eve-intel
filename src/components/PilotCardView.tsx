import { memo } from "react";
import { engagementStyleFromSoloRatio, engagementStyleTitle } from "../lib/presentation";
import { pilotDetailAnchorId } from "../lib/appUtils";
import type { PilotCard } from "../lib/pilotDomain";
import {
  PilotCardLikelyShipsSubview,
  PilotCardOverviewSubview,
  type PilotCardFitMetricsResolver
} from "./pilotCardSubviews";

type PilotCardViewProps = {
  pilot: PilotCard;
  getFitMetrics: PilotCardFitMetricsResolver;
};

function engagementStylePill(pilot: PilotCard): JSX.Element | null {
  const engagementStyle = engagementStyleFromSoloRatio(pilot.stats?.soloRatio);
  if (!engagementStyle) {
    return null;
  }
  const engagementStyleClass = engagementStyle === "Fleet" ? "risk-style-fleet" : "risk-style-solo";
  return (
    <span
      className={`risk-badge ${engagementStyleClass}`}
      title={engagementStyleTitle(engagementStyle, pilot.stats?.soloRatio)}
    >
      {engagementStyle}
    </span>
  );
}

export const PilotCardView = memo(function PilotCardView(props: PilotCardViewProps) {
  const { pilot, getFitMetrics } = props;
  return (
    <article className="pilot-card" id={pilotDetailAnchorId(pilot)}>
      <PilotCardOverviewSubview
        pilot={pilot}
        engagementStylePill={engagementStylePill(pilot)}
      />
      <PilotCardLikelyShipsSubview pilot={pilot} getFitMetrics={getFitMetrics} />
    </article>
  );
});
