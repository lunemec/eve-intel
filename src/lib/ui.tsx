import { getShipRiskFlags, roleBadgeClass, roleIconClass, roleShort, toPctNumber } from "./presentation";
import type { CynoRisk } from "./cyno";
import type { FitCandidate, ShipPrediction } from "./intel";
import { classifyTankByModuleMetadata, type TankType } from "./tank/classifier";

const CYNO_ICON_TYPE_ID = 21096;
const RESIST_LAYER_META = {
  shield: { short: "S", title: "Shield" },
  armor: { short: "A", title: "Armor" },
  hull: { short: "H", title: "Hull" }
} as const;
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
const TANK_TYPES: TankType[] = ["shield", "armor", "hull"];
type FitModule = NonNullable<FitCandidate["modulesBySlot"]>["high"][number];
type FitModuleWithDogmaMeta = FitModule & {
  effects?: string[];
  effectsMeta?: Array<{ effectId?: number; effectName?: string }>;
};
export type TankInferenceDiagnostic =
  | { kind: "fallback-regex" }
  | { kind: "module-no-classification-signal"; typeId?: number };
const TANK_IMPACT_WEIGHT = {
  major: 4,
  medium: 3,
  minor: 1
} as const;

const TANK_NAME_RULES: Record<TankType, Array<{ pattern: RegExp; weight: number }>> = {
  shield: [
    { pattern: /shield extender/i, weight: TANK_IMPACT_WEIGHT.major },
    {
      pattern: /core defense (?:field )?(?:extender|purger|safeguard|operational solidifier)/i,
      weight: TANK_IMPACT_WEIGHT.major
    },
    { pattern: /ancillary shield booster|shield booster/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /shield boost amplifier/i, weight: TANK_IMPACT_WEIGHT.medium },
    { pattern: /shield hardener|shield resistance|shield reinforcer|screen reinforcer/i, weight: TANK_IMPACT_WEIGHT.minor }
  ],
  armor: [
    { pattern: /armor plate|steel plates|crystalline carbonide.*plates/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /armor repairer|ancillary armor/i, weight: TANK_IMPACT_WEIGHT.major },
    {
      pattern: /trimark armor pump|auxiliary nano pump|nanobot accelerator|anti-.*pump/i,
      weight: TANK_IMPACT_WEIGHT.major
    },
    { pattern: /armor reinforcer/i, weight: TANK_IMPACT_WEIGHT.minor },
    { pattern: /armor hardener|armor resistance/i, weight: TANK_IMPACT_WEIGHT.minor }
  ],
  hull: [
    { pattern: /hull reinforcer|transverse bulkhead|bulkhead/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /hull repairer|structure repairer/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /hull resistance|structure resistance/i, weight: TANK_IMPACT_WEIGHT.minor }
  ]
};
const TANK_EFFECT_RULES: Record<TankType, Array<{ pattern: RegExp; weight: number }>> = {
  shield: [
    { pattern: /shield.*(?:capacity|hp).*bonus/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /shield.*(?:boost|booster|boostamplifier|safeguard|purger|solidifier)/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /shield.*(?:resonance|resistance|reinforcer|hardener|purger)/i, weight: TANK_IMPACT_WEIGHT.minor }
  ],
  armor: [
    { pattern: /armor.*(?:hp|hitpoint).*bonus/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /armor.*(?:repair|repairer|nanobot|pump|damageamount)/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /armor.*(?:resonance|resistance|reinforcer|hardener)/i, weight: TANK_IMPACT_WEIGHT.minor }
  ],
  hull: [
    { pattern: /(?:hull|structure).*(?:hp|hitpoint).*bonus/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /(?:hull|structure).*(?:repair|repairer|bulkhead)/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /(?:hull|structure).*(?:resonance|resistance|reinforcer)/i, weight: TANK_IMPACT_WEIGHT.minor }
  ]
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

export function inferTankTypeFromFit(
  fit: FitCandidate | undefined,
  options?: { onDiagnostic?: (entry: TankInferenceDiagnostic) => void }
): TankType | null {
  if (!fit) {
    return null;
  }

  const resolvedModules = collectResolvedFitModules(fit);
  if (hasIdMetadataEvidence(resolvedModules)) {
    const classified = classifyTankByModuleMetadata(
      resolvedModules.map((module) => ({
        typeId: module.typeId,
        groupId: module.groupId,
        categoryId: module.categoryId,
        effectIds: module.effectIds
      }))
    );
    for (const module of classified.unclassifiedTankLikeModules) {
      options?.onDiagnostic?.({
        kind: "module-no-classification-signal",
        typeId: module.typeId
      });
    }
    return classified.tankType;
  }
  options?.onDiagnostic?.({ kind: "fallback-regex" });

  const scores: Record<TankType, number> = {
    shield: 0,
    armor: 0,
    hull: 0
  };

  if (hasResolvedModuleEvidence(resolvedModules)) {
    scoreResolvedModules(resolvedModules, scores);
  } else {
    const eftModuleNames = collectEftModuleNames(fit);
    if (eftModuleNames.length === 0) {
      return null;
    }
    scoreModuleNames(eftModuleNames, scores);
  }
  const hasAnyScore = TANK_TYPES.some((tankType) => scores[tankType] > 0);
  if (!hasAnyScore) {
    for (const module of resolvedModules) {
      options?.onDiagnostic?.({
        kind: "module-no-classification-signal",
        typeId: module.typeId
      });
    }
  }

  const orderedScores = TANK_TYPES.map((tankType) => scores[tankType]).sort((a, b) => b - a);
  const topScore = orderedScores[0] ?? 0;
  if (topScore < 4) {
    return null;
  }

  const topMatches = TANK_TYPES.filter((tankType) => scores[tankType] === topScore);
  if (topMatches.length !== 1) {
    return null;
  }

  const secondScore = orderedScores[1] ?? 0;
  if (topScore - secondScore < 2) {
    return null;
  }

  return topMatches[0];
}

function hasIdMetadataEvidence(modules: FitModuleWithDogmaMeta[]): boolean {
  return modules.some((module) => {
    if (typeof module.groupId === "number" && module.groupId > 0) {
      return true;
    }
    if (typeof module.categoryId === "number" && module.categoryId > 0) {
      return true;
    }
    return Array.isArray(module.effectIds) && module.effectIds.some((effectId) => Number.isInteger(effectId) && effectId > 0);
  });
}

export function renderResistRowHeader(layer: TankType, tankType: TankType | null): JSX.Element {
  const layerMeta = RESIST_LAYER_META[layer];
  if (tankType !== layer) {
    return <th scope="row">{layerMeta.short}</th>;
  }
  const warningTitle = `${layerMeta.title} tank detected from fitted modules.`;
  return (
    <th scope="row" className="ship-resist-row-label-warning" title={warningTitle} aria-label={warningTitle}>
      {layerMeta.short}
    </th>
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

function collectResolvedFitModules(fit: FitCandidate): FitModuleWithDogmaMeta[] {
  if (!fit.modulesBySlot) {
    return [];
  }
  return [
    ...fit.modulesBySlot.high,
    ...fit.modulesBySlot.mid,
    ...fit.modulesBySlot.low,
    ...fit.modulesBySlot.rig,
    ...fit.modulesBySlot.other
  ] as FitModuleWithDogmaMeta[];
}

function collectEftModuleNames(fit: FitCandidate): string[] {
  const namesFromEft: string[] = [];
  if (!fit.eftSections) {
    return namesFromEft;
  }
  const sections = [
    ...fit.eftSections.high,
    ...fit.eftSections.mid,
    ...fit.eftSections.low,
    ...fit.eftSections.rig,
    ...fit.eftSections.other
  ];
  for (const sectionName of sections) {
    if (typeof sectionName === "string" && sectionName.trim()) {
      namesFromEft.push(sectionName.toLowerCase());
    }
  }
  return namesFromEft;
}

function hasResolvedModuleEvidence(modules: FitModuleWithDogmaMeta[]): boolean {
  return modules.some((module) => {
    if (normalizeModuleName(module.name)) {
      return true;
    }
    return collectModuleEffectNames(module).length > 0;
  });
}

function scoreResolvedModules(modules: FitModuleWithDogmaMeta[], scores: Record<TankType, number>): void {
  for (const module of modules) {
    const hasMetadataMatch = applyTankRules(collectModuleEffectNames(module), TANK_EFFECT_RULES, scores);
    if (hasMetadataMatch) {
      continue;
    }
    const moduleName = normalizeModuleName(module.name);
    if (moduleName) {
      applyTankRules([moduleName], TANK_NAME_RULES, scores);
    }
  }
}

function scoreModuleNames(moduleNames: string[], scores: Record<TankType, number>): void {
  for (const moduleName of moduleNames) {
    applyTankRules([moduleName], TANK_NAME_RULES, scores);
  }
}

function applyTankRules(
  values: string[],
  rules: Record<TankType, Array<{ pattern: RegExp; weight: number }>>,
  scores: Record<TankType, number>
): boolean {
  let matched = false;
  for (const tankType of TANK_TYPES) {
    let bestWeight = 0;
    for (const value of values) {
      for (const rule of rules[tankType]) {
        if (rule.pattern.test(value)) {
          bestWeight = Math.max(bestWeight, rule.weight);
        }
      }
    }
    if (bestWeight > 0) {
      scores[tankType] += bestWeight;
      matched = true;
    }
  }
  return matched;
}

function collectModuleEffectNames(module: FitModuleWithDogmaMeta): string[] {
  const effectNames: string[] = [];
  if (Array.isArray(module.effects)) {
    for (const effect of module.effects) {
      if (typeof effect === "string" && effect.trim()) {
        effectNames.push(effect.toLowerCase());
      }
    }
  }
  if (Array.isArray(module.effectsMeta)) {
    for (const effect of module.effectsMeta) {
      if (typeof effect?.effectName === "string" && effect.effectName.trim()) {
        effectNames.push(effect.effectName.toLowerCase());
      }
    }
  }
  return [...new Set(effectNames)];
}

function normalizeModuleName(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toLowerCase();
}

function hasEvidenceUrl(ship: ShipPrediction, pillName: string): boolean {
  return Boolean(evidenceUrl(ship, pillName));
}

function evidenceUrl(ship: ShipPrediction, pillName: string): string | undefined {
  const url = ship.pillEvidence?.[pillName as keyof NonNullable<ShipPrediction["pillEvidence"]>]?.url;
  return typeof url === "string" && url.length > 0 ? url : undefined;
}
