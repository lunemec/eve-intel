import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runFetchZkillFitPipeline } from "../lib/zkill-fit-fetch-cli/pipeline.mjs";

function createLossPageFetcher(pagesByShipType) {
  return async ({ shipTypeId, page }) => {
    const shipPages = pagesByShipType.get(shipTypeId) ?? new Map();
    return shipPages.get(page) ?? [];
  };
}

function createEsiFetcher(entriesByKillmailId) {
  const calls = [];
  const fetchEsiKillmail = async ({ killmailId, killmailHash }) => {
    calls.push({ killmailId, killmailHash });
    const entry = entriesByKillmailId.get(killmailId);
    if (entry instanceof Error) {
      throw entry;
    }
    if (!entry) {
      throw createHttpError(404, `killmail ${killmailId} not found`);
    }
    return entry;
  };
  return { calls, fetchEsiKillmail };
}

function createHttpError(status, message, headers = {}) {
  const error = new Error(message);
  error.status = status;
  error.headers = headers;
  return error;
}

async function readJsonl(filePath) {
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function esiKillmail({ killmailId, shipTypeId, killmailTime, items }) {
  return {
    killmail_id: killmailId,
    killmail_time: killmailTime,
    victim: {
      ship_type_id: shipTypeId,
      items
    }
  };
}

describe("runFetchZkillFitPipeline", () => {
  it("runs full mocked pipeline with deterministic ordering, dedupe, partial-failure continuation, and artifacts", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "zkill-fetch-integration-"));
    const outputPath = path.join(tempDir, "records.jsonl");
    const errorsOutputPath = path.join(tempDir, "errors.jsonl");
    const manifestOutputPath = path.join(tempDir, "manifest.json");

    const pagesByShipType = new Map([
      [
        29984,
        new Map([
          [
            1,
            [
              { killmail_id: 1006, killmail_time: "2026-02-18T10:06:00.000Z", zkb: { hash: "hash-a" } },
              {
                killmail_id: 1003,
                killmail_time: "2026-02-18T10:03:00.000Z",
                zkb: { hash: "hash-missing-esi" }
              },
              { killmail_id: 1001, killmail_time: "2026-02-18T10:01:00.000Z", zkb: { hash: "hash-dup" } }
            ]
          ],
          [2, []]
        ])
      ],
      [
        29986,
        new Map([
          [
            1,
            [
              { killmail_id: 1005, killmail_time: "2026-02-18T10:05:00.000Z", zkb: { hash: "hash-b" } },
              {
                killmail_id: 1004,
                killmail_time: "2026-02-18T10:04:00.000Z",
                zkb: { hash: "hash-bad-normalize" }
              }
            ]
          ],
          [2, []]
        ])
      ]
    ]);

    const { calls: esiCalls, fetchEsiKillmail } = createEsiFetcher(
      new Map([
        [
          1006,
          esiKillmail({
            killmailId: 1006,
            killmailTime: "2026-02-18T10:06:00.000Z",
            shipTypeId: 29984,
            items: [
              { item_type_id: 2001, flag: 27, quantity_destroyed: 1, quantity_dropped: 0 },
              { item_type_id: 2002, flag: 28, quantity_destroyed: 0, quantity_dropped: 1 }
            ]
          })
        ],
        [
          1005,
          esiKillmail({
            killmailId: 1005,
            killmailTime: "2026-02-18T10:05:00.000Z",
            shipTypeId: 29986,
            items: [{ item_type_id: 3001, flag: 19, quantity_destroyed: 0, quantity_dropped: 1 }]
          })
        ],
        [1004, esiKillmail({ killmailId: 1004, killmailTime: "2026-02-18T10:04:00.000Z", items: [] })],
        [1003, createHttpError(404, "ESI killmail not found")],
        [
          1001,
          esiKillmail({
            killmailId: 1001,
            killmailTime: "2026-02-18T10:01:00.000Z",
            shipTypeId: 29984,
            items: [
              { item_type_id: 2001, flag: 27, quantity_destroyed: 1, quantity_dropped: 0 },
              { item_type_id: 2002, flag: 28, quantity_destroyed: 0, quantity_dropped: 1 }
            ]
          })
        ]
      ])
    );

    const result = await runFetchZkillFitPipeline(
      {
        shipTypeIds: [29984, 29986],
        maxRecords: 5,
        outputPath,
        errorsOutputPath,
        manifestOutputPath,
        retryPolicy: { maxAttempts: 1, baseMs: 1, maxMs: 1 },
        requestTimeoutMs: 500,
        generatedAt: "2026-02-18T12:30:00.000Z"
      },
      {
        fetchShipTypeLossPage: createLossPageFetcher(pagesByShipType),
        fetchEsiKillmail
      }
    );

    expect(esiCalls.map((call) => call.killmailId)).toEqual([1006, 1005, 1004, 1003, 1001]);

    const records = await readJsonl(outputPath);
    expect(records.map((record) => record.killmailId)).toEqual([1006, 1005]);
    expect(records[0]).toEqual(
      expect.objectContaining({
        recordId: "zkill-1006",
        source: "zkill",
        killmailTime: "2026-02-18T10:06:00.000Z",
        shipTypeId: 29984,
        shipTypeFilterId: 29984,
        zkillUrl: "https://zkillboard.com/kill/1006/",
        fetchedAt: "2026-02-18T12:30:00.000Z",
        raw: expect.objectContaining({
          zkill: expect.objectContaining({ killmail_id: 1006 }),
          esi: expect.objectContaining({ killmail_id: 1006 })
        })
      })
    );

    expect(records[0].fit.slots.high).toEqual([
      { typeId: 2001, quantity: 1 },
      { typeId: 2002, quantity: 1 }
    ]);

    const errors = await readJsonl(errorsOutputPath);
    expect(errors.map((error) => [error.stage, error.killmailId])).toEqual([
      ["normalize", 1004],
      ["esi_fetch", 1003]
    ]);
    expect(errors[1]).toEqual(
      expect.objectContaining({
        at: "2026-02-18T12:30:00.000Z",
        errorCode: "ESI_FETCH_FAILED",
        retryable: false,
        status: 404
      })
    );

    const manifest = JSON.parse(await readFile(manifestOutputPath, "utf8"));
    expect(manifest.output).toEqual({
      recordsWritten: 2,
      duplicatesSkipped: 1,
      errorsLogged: 2
    });
    expect(manifest.paging).toEqual({
      newestKillmailId: 1006,
      oldestKillmailId: 1005,
      nextBeforeKillmailId: 1005
    });

    expect(result.manifest).toEqual(manifest);
    expect(result.records.map((record) => record.killmailId)).toEqual([1006, 1005]);
    expect(result.errors).toHaveLength(2);
  });

  it("exposes npm script wiring for agent usage", async () => {
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.scripts["zkill:fits:fetch"]).toBe("node scripts/fetch-zkill-fits.mjs");
  });
});
