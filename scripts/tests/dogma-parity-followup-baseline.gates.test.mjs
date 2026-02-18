import { describe, expect, it } from "vitest";
import {
  FOLLOWUP_PHASES,
  evaluateDogmaParityFollowupGates
} from "../lib/dogma-parity-followup-baseline/gates.mjs";

describe("evaluateDogmaParityFollowupGates", () => {
  it("marks fits passing only when every in-scope metric is at or below 10%", () => {
    const evaluation = evaluateDogmaParityFollowupGates({
      summary: {
        thresholdPolicy: { mode: "followup-10pct", relMax: 0.1 },
        perFit: [
          {
            fitId: "fit-pass",
            shipTypeId: 29990,
            maxRelDelta: 0.1,
            failingMetrics: []
          },
          {
            fitId: "fit-fail",
            shipTypeId: 29986,
            maxRelDelta: 0.1001,
            failingMetrics: [
              {
                metric: "dpsTotal",
                absDelta: 11,
                relDelta: 0.1001
              }
            ]
          }
        ]
      }
    });

    expect(evaluation.fits).toEqual([
      {
        fitId: "fit-fail",
        shipTypeId: 29986,
        pass: false,
        maxRelDelta: 0.1001,
        failingMetrics: [
          {
            metric: "dpsTotal",
            absDelta: 11,
            relDelta: 0.1001
          }
        ]
      },
      {
        fitId: "fit-pass",
        shipTypeId: 29990,
        pass: true,
        maxRelDelta: 0.1,
        failingMetrics: []
      }
    ]);
    expect(evaluation.fitPassCount).toBe(1);
    expect(evaluation.fitFailCount).toBe(1);
  });

  it("marks cruiser phase complete only when every cruiser hull reaches the required pass count", () => {
    const evaluation = evaluateDogmaParityFollowupGates({
      summary: {
        thresholdPolicy: { mode: "followup-10pct", relMax: 0.1 },
        perFit: buildPassingFitsForHullSet([
          { shipTypeId: 29990, prefix: "loki", count: 10 },
          { shipTypeId: 29986, prefix: "legion", count: 10 },
          { shipTypeId: 29988, prefix: "proteus", count: 10 },
          { shipTypeId: 29984, prefix: "tengu", count: 10 }
        ])
      }
    });

    expect(evaluation.phases[0]).toEqual({
      phase: "t3-cruiser",
      requiredFits: 10,
      targetMet: true,
      complete: true,
      eligible: true,
      status: "complete",
      hulls: [
        {
          shipTypeId: 29990,
          shipName: "Loki",
          comparedFits: 10,
          passingFits: 10,
          failingFits: 0,
          requiredFits: 10,
          deficit: 0,
          complete: true
        },
        {
          shipTypeId: 29986,
          shipName: "Legion",
          comparedFits: 10,
          passingFits: 10,
          failingFits: 0,
          requiredFits: 10,
          deficit: 0,
          complete: true
        },
        {
          shipTypeId: 29988,
          shipName: "Proteus",
          comparedFits: 10,
          passingFits: 10,
          failingFits: 0,
          requiredFits: 10,
          deficit: 0,
          complete: true
        },
        {
          shipTypeId: 29984,
          shipName: "Tengu",
          comparedFits: 10,
          passingFits: 10,
          failingFits: 0,
          requiredFits: 10,
          deficit: 0,
          complete: true
        }
      ]
    });
    expect(evaluation.activePhase).toBe("t3-destroyer");
  });

  it("rejects destroyer completion when cruiser phase is incomplete", () => {
    const evaluation = evaluateDogmaParityFollowupGates({
      summary: {
        thresholdPolicy: { mode: "followup-10pct", relMax: 0.1 },
        perFit: [
          ...buildPassingFitsForHullSet([
            { shipTypeId: 29990, prefix: "loki", count: 9 },
            { shipTypeId: 29986, prefix: "legion", count: 10 },
            { shipTypeId: 29988, prefix: "proteus", count: 10 },
            { shipTypeId: 29984, prefix: "tengu", count: 10 }
          ]),
          ...buildPassingFitsForHullSet([
            { shipTypeId: 35683, prefix: "hecate", count: 10 },
            { shipTypeId: 34828, prefix: "jackdaw", count: 10 },
            { shipTypeId: 34317, prefix: "confessor", count: 10 },
            { shipTypeId: 34562, prefix: "svipul", count: 10 }
          ])
        ]
      }
    });

    expect(evaluation.phases[0]).toMatchObject({
      phase: "t3-cruiser",
      complete: false,
      status: "in_progress"
    });
    expect(evaluation.phases[1]).toMatchObject({
      phase: "t3-destroyer",
      targetMet: true,
      complete: false,
      eligible: false,
      status: "blocked",
      blockedByPhase: "t3-cruiser"
    });
    expect(evaluation.complete).toBe(false);
    expect(FOLLOWUP_PHASES.map((phase) => phase.phase)).toEqual([
      "t3-cruiser",
      "t3-destroyer"
    ]);
  });
});

function buildPassingFitsForHullSet(hulls) {
  const rows = [];
  for (const hull of hulls) {
    for (let index = 0; index < hull.count; index += 1) {
      rows.push({
        fitId: `${hull.prefix}-${String(index + 1).padStart(2, "0")}`,
        shipTypeId: hull.shipTypeId,
        maxRelDelta: 0.04,
        failingMetrics: []
      });
    }
  }
  return rows;
}
