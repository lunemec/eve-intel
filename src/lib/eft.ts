import type { FitCandidate } from "./intel";

export function formatFitAsEft(shipName: string, fit?: FitCandidate): string {
  if (!fit) {
    return `[${shipName}, Unknown Fit]`;
  }

  const grouped = fit.eftSections;
  const lines: string[] = [`[${shipName}, Inferred ${fit.confidence}%]`, ""];

  if (grouped && hasAnyGroupedModules(grouped)) {
    appendGroup(lines, "High Slots", grouped.high);
    appendGroup(lines, "Mid Slots", grouped.mid);
    appendGroup(lines, "Low Slots", grouped.low);
    appendGroup(lines, "Rig Slots", grouped.rig);
    appendGroup(lines, "Other", grouped.other);
    return lines.join("\n").trimEnd();
  }

  const modules = splitFitModules(fit.fitLabel);
  if (modules.length === 0) {
    lines.push("[no modules resolved]");
    return lines.join("\n");
  }
  for (const module of modules) {
    lines.push(module);
  }
  return lines.join("\n");
}

function splitFitModules(label: string): string[] {
  return label
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function hasAnyGroupedModules(sections: NonNullable<FitCandidate["eftSections"]>): boolean {
  return (
    sections.high.length > 0 ||
    sections.mid.length > 0 ||
    sections.low.length > 0 ||
    sections.rig.length > 0 ||
    sections.cargo.length > 0 ||
    sections.other.length > 0
  );
}

function appendGroup(lines: string[], title: string, modules: string[]): void {
  if (modules.length === 0) {
    return;
  }
  lines.push(`${title}:`);
  for (const module of modules) {
    lines.push(module);
  }
  lines.push("");
}
