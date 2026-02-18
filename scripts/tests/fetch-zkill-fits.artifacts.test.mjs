import { mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeFetchZkillFitArtifacts } from "../lib/zkill-fit-fetch-cli/artifacts.mjs";

function createRecord({ killmailId, shipTypeId, shipTypeFilterId, fitHash }) {
  return {
    recordId: `zkill-${killmailId}`,
    source: "zkill",
    killmailId,
    killmailTime: "2026-02-17T12:00:00.000Z",
    shipTypeId,
    shipTypeFilterId,
    zkillUrl: `https://zkillboard.com/kill/${killmailId}/`,
    fit: {
      shipTypeId,
      slots: {
        high: [{ typeId: 1001, quantity: 1 }],
        mid: [],
        low: [],
        rig: [],
        subsystem: [],
        otherFitted: []
      },
      fitHash
    },
    raw: {
      zkill: { killmail_id: killmailId },
      esi: { killmail_id: killmailId }
    },
    fetchedAt: "2026-02-18T12:00:00.000Z"
  };
}

function createError({
  stage = "normalize",
  shipTypeId,
  killmailId,
  errorCode = "NORMALIZE_FAILED",
  message = "unable to normalize"
}) {
  return {
    stage,
    shipTypeId,
    killmailId,
    errorCode,
    message,
    retryable: false,
    status: 422,
    headers: {
      "x-debug": "1"
    }
  };
}

async function readJsonl(filePath) {
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("writeFetchZkillFitArtifacts", () => {
  it("writes record JSONL + structured errors and manifest with accurate counts and cursor", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "zkill-fetch-artifacts-"));
    const outputPath = path.join(tempDir, "records.jsonl");
    const errorsOutputPath = path.join(tempDir, "errors.jsonl");
    const manifestOutputPath = path.join(tempDir, "manifest.json");

    const records = [
      createRecord({ killmailId: 1004, shipTypeId: 29984, shipTypeFilterId: 29984, fitHash: "hash-a" }),
      createRecord({ killmailId: 1001, shipTypeId: 29984, shipTypeFilterId: 29984, fitHash: "hash-b" })
    ];
    const errors = [createError({ shipTypeId: 29984, killmailId: 1003 })];

    const manifest = await writeFetchZkillFitArtifacts({
      outputPath,
      errorsOutputPath,
      manifestOutputPath,
      records,
      errors,
      duplicatesSkipped: 2,
      input: {
        shipTypeIds: [29984],
        maxRecords: 200,
        beforeKillmailId: 2000
      },
      generatedAt: "2026-02-18T12:05:00.000Z"
    });

    expect(await readJsonl(outputPath)).toEqual(records);

    const writtenErrors = await readJsonl(errorsOutputPath);
    expect(writtenErrors).toHaveLength(1);
    expect(writtenErrors[0]).toEqual(
      expect.objectContaining({
        at: "2026-02-18T12:05:00.000Z",
        stage: "normalize",
        shipTypeId: 29984,
        killmailId: 1003,
        errorCode: "NORMALIZE_FAILED",
        message: "unable to normalize",
        retryable: false,
        status: 422,
        headers: {
          "x-debug": "1"
        }
      })
    );

    const manifestFromDisk = JSON.parse(await readFile(manifestOutputPath, "utf8"));
    expect(manifestFromDisk).toEqual(manifest);
    expect(manifest).toEqual({
      generatedAt: "2026-02-18T12:05:00.000Z",
      input: {
        shipTypeIds: [29984],
        maxRecords: 200,
        beforeKillmailId: 2000
      },
      output: {
        recordsWritten: 2,
        duplicatesSkipped: 2,
        errorsLogged: 1
      },
      paging: {
        newestKillmailId: 1004,
        oldestKillmailId: 1001,
        nextBeforeKillmailId: 1001
      }
    });
  });

  it("keeps record order deterministic and skips optional artifact files when paths are omitted", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "zkill-fetch-artifacts-"));
    const outputPath = path.join(tempDir, "records-only.jsonl");
    const errorsOutputPath = path.join(tempDir, "errors-not-written.jsonl");
    const manifestOutputPath = path.join(tempDir, "manifest-not-written.json");

    const records = [
      createRecord({ killmailId: 9002, shipTypeId: 29986, shipTypeFilterId: 29986, fitHash: "h2" }),
      createRecord({ killmailId: 9001, shipTypeId: 29986, shipTypeFilterId: 29986, fitHash: "h1" })
    ];

    const manifest = await writeFetchZkillFitArtifacts({
      outputPath,
      records,
      errors: [createError({ shipTypeId: 29986, killmailId: 9000 })],
      duplicatesSkipped: 0,
      input: {
        shipTypeIds: [29986],
        maxRecords: 2
      },
      generatedAt: "2026-02-18T12:06:00.000Z"
    });

    expect((await readJsonl(outputPath)).map((record) => record.killmailId)).toEqual([9002, 9001]);
    expect(manifest.output.errorsLogged).toBe(1);
    expect(manifest.paging.nextBeforeKillmailId).toBe(9001);
    expect(existsSync(errorsOutputPath)).toBe(false);
    expect(existsSync(manifestOutputPath)).toBe(false);
  });
});
