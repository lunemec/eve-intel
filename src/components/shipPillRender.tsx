import { getShipRiskFlags, roleBadgeClass, roleIconClass, roleShort } from "../lib/presentation";
import type { CynoRisk } from "../lib/cyno";
import type { ShipPrediction } from "../lib/intel";

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
  return `Bait: direct killmail evidence shows this pilot flying ${ship.shipName} in a bait context.`;
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

function wrapEvidenceLink(
  ship: ShipPrediction,
  pillName: string,
  element: JSX.Element,
  mode: "pill" | "icon" | "icon-link"
): JSX.Element {
  if (mode === "icon") {
    return element;
  }
  const url = evidenceUrl(ship, pillName);
  if (!url) {
    return element;
  }
  const linkClass = mode === "pill" ? "risk-badge-link" : "alert-icon-link";
  return (
    <a
      key={`${ship.shipName}-pill-link-${pillName}`}
      href={url}
      target="_blank"
      rel="noreferrer"
      className={linkClass}
    >
      {element}
    </a>
  );
}

function hasEvidenceUrl(ship: ShipPrediction, pillName: string): boolean {
  return Boolean(evidenceUrl(ship, pillName));
}

function evidenceUrl(ship: ShipPrediction, pillName: string): string | undefined {
  const url = ship.pillEvidence?.[pillName as keyof NonNullable<ShipPrediction["pillEvidence"]>]?.url;
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

export function renderShipPills(
  ship: ShipPrediction,
  cynoRisk?: CynoRisk,
  mode: "pill" | "icon" | "icon-link" = "pill"
): JSX.Element[] {
  const flags = getShipRiskFlags(ship, cynoRisk);
  const elements: JSX.Element[] = [];

  if (flags.bait && hasEvidenceUrl(ship, "Bait")) {
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

  if (flags.hardCyno && hasEvidenceUrl(ship, "Cyno")) {
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
    if (!hasEvidenceUrl(ship, role)) {
      continue;
    }
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
