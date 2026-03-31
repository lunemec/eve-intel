import type { RetryInfo } from "../http";
import { HYDRATE_CONCURRENCY } from "./constants";
import type { ZkillKillmail, ZkillSummaryRow } from "./types";

export type KillmailDetailFetcher = (
  killmailId: number,
  hash: string,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
) => Promise<ZkillKillmail | null>;

export function findHydrationCandidates(payload: unknown): ZkillSummaryRow[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter((entry): entry is ZkillSummaryRow => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    const row = entry as Partial<ZkillKillmail>;
    if (typeof row.killmail_id !== "number" || typeof row.zkb?.hash !== "string") {
      return false;
    }

    const victimMissingShip = typeof row.victim?.ship_type_id !== "number";
    const attackers = row.attackers;
    const attackersMissingIdentity =
      !Array.isArray(attackers) ||
      attackers.length === 0 ||
      attackers.every((attacker) => typeof attacker.character_id !== "number" || typeof attacker.ship_type_id !== "number");

    return victimMissingShip || attackersMissingIdentity;
  });
}

export async function hydrateKillmailSummaries(
  rows: ZkillSummaryRow[],
  fetchKillmailDetails: KillmailDetailFetcher,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<ZkillKillmail[]> {
  const output: ZkillKillmail[] = [];
  // Prioritize losses (victim ship type usually higher signal for character activity)
  const prioritized = [...rows].sort((a, b) => {
    const aRow = a as Partial<ZkillKillmail>;
    const bRow = b as Partial<ZkillKillmail>;
    const aIsLoss = typeof aRow.victim?.ship_type_id !== "number" ? 1 : 0;
    const bIsLoss = typeof bRow.victim?.ship_type_id !== "number" ? 1 : 0;
    return bIsLoss - aIsLoss;
  });

  for (let index = 0; index < prioritized.length; index += HYDRATE_CONCURRENCY) {
    if (signal?.aborted) {
      break;
    }
    const batch = prioritized.slice(index, index + HYDRATE_CONCURRENCY);
    const hydrated = await Promise.all(
      batch.map(async (row) => {
        const hash = row.zkb?.hash;
        if (!hash) {
          return null;
        }
        const details = await fetchKillmailDetails(row.killmail_id, hash, signal, onRetry);
        if (!details) {
          return null;
        }
        const normalized: ZkillKillmail = {
          ...details,
          zkb: {
            ...(row.zkb ?? {}),
            ...(details.zkb ?? {}),
            hash,
            totalValue: row.zkb?.totalValue ?? details.zkb?.totalValue
          }
        };
        return normalized;
      })
    );

    for (const entry of hydrated) {
      if (entry) {
        output.push(entry);
      }
    }

    if (index + HYDRATE_CONCURRENCY < prioritized.length) {
      // Small mandatory delay between hydration batches to avoid hitting ESI burst limits.
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  return output;
}
