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

function cynoTitle(ship: ShipPrediction): string {
  return `Cyno: this hull has direct same-hull historical cyno-fit evidence for this pilot (${ship.shipName}).`;
}

function baitTitle(ship: ShipPrediction): string {
  return `Bait: this pilot/ship profile shows bait indicators (jump-association and tackle/tank signals) on ${ship.shipName}.`;
}

function roleTitle(role: string): string {
  switch (role) {
    case "Long Point":
      return "Long Point: likely warp disruptor fit to hold targets at range.";
    case "Web":
      return "Web: likely stasis webifier fit for speed control.";
    case "HIC":
      return "HIC: heavy interdictor role likely present on this hull.";
    case "Bubble":
      return "Bubble: likely interdiction bubble capability for area warp denial.";
    case "Boosh":
      return "Boosh: likely micro jump field generator reposition utility.";
    case "Neut":
      return "Neut: likely energy neutralizer pressure on target capacitor.";
    case "Cloaky":
      return "Cloaky: likely cloaking module fit.";
    case "Shield Logi":
      return "Shield Logi: likely shield logistics support role.";
    case "Armor Logi":
      return "Armor Logi: likely armor logistics support role.";
    default:
      return `${role}: inferred role from fit/module evidence.`;
  }
}

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
  mode: "pill" | "icon" | "icon-link" = "pill"
) {
  const flags = getShipRiskFlags(ship, cynoRisk);
  const elements = [];

  if (flags.bait) {
    const bait = (
      <span
        key={`${ship.shipName}-pill-bait`}
        className="risk-badge risk-bait"
        title={baitTitle(ship)}
      >
        Bait
      </span>
    );
    elements.push(wrapEvidenceLink(ship, "Bait", bait, mode));
  }

  if (flags.hardCyno) {
    const title = cynoTitle(ship);
    const cyno = mode === "icon" || mode === "icon-link" ? (
        <img
          key={`${ship.shipName}-pill-cyno`}
          src={`https://images.evetech.net/types/${CYNO_ICON_TYPE_ID}/icon?size=64`}
          className="alert-icon-img alert-cyno"
          title={title}
          aria-label="Cyno"
          alt="Cyno"
          loading="lazy"
        />
      ) : (
        <span key={`${ship.shipName}-pill-cyno`} className="risk-badge risk-cyno" title={title}>Cyno</span>
      );
    elements.push(wrapEvidenceLink(ship, "Cyno", cyno, mode));
  }

  for (const role of ship.rolePills ?? []) {
    const iconTypeId = ROLE_ICON_TYPE_IDS[role];
    const title = roleTitle(role);
    const roleElement = mode === "icon" || mode === "icon-link" ? (
        iconTypeId ? (
          <img
            key={`${ship.shipName}-pill-${role}`}
            src={`https://images.evetech.net/types/${iconTypeId}/icon?size=64`}
            className={`alert-icon-img ${roleIconClass(role)}`}
            title={title}
            aria-label={role}
            alt={role}
            loading="lazy"
          />
        ) : (
          <span
            key={`${ship.shipName}-pill-${role}`}
            className={`alert-icon ${roleIconClass(role)}`}
            title={title}
            aria-label={role}
          >
            {roleShort(role)}
          </span>
        )
      ) : (
        <span key={`${ship.shipName}-pill-${role}`} className={`risk-badge ${roleBadgeClass(role)}`} title={title}>
          {role}
        </span>
      );
    elements.push(wrapEvidenceLink(ship, role, roleElement, mode));
  }

  return elements;
}

function wrapEvidenceLink(
  ship: ShipPrediction,
  pillName: string,
  element: JSX.Element,
  mode: "pill" | "icon" | "icon-link"
): JSX.Element {
  if (mode !== "icon-link") {
    return element;
  }
  const url = ship.pillEvidence?.[pillName as keyof NonNullable<ShipPrediction["pillEvidence"]>]?.url;
  if (!url) {
    return element;
  }
  return (
    <a
      key={`${ship.shipName}-pill-link-${pillName}`}
      href={url}
      target="_blank"
      rel="noreferrer"
      className="alert-icon-link"
    >
      {element}
    </a>
  );
}
