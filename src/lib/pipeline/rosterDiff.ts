import type { ParsedPilotInput } from "../../types";
import { buildEntrySignature, toPilotKey } from "./pilotIdentity";

export type PilotRosterDiff = {
  desiredKeys: Set<string>;
  entrySignatures: Map<string, string>;
  addedKeys: Set<string>;
  removedKeys: Set<string>;
  changedKeys: Set<string>;
};

export function diffPilotRoster(params: {
  entries: ParsedPilotInput[];
  previousRosterKeys: Set<string>;
  previousEntrySignatureByPilotKey: Map<string, string>;
}): PilotRosterDiff {
  const desiredKeys = new Set(params.entries.map((entry) => toPilotKey(entry.pilotName)));
  const entrySignatures = new Map(params.entries.map((entry) => [toPilotKey(entry.pilotName), buildEntrySignature(entry)]));
  const addedKeys = new Set<string>();
  const removedKeys = new Set<string>();
  const changedKeys = new Set<string>();

  for (const key of desiredKeys) {
    if (!params.previousRosterKeys.has(key)) {
      addedKeys.add(key);
    }
  }

  for (const key of params.previousRosterKeys) {
    if (!desiredKeys.has(key)) {
      removedKeys.add(key);
    }
  }

  for (const [key, signature] of entrySignatures.entries()) {
    const previous = params.previousEntrySignatureByPilotKey.get(key);
    if (previous !== undefined && previous !== signature) {
      changedKeys.add(key);
    }
  }

  return {
    desiredKeys,
    entrySignatures,
    addedKeys,
    removedKeys,
    changedKeys
  };
}
