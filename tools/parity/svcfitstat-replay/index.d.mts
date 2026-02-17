export type ParseSvcfitstatFixtureParams = {
  path: string;
  fitId?: string;
  shipTypeId?: number;
  sdeVersion?: string;
};

export function parseSvcfitstatCallbackFixture(
  params: ParseSvcfitstatFixtureParams
): Promise<import("../../../src/lib/dogma/parity/types").ParityMetricResult>;
