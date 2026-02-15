export type ParsedPilotInput = {
  pilotName: string;
  explicitShip?: string;
  sourceLine: string;
  parseConfidence: number;
  shipSource: "explicit" | "inferred";
};

export type ParseResult = {
  entries: ParsedPilotInput[];
  rejected: string[];
};

export type Settings = {
  lookbackDays: number;
};
