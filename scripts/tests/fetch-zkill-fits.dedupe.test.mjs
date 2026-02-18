import { describe, expect, it } from "vitest";
import {
  dedupeFitRecords,
  computeCanonicalFitHash
} from "../lib/zkill-fit-fetch-cli/dedupe.mjs";

function createFit({
  shipTypeId = 29984,
  high = [],
  mid = [],
  low = [],
  rig = [],
  subsystem = [],
  otherFitted = []
} = {}) {
  return {
    shipTypeId,
    slots: {
      high,
      mid,
      low,
      rig,
      subsystem,
      otherFitted
    }
  };
}

function createRecord({ killmailId, fit, fitHash }) {
  const normalizedFit = {
    ...fit,
    fitHash
  };
  return {
    killmailId,
    fit: normalizedFit
  };
}

describe("computeCanonicalFitHash", () => {
  it("returns the same hash for semantically equivalent fits", () => {
    const first = createFit({
      shipTypeId: 29984,
      high: [
        { typeId: 1201, quantity: 1, chargeTypeId: 2201, chargeQuantity: 1 },
        { typeId: 1202, quantity: 2 }
      ],
      mid: [{ typeId: 1301, quantity: 1 }]
    });

    const equivalent = createFit({
      shipTypeId: 29984,
      high: [
        { typeId: 1202, quantity: 2 },
        { chargeQuantity: 1, typeId: 1201, chargeTypeId: 2201, quantity: 1 }
      ],
      mid: [{ quantity: 1, typeId: 1301 }]
    });

    expect(computeCanonicalFitHash(first)).toEqual(computeCanonicalFitHash(equivalent));
  });
});

describe("dedupeFitRecords", () => {
  it("skips duplicate killmailId values and keeps first deterministic occurrence", () => {
    const fitA = createFit({ shipTypeId: 29984, high: [{ typeId: 1001, quantity: 1 }] });
    const fitB = createFit({ shipTypeId: 29984, high: [{ typeId: 1002, quantity: 1 }] });

    const records = [
      createRecord({ killmailId: 5001, fit: fitA }),
      createRecord({ killmailId: 5001, fit: fitB }),
      createRecord({ killmailId: 5000, fit: fitB })
    ];

    const result = dedupeFitRecords(records);

    expect(result.records).toEqual([records[0], records[2]]);
    expect(result.duplicatesSkipped).toBe(1);
  });

  it("skips duplicate canonical fitHash collisions across different killmails", () => {
    const fitA = createFit({
      shipTypeId: 17726,
      high: [{ typeId: 8101, quantity: 1 }],
      low: [{ typeId: 9101, quantity: 1 }]
    });
    const equivalentFitA = createFit({
      shipTypeId: 17726,
      low: [{ quantity: 1, typeId: 9101 }],
      high: [{ quantity: 1, typeId: 8101 }]
    });

    const records = [
      createRecord({ killmailId: 4100, fit: fitA }),
      createRecord({ killmailId: 4099, fit: equivalentFitA }),
      createRecord({
        killmailId: 4098,
        fit: createFit({ shipTypeId: 17726, high: [{ typeId: 8102, quantity: 1 }] })
      })
    ];

    const result = dedupeFitRecords(records);

    expect(result.records).toEqual([records[0], records[2]]);
    expect(result.duplicatesSkipped).toBe(1);
  });

  it("preserves input order of retained records while applying both dedupe keys", () => {
    const fitA = createFit({ shipTypeId: 29984, high: [{ typeId: 7001, quantity: 1 }] });
    const fitB = createFit({ shipTypeId: 29984, high: [{ typeId: 7002, quantity: 1 }] });

    const records = [
      createRecord({ killmailId: 3005, fit: fitA }),
      createRecord({ killmailId: 3004, fit: fitA }),
      createRecord({ killmailId: 3003, fit: fitB }),
      createRecord({ killmailId: 3003, fit: fitB }),
      createRecord({ killmailId: 3002, fit: fitA })
    ];

    const result = dedupeFitRecords(records);

    expect(result.records).toEqual([records[0], records[2]]);
    expect(result.duplicatesSkipped).toBe(3);
    expect(result.records.map((record) => record.killmailId)).toEqual([3005, 3003]);
  });
});
