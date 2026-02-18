import { describe, expect, it } from "vitest";
import { buildDogmaParityFollowupPrioritizationBacklog } from "../lib/dogma-parity-followup-baseline/prioritization.mjs";

describe("buildDogmaParityFollowupPrioritizationBacklog", () => {
  it("builds deterministic mechanic-cluster backlog with full score breakdown", () => {
    const summary = {
      generatedAt: "2026-02-18T14:30:00.000Z",
      thresholdPolicy: {
        mode: "followup-10pct",
        relMax: 0.1
      },
      perFit: [
        {
          fitId: "fit-a",
          shipTypeId: 29990,
          maxRelDelta: 0.2,
          failingMetrics: [
            {
              metric: "dpsTotal",
              absDelta: 20,
              relDelta: 0.2
            },
            {
              metric: "alpha",
              absDelta: 15,
              relDelta: 0.15
            }
          ]
        },
        {
          fitId: "fit-b",
          shipTypeId: 29990,
          maxRelDelta: 0.14,
          failingMetrics: [
            {
              metric: "resists.shield.em",
              absDelta: 14,
              relDelta: 0.14
            }
          ]
        },
        {
          fitId: "fit-c",
          shipTypeId: 29986,
          maxRelDelta: 0.18,
          failingMetrics: [
            {
              metric: "dpsTotal",
              absDelta: 18,
              relDelta: 0.18
            }
          ]
        },
        {
          fitId: "fit-d",
          shipTypeId: 35683,
          maxRelDelta: 0.26,
          failingMetrics: [
            {
              metric: "ehp",
              absDelta: 30,
              relDelta: 0.26
            }
          ]
        }
      ],
      gateEvaluation: {
        requiredFitsPerHull: 10,
        phases: [
          {
            phase: "t3-cruiser",
            hulls: [
              {
                shipTypeId: 29990,
                deficit: 8
              },
              {
                shipTypeId: 29986,
                deficit: 9
              }
            ]
          },
          {
            phase: "t3-destroyer",
            hulls: [
              {
                shipTypeId: 35683,
                deficit: 10
              }
            ]
          }
        ]
      }
    };

    const backlogA = buildDogmaParityFollowupPrioritizationBacklog({ summary });
    const backlogB = buildDogmaParityFollowupPrioritizationBacklog({ summary });

    expect(backlogA).toEqual(backlogB);
    expect(backlogA).toEqual({
      generatedAt: "2026-02-18T14:30:00.000Z",
      thresholdPolicy: {
        mode: "followup-10pct",
        relMax: 0.1
      },
      scoringModel: "followup-priority-v1",
      items: [
        {
          id: "cluster-damage-output",
          likelyMechanicFamily: "damage-output",
          fitIds: ["fit-a", "fit-c"],
          shipTypeIds: [29986, 29990],
          metrics: ["alpha", "dpsTotal"],
          score: 1.52,
          scoreBreakdown: {
            errorSeverity: 0.2,
            hullGatePressure: 1.9,
            mechanicReuse: 2,
            fitPrevalence: 2
          },
          status: "todo"
        },
        {
          id: "cluster-effective-hit-points",
          likelyMechanicFamily: "effective-hit-points",
          fitIds: ["fit-d"],
          shipTypeIds: [35683],
          metrics: ["ehp"],
          score: 0.52,
          scoreBreakdown: {
            errorSeverity: 0.26,
            hullGatePressure: 2,
            mechanicReuse: 1,
            fitPrevalence: 1
          },
          status: "todo"
        },
        {
          id: "cluster-resist-profile",
          likelyMechanicFamily: "resist-profile",
          fitIds: ["fit-b"],
          shipTypeIds: [29990],
          metrics: ["resists.shield.em"],
          score: 0.252,
          scoreBreakdown: {
            errorSeverity: 0.14,
            hullGatePressure: 1.8,
            mechanicReuse: 1,
            fitPrevalence: 1
          },
          status: "todo"
        }
      ]
    });
  });

  it("uses stable mechanic-family ordering when scores tie", () => {
    const backlog = buildDogmaParityFollowupPrioritizationBacklog({
      summary: {
        thresholdPolicy: {
          mode: "followup-10pct",
          relMax: 0.1
        },
        perFit: [
          {
            fitId: "fit-a",
            shipTypeId: 29990,
            maxRelDelta: 0.2,
            failingMetrics: [{ metric: "dpsTotal", absDelta: 2, relDelta: 0.2 }]
          },
          {
            fitId: "fit-b",
            shipTypeId: 29990,
            maxRelDelta: 0.2,
            failingMetrics: [{ metric: "ehp", absDelta: 3, relDelta: 0.2 }]
          }
        ],
        gateEvaluation: {
          requiredFitsPerHull: 10,
          phases: [
            {
              hulls: [
                {
                  shipTypeId: 29990,
                  deficit: 8
                }
              ]
            }
          ]
        }
      }
    });

    expect(backlog.items.map((item) => item.likelyMechanicFamily)).toEqual([
      "damage-output",
      "effective-hit-points"
    ]);
  });
});
