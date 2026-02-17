declare module "../../../../tools/parity/pyfa-adapter/index.mjs" {
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
  ): import("../lib/dogma/parity/types").ParityMetricResult;
  export function runPyfaDocker(
    params: RunPyfaParams
  ): Promise<import("../lib/dogma/parity/types").ParityMetricResult>;
  export function shutdownPyfaDockerRuntimes(): Promise<void>;
}

declare module "../../../../tools/parity/svcfitstat-replay/index.mjs" {
  export type ParseSvcfitstatFixtureParams = {
    path: string;
    fitId?: string;
    shipTypeId?: number;
    sdeVersion?: string;
  };

  export function parseSvcfitstatCallbackFixture(
    params: ParseSvcfitstatFixtureParams
  ): Promise<import("../lib/dogma/parity/types").ParityMetricResult>;
}
