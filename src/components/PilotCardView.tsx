import { memo } from "react";
import type { GroupPresentation } from "../lib/appViewModel";
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
  groupPresentation?: GroupPresentation;
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
  const { pilot, getFitMetrics, groupPresentation } = props;
  const cardClassName = [
    "pilot-card",
    groupPresentation?.groupId ? "is-grouped" : "",
    groupPresentation?.isGreyedSuggestion ? "is-suggested" : ""
  ]
    .filter((className) => className.length > 0)
    .join(" ");
  return (
    <article
      className={cardClassName}
      id={pilotDetailAnchorId(pilot)}
      data-group-id={groupPresentation?.groupId}
      data-group-color-token={groupPresentation?.groupColorToken}
    >
      <PilotCardOverviewSubview
        pilot={pilot}
        engagementStylePill={engagementStylePill(pilot)}
        groupPresentation={groupPresentation}
      />
      <PilotCardLikelyShipsSubview pilot={pilot} getFitMetrics={getFitMetrics} />
    </article>
  );
});
