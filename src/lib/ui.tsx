import { getShipRiskFlags, roleBadgeClass, roleIconClass, roleShort, toPctNumber } from "./presentation";
import type { CynoRisk } from "./cyno";
import type { ShipPrediction } from "./intel";

const CYNO_ICON_TYPE_ID = 21096;
const ROLE_ICON_TYPE_IDS: Record<string, number> = {
  "Long Point": 3242,
  Web: 526,
  HIC: 37611,
  Bubble: 22778,
  Boosh: 4383,
  Neut: 16469,
  Cloaky: 11370,
  "Shield Logi": 8635,
  "Armor Logi": 16455
};

export function renderResistCell(value: number, damageClass: string) {
  const pct = toPctNumber(value);
  return (
    <td className={`ship-resist-cell ${damageClass}`}>
      <span className="ship-resist-value">{pct}%</span>
      <span className="ship-resist-bar" aria-hidden="true">
        <span className="ship-resist-bar-fill" style={{ width: `${pct}%` }} />
      </span>
    </td>
  );
}

export function formatUpdaterStatus(state: DesktopUpdaterState | null): string {
  if (!state) {
    return "Updates: idle";
  }
  switch (state.status) {
    case "dev":
      return "Updates: dev mode";
    case "checking":
      return "Updates: checking...";
    case "downloading":
      return `Updates: downloading ${Math.max(0, Math.min(100, state.progress))}%`;
    case "downloaded":
      return `Updates: ready (${state.downloadedVersion ?? "new version"})`;
    case "up-to-date":
      return `Updates: up to date (${state.version})`;
    case "error":
      return `Updates: error${state.error ? ` (${state.error})` : ""}`;
    default:
      return "Updates: idle";
  }
}

export function renderShipPills(
  ship: ShipPrediction,
  cynoRisk?: CynoRisk,
  mode: "pill" | "icon" = "pill"
) {
  const flags = getShipRiskFlags(ship, cynoRisk);
  const elements = [];

  if (flags.bait) {
    elements.push(
      <span key={`${ship.shipName}-pill-bait`} className="risk-badge risk-bait">Bait</span>
    );
  }

  if (flags.hardCyno) {
    elements.push(
      mode === "icon" ? (
        <img
          key={`${ship.shipName}-pill-cyno`}
          src={`https://images.evetech.net/types/${CYNO_ICON_TYPE_ID}/icon?size=64`}
          className="alert-icon-img alert-cyno"
          title="Potential Cyno"
          aria-label="Potential Cyno"
          alt="Potential Cyno"
          loading="lazy"
        />
      ) : (
        <span key={`${ship.shipName}-pill-cyno`} className="risk-badge risk-cyno">Potential Cyno</span>
      )
    );
  } else if (flags.softCyno) {
    elements.push(
      mode === "icon" ? (
        <img
          key={`${ship.shipName}-pill-cyno-soft`}
          src={`https://images.evetech.net/types/${CYNO_ICON_TYPE_ID}/icon?size=64`}
          className="alert-icon-img alert-cyno-soft"
          title="Potential Cyno"
          aria-label="Potential Cyno"
          alt="Potential Cyno"
          loading="lazy"
        />
      ) : (
        <span key={`${ship.shipName}-pill-cyno-soft`} className="risk-badge risk-cyno-soft">Potential Cyno</span>
      )
    );
  }

  for (const role of ship.rolePills ?? []) {
    const iconTypeId = ROLE_ICON_TYPE_IDS[role];
    elements.push(
      mode === "icon" ? (
        iconTypeId ? (
          <img
            key={`${ship.shipName}-pill-${role}`}
            src={`https://images.evetech.net/types/${iconTypeId}/icon?size=64`}
            className={`alert-icon-img ${roleIconClass(role)}`}
            title={role}
            aria-label={role}
            alt={role}
            loading="lazy"
          />
        ) : (
          <span
            key={`${ship.shipName}-pill-${role}`}
            className={`alert-icon ${roleIconClass(role)}`}
            title={role}
            aria-label={role}
          >
            {roleShort(role)}
          </span>
        )
      ) : (
        <span key={`${ship.shipName}-pill-${role}`} className={`risk-badge ${roleBadgeClass(role)}`}>
          {role}
        </span>
      )
    );
  }

  return elements;
}
