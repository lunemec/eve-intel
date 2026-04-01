import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { GroupPresentation } from "../lib/appViewModel";
import { deriveGroupRunPositionsByIndex } from "../lib/groupRuns";
import type { PilotCard } from "../lib/pilotDomain";
import {
  FleetSummaryColumnHeaderSubview,
  FleetSummaryHeaderSubview,
  FleetSummaryRowSubview,
  type FleetSortColumn,
  type FleetSortState
} from "./fleetSummarySubviews";

type FleetSummaryProps = {
  pilotCards: PilotCard[];
  copyableFleetCount: number;
  setNetworkNotice: React.Dispatch<React.SetStateAction<string>>;
  logDebug: (message: string, data?: unknown) => void;
  groupPresentationByPilotId?: ReadonlyMap<number, GroupPresentation>;
  scrollDurationMs?: number;
};

function deriveRosterSignature(pilotCards: PilotCard[]): string {
  return pilotCards
    .map((p) => p.parsedEntry.pilotName.toLowerCase())
    .sort()
    .join("\0");
}

export const FleetSummary = memo(function FleetSummary(props: FleetSummaryProps) {
  const {
    pilotCards,
    copyableFleetCount,
    setNetworkNotice,
    logDebug,
    groupPresentationByPilotId,
    scrollDurationMs
  } = props;

  const [sortState, setSortState] = useState<FleetSortState>({ column: null, direction: null });

  const rosterSignature = useMemo(() => deriveRosterSignature(pilotCards), [pilotCards]);
  const previousRosterSignatureRef = useRef(rosterSignature);
  useEffect(() => {
    if (previousRosterSignatureRef.current !== rosterSignature) {
      previousRosterSignatureRef.current = rosterSignature;
      setSortState({ column: null, direction: null });
    }
  }, [rosterSignature]);

  const handleSort = (column: FleetSortColumn) => {
    setSortState((prev) => {
      if (prev.column === column) {
        const next = nextDirection(prev.direction);
        return next === null ? { column: null, direction: null } : { column, direction: next };
      }
      return { column, direction: "asc" };
    });
  };

  const displayCards = useMemo(() => {
    if (sortState.column === null || sortState.direction === null) {
      return pilotCards;
    }
    const { column, direction } = sortState;
    const indexed = pilotCards.map((card, i) => ({ card, i }));
    indexed.sort((a, b) => {
      const aVal = (column === "corporation" ? a.card.corporationName : a.card.allianceName) ?? "";
      const bVal = (column === "corporation" ? b.card.corporationName : b.card.allianceName) ?? "";
      if (aVal === "" && bVal === "") return a.i - b.i;
      if (aVal === "") return 1;
      if (bVal === "") return -1;
      const cmp = aVal.localeCompare(bVal);
      if (cmp !== 0) return direction === "desc" ? -cmp : cmp;
      return a.i - b.i;
    });
    return indexed.map(({ card }) => card);
  }, [pilotCards, sortState]);

  const groupRunPositionsByIndex = deriveGroupRunPositionsByIndex(displayCards, groupPresentationByPilotId);
  return (
    <section className="fleet-summary">
      <FleetSummaryHeaderSubview
        pilotCards={pilotCards}
        copyableFleetCount={copyableFleetCount}
        setNetworkNotice={setNetworkNotice}
        logDebug={logDebug}
      />
      <FleetSummaryColumnHeaderSubview sortState={sortState} onSort={handleSort} />
      <ul className="fleet-summary-list">
        {displayCards.map((pilot, index) => (
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

function nextDirection(current: FleetSortState["direction"]): FleetSortState["direction"] {
  if (current === null) return "asc";
  if (current === "asc") return "desc";
  return null;
}

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
