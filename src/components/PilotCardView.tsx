import { memo } from "react";
import type { GroupPresentation } from "../lib/appViewModel";
import type { GroupRunPosition } from "../lib/groupRuns";
import { engagementStyleFromSoloRatio, engagementStyleTitle } from "../lib/presentation";
import { pilotDetailAnchorId } from "../lib/appUtils";
import type { PilotCard } from "../lib/pilotDomain";
import {
  PilotCardLikelyShipsSubview,
  PilotCardOverviewSubview,
  type PilotCardFitMetricsResolver
} from "./pilotCardSubviews";
import { buildSuggestionHoverTitle } from "./suggestionHoverTitle";

type PilotCardViewProps = {
  pilot: PilotCard;
  getFitMetrics: PilotCardFitMetricsResolver;
  groupPresentation?: GroupPresentation;
  groupRunPosition?: GroupRunPosition;
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
  const { pilot, getFitMetrics, groupPresentation, groupRunPosition } = props;
  const suggestionHoverTitle = buildSuggestionHoverTitle(groupPresentation);
  const cardClassName = [
    "pilot-card",
    groupPresentation?.groupId ? "is-grouped" : "",
    groupPresentation?.groupId && groupRunPosition ? `group-run-${groupRunPosition}` : "",
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
      title={suggestionHoverTitle}
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
