import { toPctNumber } from "../lib/presentation";
import type { TankType } from "../lib/tank/classifier";

const RESIST_LAYER_META = {
  shield: { short: "S", title: "Shield" },
  armor: { short: "A", title: "Armor" },
  hull: { short: "H", title: "Hull" }
} as const;

export function renderResistCell(value: number, damageClass: string): JSX.Element {
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
