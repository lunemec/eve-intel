export type NormalizedEft = {
  shipName: string;
  normalized: string;
};

export type RunPyfaParams = {
  fitId: string;
  shipTypeId: number;
  eft: string;
  sdeVersion?: string;
  pythonBin?: string;
  scriptPath?: string;
  timeoutMs?: number;
  hardKillMs?: number;
  debug?: boolean;
};

export const DEFAULT_PYFA_PYTHON: string;
export function normalizeEft(eft: string): NormalizedEft;
export function parsePyfaOutput(
  stdout: string,
  fitId: string,
  shipTypeId: number,
  sdeVersion: string,
  runner?: string
): import("../../../src/lib/dogma/parity/types").ParityMetricResult;
export function runPyfaLocal(
  params: RunPyfaParams
): Promise<import("../../../src/lib/dogma/parity/types").ParityMetricResult>;
export function shutdownPyfaLocalRuntimes(): Promise<void>;
