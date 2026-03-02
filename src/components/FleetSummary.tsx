import { memo } from "react";
import type { PilotCard } from "../lib/pilotDomain";
import { FleetSummaryHeaderSubview, FleetSummaryRowSubview } from "./fleetSummarySubviews";

type FleetSummaryProps = {
  pilotCards: PilotCard[];
  copyableFleetCount: number;
  setNetworkNotice: React.Dispatch<React.SetStateAction<string>>;
  logDebug: (message: string, data?: unknown) => void;
  scrollDurationMs?: number;
};

export const FleetSummary = memo(function FleetSummary(props: FleetSummaryProps) {
  const { pilotCards, copyableFleetCount, setNetworkNotice, logDebug, scrollDurationMs } = props;
  return (
    <section className="fleet-summary">
      <FleetSummaryHeaderSubview
        pilotCards={pilotCards}
        copyableFleetCount={copyableFleetCount}
        setNetworkNotice={setNetworkNotice}
        logDebug={logDebug}
      />
      <ul className="fleet-summary-list">
        {pilotCards.map((pilot) => (
          <FleetSummaryRowSubview
            key={`summary-${pilot.parsedEntry.pilotName.toLowerCase()}`}
            pilot={pilot}
            scrollDurationMs={scrollDurationMs}
          />
        ))}
      </ul>
    </section>
  );
});
