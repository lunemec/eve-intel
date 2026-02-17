export type NormalizedEft = {
  shipName: string;
  normalized: string;
};

export type RunPyfaParams = {
  fitId: string;
  shipTypeId: number;
  eft: string;
  sdeVersion?: string;
  image?: string;
  mode?: "web" | "direct-cli";
  timeoutMs?: number;
  hardKillMs?: number;
  debug?: boolean;
};

export const DEFAULT_PYFA_IMAGE: string;
export function normalizeEft(eft: string): NormalizedEft;
export function parsePyfaOutput(
  stdout: string,
  fitId: string,
  shipTypeId: number,
  sdeVersion: string,
  image?: string
): import("../../../src/lib/dogma/parity/types").ParityMetricResult;
export function runPyfaDocker(
  params: RunPyfaParams
): Promise<import("../../../src/lib/dogma/parity/types").ParityMetricResult>;
export function shutdownPyfaDockerRuntimes(): Promise<void>;
