import { fetchJsonWithMeta, fetchJsonWithMetaConditional, type ConditionalHeaders, type RetryInfo } from "../http";
import { ESI_BASE, ESI_DATASOURCE, ZKILL_BASE } from "./constants";
import type { ZkillKillmail } from "./types";

type EsiKillmailResponse = {
  killmail_id: number;
  killmail_time: string;
  solar_system_id?: number;
  victim: ZkillKillmail["victim"];
  attackers?: ZkillKillmail["attackers"];
};

export async function fetchZkillListTransport(
  url: string,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void,
  conditional?: ConditionalHeaders
) {
  return fetchJsonWithMetaConditional<unknown>(
    url,
    {
      headers: {
        Accept: "application/json"
      }
    },
    12000,
    signal,
    onRetry,
    conditional
  );
}

export async function fetchCharacterStatsTransport(
  characterId: number,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
) {
  return fetchJsonWithMeta<unknown>(
    `${ZKILL_BASE}/stats/characterID/${characterId}/`,
    {
      headers: {
        Accept: "application/json"
      }
    },
    12000,
    signal,
    onRetry
  );
}

export async function fetchKillmailDetailsTransport(
  killmailId: number,
  hash: string,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
) {
  return fetchJsonWithMeta<EsiKillmailResponse>(
    `${ESI_BASE}/killmails/${killmailId}/${hash}/?datasource=${ESI_DATASOURCE}`,
    undefined,
    12000,
    signal,
    onRetry
  );
}
