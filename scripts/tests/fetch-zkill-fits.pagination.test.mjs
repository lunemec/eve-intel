import { describe, expect, it } from "vitest";
import { collectZkillLossCandidates } from "../lib/zkill-fit-fetch-cli/pagination.mjs";

function createPageFetcher(pagesByShipType) {
  const calls = [];
  const fetchPage = async ({ shipTypeId, page }) => {
    calls.push({ shipTypeId, page });
    const shipPages = pagesByShipType.get(shipTypeId) ?? new Map();
    return shipPages.get(page) ?? [];
  };
  return { calls, fetchPage };
}

describe("collectZkillLossCandidates", () => {
  it("orders multi-ship candidates newest-to-oldest with deterministic ties", async () => {
    const pagesByShipType = new Map([
      [
        29986,
        new Map([
          [
            1,
            [
              { killmail_id: 41, hash: "alpha-41" },
              { killmail_id: 39, hash: "alpha-39" }
            ]
          ],
          [
            2,
            [
              { killmail_id: 38, hash: "alpha-38" },
              { killmail_id: 34, hash: "alpha-34" }
            ]
          ]
        ])
      ],
      [
        29984,
        new Map([
          [
            1,
            [
              { killmail_id: 41, hash: "beta-41" },
              { killmail_id: 40, hash: "beta-40" }
            ]
          ],
          [
            2,
            [
              { killmail_id: 37, hash: "beta-37" },
              { killmail_id: 36, hash: "beta-36" }
            ]
          ]
        ])
      ]
    ]);
    const { calls, fetchPage } = createPageFetcher(pagesByShipType);

    const result = await collectZkillLossCandidates({
      shipTypeIds: [29986, 29984],
      maxRecords: 6,
      fetchShipTypeLossPage: fetchPage
    });

    expect(result.map((entry) => [entry.shipTypeFilterId, entry.killmailId])).toEqual([
      [29986, 41],
      [29984, 41],
      [29984, 40],
      [29986, 39],
      [29986, 38],
      [29984, 37]
    ]);
    expect(calls.slice(0, 2)).toEqual([
      { shipTypeId: 29986, page: 1 },
      { shipTypeId: 29984, page: 1 }
    ]);
  });

  it("enforces strict before-killmail cursor filtering while paging", async () => {
    const pagesByShipType = new Map([
      [
        29986,
        new Map([
          [
            1,
            [
              { killmail_id: 70, hash: "alpha-70" },
              { killmail_id: 62, hash: "alpha-62" },
              { killmail_id: 59, hash: "alpha-59" }
            ]
          ],
          [
            2,
            [
              { killmail_id: 57, hash: "alpha-57" },
              { killmail_id: 51, hash: "alpha-51" }
            ]
          ]
        ])
      ],
      [
        29984,
        new Map([
          [
            1,
            [
              { killmail_id: 68, hash: "beta-68" },
              { killmail_id: 60, hash: "beta-60" },
              { killmail_id: 58, hash: "beta-58" }
            ]
          ],
          [2, [{ killmail_id: 50, hash: "beta-50" }]]
        ])
      ]
    ]);
    const { fetchPage } = createPageFetcher(pagesByShipType);

    const result = await collectZkillLossCandidates({
      shipTypeIds: [29986, 29984],
      maxRecords: 5,
      beforeKillmailId: 60,
      fetchShipTypeLossPage: fetchPage
    });

    expect(result.map((entry) => entry.killmailId)).toEqual([59, 58, 57, 51, 50]);
    expect(result.every((entry) => entry.killmailId < 60)).toBe(true);
  });

  it("stops once maxRecords is satisfied without fetching additional pages", async () => {
    const pagesByShipType = new Map([
      [
        29986,
        new Map([
          [
            1,
            [
              { killmail_id: 20, hash: "alpha-20" },
              { killmail_id: 19, hash: "alpha-19" },
              { killmail_id: 18, hash: "alpha-18" }
            ]
          ],
          [2, [{ killmail_id: 17, hash: "alpha-17" }]]
        ])
      ]
    ]);
    const { calls, fetchPage } = createPageFetcher(pagesByShipType);

    const result = await collectZkillLossCandidates({
      shipTypeIds: [29986],
      maxRecords: 2,
      fetchShipTypeLossPage: fetchPage
    });

    expect(result.map((entry) => entry.killmailId)).toEqual([20, 19]);
    expect(calls).toEqual([{ shipTypeId: 29986, page: 1 }]);
  });
});
