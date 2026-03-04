import type { GroupPresentation } from "../lib/appViewModel";

export function buildSuggestionHoverTitle(groupPresentation: GroupPresentation | undefined): string | undefined {
  if (!groupPresentation?.isGreyedSuggestion) {
    return undefined;
  }
  const strongestRatio = groupPresentation.suggestionStrongestRatio;
  if (typeof strongestRatio !== "number" || !Number.isFinite(strongestRatio)) {
    return undefined;
  }
  const strongestSourcePilotName =
    groupPresentation.suggestionStrongestSourcePilotName ??
    (groupPresentation.suggestionStrongestSourcePilotId
      ? `Character ${groupPresentation.suggestionStrongestSourcePilotId}`
      : "a selected pilot");
  const strongestSharedKillCount = groupPresentation.suggestionStrongestSharedKillCount;
  const strongestWindowKillCount = groupPresentation.suggestionStrongestWindowKillCount;
  if (
    typeof strongestSharedKillCount === "number" &&
    Number.isFinite(strongestSharedKillCount) &&
    strongestSharedKillCount > 0
  ) {
    if (
      typeof strongestWindowKillCount === "number" &&
      Number.isFinite(strongestWindowKillCount) &&
      strongestWindowKillCount > 0
    ) {
      return `This pilot is on ${strongestSharedKillCount} kills with ${strongestSourcePilotName} (${formatSuggestionRatioPercent(strongestRatio)}% of last ${strongestWindowKillCount} kills).`;
    }
    return `This pilot is on ${strongestSharedKillCount} kills with ${strongestSourcePilotName} (${formatSuggestionRatioPercent(strongestRatio)}%).`;
  }
  return `This pilot is on ${formatSuggestionRatioPercent(strongestRatio)}% with ${strongestSourcePilotName}.`;
}

function formatSuggestionRatioPercent(ratio: number): string {
  const roundedPercent = Math.round(ratio * 1000) / 10;
  return Number.isInteger(roundedPercent) ? roundedPercent.toFixed(0) : roundedPercent.toFixed(1);
}
