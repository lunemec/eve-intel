import { memo } from "react";
import type { GroupPresentation } from "../lib/appViewModel";
import { deriveGroupRunPositionsByIndex } from "../lib/groupRuns";
import type { PilotCard } from "../lib/pilotDomain";
import { FleetSummaryHeaderSubview, FleetSummaryRowSubview } from "./fleetSummarySubviews";

type FleetSummaryProps = {
  pilotCards: PilotCard[];
  copyableFleetCount: number;
  setNetworkNotice: React.Dispatch<React.SetStateAction<string>>;
  logDebug: (message: string, data?: unknown) => void;
  groupPresentationByPilotId?: ReadonlyMap<number, GroupPresentation>;
  scrollDurationMs?: number;
};

export const FleetSummary = memo(function FleetSummary(props: FleetSummaryProps) {
  const {
    pilotCards,
    copyableFleetCount,
    setNetworkNotice,
    logDebug,
    groupPresentationByPilotId,
    scrollDurationMs
  } = props;
  const groupRunPositionsByIndex = deriveGroupRunPositionsByIndex(pilotCards, groupPresentationByPilotId);
  return (
    <section className="fleet-summary">
      <FleetSummaryHeaderSubview
        pilotCards={pilotCards}
        copyableFleetCount={copyableFleetCount}
        setNetworkNotice={setNetworkNotice}
        logDebug={logDebug}
      />
      <ul className="fleet-summary-list">
        {pilotCards.map((pilot, index) => (
          <FleetSummaryRowSubview
            key={`summary-${pilot.parsedEntry.pilotName.toLowerCase()}`}
            pilot={pilot}
            groupPresentation={resolveGroupPresentation(groupPresentationByPilotId, pilot.characterId)}
            groupRunPosition={groupRunPositionsByIndex[index]}
            scrollDurationMs={scrollDurationMs}
          />
        ))}
      </ul>
    </section>
  );
});

function resolveGroupPresentation(
  groupPresentationByPilotId: ReadonlyMap<number, GroupPresentation> | undefined,
  characterId: number | undefined
): GroupPresentation | undefined {
  if (!groupPresentationByPilotId) {
    return undefined;
  }
  if (typeof characterId !== "number" || !Number.isInteger(characterId) || characterId <= 0) {
    return undefined;
  }
  return groupPresentationByPilotId.get(characterId);
}
