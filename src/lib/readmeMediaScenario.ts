import type { GroupPresentation } from "./appViewModel";
import type { CombatMetrics, FitResolvedSlots } from "./dogma/types";
import type { FitCandidate, FitEftSections, ShipPrediction } from "./intel";
import type { PillEvidence } from "./pillEvidence";
import type { PilotCard } from "./pilotDomain";
import { TOP_SHIP_CANDIDATES } from "./pipeline/constants";

const README_MEDIA_MODE_PARAM = "readmeMedia";
const README_MEDIA_SCENE_PARAM = "mediaScene";
const README_MEDIA_FRAME_PARAM = "mediaFrame";
const README_MEDIA_ENABLED_VALUE = "1";

const README_MEDIA_SCENE_FRAMES = {
  hero: ["overview", "pipeline", "fleet"],
  "progressive-inference": ["start", "enriching", "ready"],
  "fit-metrics": ["fit", "metrics", "roles"],
  "fleet-summary": ["groups", "suggested", "narrow"]
} as const;

export type ReadmeMediaSceneId = keyof typeof README_MEDIA_SCENE_FRAMES;
export type ReadmeMediaFrameId = (typeof README_MEDIA_SCENE_FRAMES)[ReadmeMediaSceneId][number];

type ReadmeMediaSnapshotTemplate = {
  selectedPilotCards: ReadonlyArray<PilotCard>;
  displayPilotCards: ReadonlyArray<PilotCard>;
  groupPresentationByPilotId: ReadonlyMap<number, GroupPresentation>;
  fitMetricsByFitLabel: ReadonlyMap<string, CombatMetrics>;
};

type ReadmeMediaModeDisabled = {
  enabled: false;
};

type ReadmeMediaModeEnabled = {
  enabled: true;
  sceneId: ReadmeMediaSceneId;
  frameId: ReadmeMediaFrameId;
};

export type ReadmeMediaMode = ReadmeMediaModeDisabled | ReadmeMediaModeEnabled;

export type ReadmeMediaSnapshot = {
  sceneId: ReadmeMediaSceneId;
  frameId: ReadmeMediaFrameId;
  selectedPilotCards: PilotCard[];
  displayPilotCards: PilotCard[];
  groupPresentationByPilotId: ReadonlyMap<number, GroupPresentation>;
  fitMetricsByFitLabel: ReadonlyMap<string, CombatMetrics>;
};

const NOW_ISO = "2026-03-04T00:00:00.000Z";

const METRICS_BRAWLER: CombatMetrics = {
  dpsTotal: 948,
  alpha: 1112,
  damageSplit: { em: 0.11, therm: 0.32, kin: 0.43, exp: 0.14 },
  engagementRange: { optimal: 14800, falloff: 9200, missileMax: 0, effectiveBand: 24000 },
  speed: { base: 332, propOn: 1740, propOnHeated: 2010 },
  signature: { base: 126, propOn: 583 },
  ehp: 95520,
  resists: {
    shield: { em: 0.48, therm: 0.63, kin: 0.71, exp: 0.78 },
    armor: { em: 0.65, therm: 0.59, kin: 0.57, exp: 0.69 },
    hull: { em: 0.33, therm: 0.33, kin: 0.33, exp: 0.33 }
  },
  confidence: 86,
  assumptions: ["Abyssal module rolls approximated", "Heat disabled for sustained DPS"],
  primaryDpsGroup: "turret",
  primaryDpsTypeId: 29990,
  primaryDpsSourceLabel: "Loki",
  propulsionKind: "mwd"
};

const METRICS_SUPPORT: CombatMetrics = {
  dpsTotal: 412,
  alpha: 540,
  damageSplit: { em: 0.08, therm: 0.22, kin: 0.51, exp: 0.19 },
  engagementRange: { optimal: 35200, falloff: 11200, missileMax: 0, effectiveBand: 42000 },
  speed: { base: 305, propOn: 1422, propOnHeated: 1708 },
  signature: { base: 118, propOn: 464 },
  ehp: 71210,
  resists: {
    shield: { em: 0.39, therm: 0.58, kin: 0.67, exp: 0.73 },
    armor: { em: 0.51, therm: 0.53, kin: 0.59, exp: 0.62 },
    hull: { em: 0.33, therm: 0.33, kin: 0.33, exp: 0.33 }
  },
  confidence: 79,
  assumptions: ["Ancillary booster charges estimated", "Drone travel time omitted"],
  primaryDpsGroup: "launcher",
  primaryDpsTypeId: 22468,
  primaryDpsSourceLabel: "Claymore",
  propulsionKind: "ab"
};

const FIT_LOKI_TACKLE = createFitCandidate({
  shipTypeId: 29990,
  fitLabel: "Loki Tackle Net",
  confidence: 0.87,
  sourceLossKillmailId: 120001001,
  modulesBySlot: {
    high: [
      { typeId: 33400, name: "Heavy Assault Missile Launcher II" },
      { typeId: 33400, name: "Heavy Assault Missile Launcher II" },
      { typeId: 33400, name: "Heavy Assault Missile Launcher II" },
      { typeId: 33400, name: "Heavy Assault Missile Launcher II" },
      { typeId: 2281, name: "Covert Ops Cloaking Device II" }
    ],
    mid: [
      { typeId: 12058, name: "50MN Quad LiF Restrained Microwarpdrive" },
      { typeId: 3242, name: "Warp Disruptor II" },
      { typeId: 526, name: "Stasis Webifier II" },
      { typeId: 16469, name: "Medium Gremlin Compact Energy Neutralizer" },
      { typeId: 2281, name: "Large Shield Extender II" }
    ],
    low: [
      { typeId: 1403, name: "Damage Control II" },
      { typeId: 2605, name: "Nanofiber Internal Structure II" },
      { typeId: 4405, name: "Ballistic Control System II" }
    ],
    rig: [
      { typeId: 31794, name: "Medium Core Defense Field Extender I" },
      { typeId: 31794, name: "Medium Core Defense Field Extender I" }
    ],
    cargo: [],
    other: [{ typeId: 2456, name: "Warrior II", quantity: 5 }]
  }
});

const FIT_LOKI_RANGE = createFitCandidate({
  shipTypeId: 29990,
  fitLabel: "Loki Range Skirmish",
  confidence: 0.81,
  sourceLossKillmailId: 120001002,
  modulesBySlot: {
    high: [
      { typeId: 32420, name: "Heavy Missile Launcher II" },
      { typeId: 32420, name: "Heavy Missile Launcher II" },
      { typeId: 32420, name: "Heavy Missile Launcher II" },
      { typeId: 32420, name: "Heavy Missile Launcher II" }
    ],
    mid: [
      { typeId: 12058, name: "50MN Microwarpdrive II" },
      { typeId: 3242, name: "Warp Disruptor II" },
      { typeId: 526, name: "Stasis Webifier II" },
      { typeId: 4435, name: "Large Shield Extender II" }
    ],
    low: [
      { typeId: 1403, name: "Damage Control II" },
      { typeId: 2605, name: "Nanofiber Internal Structure II" },
      { typeId: 2048, name: "Ballistic Control System II" }
    ],
    rig: [
      { typeId: 31794, name: "Medium Core Defense Field Extender I" },
      { typeId: 31792, name: "Medium Hydraulic Bay Thrusters I" }
    ],
    cargo: [],
    other: [{ typeId: 2456, name: "Warrior II", quantity: 5 }]
  }
});

const FIT_CLAYMORE = createFitCandidate({
  shipTypeId: 22468,
  fitLabel: "Claymore Burst Anchor",
  confidence: 0.74,
  sourceLossKillmailId: 120001003,
  modulesBySlot: {
    high: [
      { typeId: 35658, name: "Rapid Heavy Missile Launcher II" },
      { typeId: 35658, name: "Rapid Heavy Missile Launcher II" },
      { typeId: 35658, name: "Rapid Heavy Missile Launcher II" },
      { typeId: 35658, name: "Rapid Heavy Missile Launcher II" }
    ],
    mid: [
      { typeId: 5973, name: "10MN Afterburner II" },
      { typeId: 3242, name: "Warp Disruptor II" },
      { typeId: 4435, name: "Large Shield Extender II" },
      { typeId: 4435, name: "Large Shield Extender II" }
    ],
    low: [
      { typeId: 1403, name: "Damage Control II" },
      { typeId: 2605, name: "Nanofiber Internal Structure II" },
      { typeId: 2048, name: "Ballistic Control System II" }
    ],
    rig: [
      { typeId: 31794, name: "Medium Core Defense Field Extender I" },
      { typeId: 31794, name: "Medium Core Defense Field Extender I" }
    ],
    cargo: [],
    other: [{ typeId: 2456, name: "Warrior II", quantity: 5 }]
  }
});

const FIT_ZKILL_LOKI = createFitCandidate({
  shipTypeId: 29990,
  fitLabel: "ZKB Loki 133445909",
  confidence: 0.86,
  sourceLossKillmailId: 133445909,
  eftSections: {
    high: [
      "Covert Ops Cloaking Device II",
      "Expanded Probe Launcher II, Sisters Combat Scanner Probe",
      "Heavy Assault Missile Launcher II, Inferno Rage Heavy Assault Missile",
      "Heavy Assault Missile Launcher II, Inferno Rage Heavy Assault Missile",
      "Heavy Assault Missile Launcher II, Inferno Rage Heavy Assault Missile",
      "Heavy Assault Missile Launcher II, Inferno Rage Heavy Assault Missile",
      "Heavy Assault Missile Launcher II, Inferno Rage Heavy Assault Missile",
      "Small Ghoul Compact Energy Nosferatu"
    ],
    mid: [
      "10MN Y-S8 Compact Afterburner",
      "Dread Guristas Shield Boost Amplifier",
      "Dread Guristas Warp Disruptor",
      "Federation Navy Stasis Webifier",
      "Medium F-RX Compact Capacitor Booster",
      "Pith X-Type Large Shield Booster",
      "Republic Fleet Large Shield Extender"
    ],
    low: ["Ballistic Control System II", "Ballistic Control System II"],
    rig: [
      "Medium Semiconductor Memory Cell I",
      "Medium Semiconductor Memory Cell II",
      "Medium Semiconductor Memory Cell II"
    ],
    cargo: [],
    other: [
      "Loki Core - Immobility Drivers",
      "Loki Defensive - Covert Reconfiguration",
      "Loki Offensive - Launcher Efficiency Configuration",
      "Loki Propulsion - Wake Limiter",
      "Hornet EC-300 x3"
    ]
  },
  modulesBySlot: {
    high: [
      { typeId: 11578, name: "Covert Ops Cloaking Device II" },
      {
        typeId: 24283,
        name: "Expanded Probe Launcher II",
        chargeTypeId: 30488,
        chargeName: "Sisters Combat Scanner Probe"
      },
      {
        typeId: 28754,
        name: "Heavy Assault Missile Launcher II",
        chargeTypeId: 2637,
        chargeName: "Inferno Rage Heavy Assault Missile"
      },
      {
        typeId: 28754,
        name: "Heavy Assault Missile Launcher II",
        chargeTypeId: 2637,
        chargeName: "Inferno Rage Heavy Assault Missile"
      },
      {
        typeId: 28754,
        name: "Heavy Assault Missile Launcher II",
        chargeTypeId: 2637,
        chargeName: "Inferno Rage Heavy Assault Missile"
      },
      {
        typeId: 28754,
        name: "Heavy Assault Missile Launcher II",
        chargeTypeId: 2637,
        chargeName: "Inferno Rage Heavy Assault Missile"
      },
      {
        typeId: 28754,
        name: "Heavy Assault Missile Launcher II",
        chargeTypeId: 2637,
        chargeName: "Inferno Rage Heavy Assault Missile"
      },
      { typeId: 520, name: "Small Ghoul Compact Energy Nosferatu" }
    ],
    mid: [
      { typeId: 5945, name: "10MN Y-S8 Compact Afterburner" },
      { typeId: 3346, name: "Dread Guristas Shield Boost Amplifier" },
      { typeId: 3329, name: "Dread Guristas Warp Disruptor" },
      { typeId: 30328, name: "Federation Navy Stasis Webifier" },
      { typeId: 35657, name: "Medium F-RX Compact Capacitor Booster" },
      { typeId: 24692, name: "Pith X-Type Large Shield Booster" },
      { typeId: 31914, name: "Republic Fleet Large Shield Extender" }
    ],
    low: [
      { typeId: 2048, name: "Ballistic Control System II" },
      { typeId: 2048, name: "Ballistic Control System II" }
    ],
    rig: [
      { typeId: 31810, name: "Medium Semiconductor Memory Cell I" },
      { typeId: 31812, name: "Medium Semiconductor Memory Cell II" },
      { typeId: 31812, name: "Medium Semiconductor Memory Cell II" }
    ],
    cargo: [],
    other: [
      { typeId: 45601, name: "Loki Core - Immobility Drivers" },
      { typeId: 45602, name: "Loki Defensive - Covert Reconfiguration" },
      { typeId: 45603, name: "Loki Offensive - Launcher Efficiency Configuration" },
      { typeId: 45604, name: "Loki Propulsion - Wake Limiter" },
      { typeId: 2454, name: "Hornet EC-300", quantity: 3 }
    ]
  }
});

const FIT_ZKILL_VULTURE = createFitCandidate({
  shipTypeId: 22446,
  fitLabel: "ZKB Vulture 133429565",
  confidence: 0.79,
  sourceLossKillmailId: 133429565,
  eftSections: {
    high: [
      "250mm Railgun II, Caldari Navy Uranium Charge M",
      "250mm Railgun II, Caldari Navy Uranium Charge M",
      "250mm Railgun II, Caldari Navy Uranium Charge M",
      "250mm Railgun II, Caldari Navy Uranium Charge M",
      "Shield Command Burst II, Active Shielding Charge",
      "Shield Command Burst II, Shield Extension Charge",
      "Shield Command Burst II, Shield Harmonizing Charge"
    ],
    mid: [
      "50MN Quad LiF Restrained Microwarpdrive",
      "EM Shield Hardener II",
      "Large Shield Extender II",
      "Large Shield Extender II",
      "Multispectrum Shield Hardener II",
      "Small Capacitor Booster II"
    ],
    low: [
      "Damage Control II",
      "Magnetic Field Stabilizer II",
      "Magnetic Field Stabilizer II",
      "Tracking Enhancer II"
    ],
    rig: ["Medium Command Processor I", "Medium Core Defense Field Extender II"],
    cargo: [],
    other: ["Hornet EC-300", "Hornet EC-300 x2"]
  },
  modulesBySlot: {
    high: [
      {
        typeId: 3065,
        name: "250mm Railgun II",
        chargeTypeId: 27858,
        chargeName: "Caldari Navy Uranium Charge M"
      },
      {
        typeId: 3065,
        name: "250mm Railgun II",
        chargeTypeId: 27858,
        chargeName: "Caldari Navy Uranium Charge M"
      },
      {
        typeId: 3065,
        name: "250mm Railgun II",
        chargeTypeId: 27858,
        chargeName: "Caldari Navy Uranium Charge M"
      },
      {
        typeId: 3065,
        name: "250mm Railgun II",
        chargeTypeId: 27858,
        chargeName: "Caldari Navy Uranium Charge M"
      },
      {
        typeId: 4292,
        name: "Shield Command Burst II",
        chargeTypeId: 42696,
        chargeName: "Active Shielding Charge"
      },
      {
        typeId: 4292,
        name: "Shield Command Burst II",
        chargeTypeId: 42694,
        chargeName: "Shield Extension Charge"
      },
      {
        typeId: 4292,
        name: "Shield Command Burst II",
        chargeTypeId: 42695,
        chargeName: "Shield Harmonizing Charge"
      }
    ],
    mid: [
      { typeId: 12058, name: "50MN Quad LiF Restrained Microwarpdrive" },
      { typeId: 2289, name: "EM Shield Hardener II" },
      { typeId: 3841, name: "Large Shield Extender II" },
      { typeId: 3841, name: "Large Shield Extender II" },
      { typeId: 22895, name: "Multispectrum Shield Hardener II" },
      { typeId: 35659, name: "Small Capacitor Booster II" }
    ],
    low: [
      { typeId: 2048, name: "Damage Control II" },
      { typeId: 10190, name: "Magnetic Field Stabilizer II" },
      { typeId: 10190, name: "Magnetic Field Stabilizer II" },
      { typeId: 19921, name: "Tracking Enhancer II" }
    ],
    rig: [
      { typeId: 22544, name: "Medium Command Processor I" },
      { typeId: 26088, name: "Medium Core Defense Field Extender II" }
    ],
    cargo: [],
    other: [
      { typeId: 2454, name: "Hornet EC-300", quantity: 1 },
      { typeId: 2454, name: "Hornet EC-300", quantity: 2 }
    ]
  }
});

const SHIP_LOKI_BASE: ShipPrediction = {
  shipTypeId: 29990,
  shipName: "Loki",
  probability: 72,
  source: "inferred",
  reason: ["Recent losses match tackle Loki hull", "Frequent co-fly tackle role evidence"],
  cynoCapable: true,
  cynoChance: 100
};

const SHIP_CLAYMORE_BASE: ShipPrediction = {
  shipTypeId: 22468,
  shipName: "Claymore",
  probability: 28,
  source: "inferred",
  reason: ["Command burst traces observed"],
  cynoCapable: false,
  cynoChance: 0
};

const SHIP_CARACAL_BASE: ShipPrediction = {
  shipTypeId: 621,
  shipName: "Caracal",
  probability: 64,
  source: "inferred",
  reason: ["Page-1 evidence from recent engagements"],
  cynoCapable: false,
  cynoChance: 0
};

const SHIP_ORTHRUS_BASE: ShipPrediction = {
  shipTypeId: 33818,
  shipName: "Orthrus",
  probability: 36,
  source: "inferred",
  reason: ["Historical losses indicate faction cruiser upgrade path"],
  cynoCapable: false,
  cynoChance: 0
};

const SHIP_VULTURE_BASE: ShipPrediction = {
  shipTypeId: 22446,
  shipName: "Vulture",
  probability: 46,
  source: "inferred",
  reason: ["Shield command burst history appears in matched losses"],
  cynoCapable: false,
  cynoChance: 0
};

const PROGRESSIVE_PILOT_ID = 910001;

const PROGRESSIVE_START_CARD = createPilotCard({
  pilotName: "Keres Valt",
  characterId: PROGRESSIVE_PILOT_ID,
  characterName: "Keres Valt",
  corporationId: 98230001,
  corporationName: "Syndicate Trigger",
  allianceId: 99011234,
  allianceName: "Null Composure",
  securityStatus: -4.7,
  status: "loading",
  fetchPhase: "loading",
  predictedShips: [SHIP_CARACAL_BASE],
  fitCandidates: [],
  stats: undefined
});

const PROGRESSIVE_ENRICHING_CARD = createPilotCard({
  pilotName: "Keres Valt",
  characterId: PROGRESSIVE_PILOT_ID,
  characterName: "Keres Valt",
  corporationId: 98230001,
  corporationName: "Syndicate Trigger",
  allianceId: 99011234,
  allianceName: "Null Composure",
  securityStatus: -4.7,
  status: "ready",
  fetchPhase: "enriching",
  predictedShips: [
    { ...SHIP_CARACAL_BASE, probability: 54 },
    { ...SHIP_ORTHRUS_BASE, probability: 46 }
  ],
  fitCandidates: [FIT_CLAYMORE],
  stats: createPilotStats({ kills: 52, losses: 26, danger: 66, soloRatio: 7.1, avgGangSize: 6.4 })
});

const PROGRESSIVE_READY_CARD = createPilotCard({
  pilotName: "Keres Valt",
  characterId: PROGRESSIVE_PILOT_ID,
  characterName: "Keres Valt",
  corporationId: 98230001,
  corporationName: "Syndicate Trigger",
  allianceId: 99011234,
  allianceName: "Null Composure",
  securityStatus: -4.7,
  status: "ready",
  fetchPhase: "ready",
  predictedShips: [
    { ...SHIP_ORTHRUS_BASE, probability: 67 },
    { ...SHIP_CARACAL_BASE, probability: 33 }
  ],
  fitCandidates: [FIT_LOKI_RANGE],
  stats: createPilotStats({ kills: 96, losses: 38, danger: 71, soloRatio: 4.9, avgGangSize: 9.1 })
});

const FIT_METRICS_PILOT_ID = 558518463;

const FIT_FRAME_FIT_CARD = createPilotCard({
  pilotName: "Luma Rehn",
  characterId: FIT_METRICS_PILOT_ID,
  characterName: "Luma Rehn",
  corporationId: 98069940,
  corporationName: "Signal Null",
  allianceId: 99012042,
  allianceName: "Null Composure",
  securityStatus: -6.2,
  status: "ready",
  fetchPhase: "ready",
  predictedShips: [{ ...SHIP_LOKI_BASE, probability: 71 }],
  fitCandidates: [FIT_ZKILL_LOKI],
  stats: createPilotStats({ kills: 173, losses: 61, danger: 74, soloRatio: 3.4, avgGangSize: 10.7 })
});

const FIT_FRAME_METRICS_CARD = createPilotCard({
  pilotName: "Luma Rehn",
  characterId: FIT_METRICS_PILOT_ID,
  characterName: "Luma Rehn",
  corporationId: 98069940,
  corporationName: "Signal Null",
  allianceId: 99012042,
  allianceName: "Null Composure",
  securityStatus: -6.2,
  status: "ready",
  fetchPhase: "ready",
  predictedShips: [
    { ...SHIP_LOKI_BASE, probability: 62 },
    { ...SHIP_CLAYMORE_BASE, probability: 38 }
  ],
  fitCandidates: [FIT_LOKI_RANGE, FIT_CLAYMORE],
  stats: createPilotStats({ kills: 173, losses: 61, danger: 74, soloRatio: 3.4, avgGangSize: 10.7 })
});

const FIT_FRAME_ROLES_CARD = createPilotCard({
  pilotName: "Luma Rehn",
  characterId: FIT_METRICS_PILOT_ID,
  characterName: "Luma Rehn",
  corporationId: 98069940,
  corporationName: "Signal Null",
  allianceId: 99012042,
  allianceName: "Null Composure",
  securityStatus: -6.2,
  status: "ready",
  fetchPhase: "ready",
  predictedShips: [
    {
      ...SHIP_LOKI_BASE,
      probability: 41,
      rolePills: ["Long Point", "Web", "Neut", "Cloaky"],
      pillEvidence: {
        Cyno: createPillEvidence("Cyno", "Covert Ops Cloaking Device II", FIT_ZKILL_LOKI.fitLabel, 133445909),
        Bait: createPillEvidence("Bait", "Pith X-Type Large Shield Booster", FIT_ZKILL_LOKI.fitLabel, 133445909),
        "Long Point": createPillEvidence("Long Point", "Dread Guristas Warp Disruptor", FIT_ZKILL_LOKI.fitLabel, 133445909),
        Web: createPillEvidence("Web", "Federation Navy Stasis Webifier", FIT_ZKILL_LOKI.fitLabel, 133445909),
        Neut: createPillEvidence("Neut", "Small Ghoul Compact Energy Nosferatu", FIT_ZKILL_LOKI.fitLabel, 133445909),
        Cloaky: createPillEvidence("Cloaky", "Covert Ops Cloaking Device II", FIT_ZKILL_LOKI.fitLabel, 133445909)
      }
    },
    {
      ...SHIP_VULTURE_BASE,
      probability: 24,
      rolePills: ["HIC", "Bubble", "Boosh", "Shield Logi", "Armor Logi"],
      pillEvidence: {
        HIC: createPillEvidence("HIC", "50MN Quad LiF Restrained Microwarpdrive", FIT_ZKILL_VULTURE.fitLabel, 133429565),
        Bubble: createPillEvidence("Bubble", "Shield Command Burst II", FIT_ZKILL_VULTURE.fitLabel, 133429565),
        Boosh: createPillEvidence("Boosh", "Shield Command Burst II", FIT_ZKILL_VULTURE.fitLabel, 133429565),
        "Shield Logi": createPillEvidence(
          "Shield Logi",
          "Shield Command Burst II",
          FIT_ZKILL_VULTURE.fitLabel,
          133429565
        ),
        "Armor Logi": createPillEvidence(
          "Armor Logi",
          "Small Capacitor Booster II",
          FIT_ZKILL_VULTURE.fitLabel,
          133429565
        )
      }
    },
    {
      ...SHIP_CLAYMORE_BASE,
      probability: 16,
      rolePills: ["Boosh"],
      pillEvidence: {
        Boosh: createPillEvidence("Boosh", "Skirmish Command Burst II", FIT_CLAYMORE.fitLabel, 120001003)
      }
    },
    { ...SHIP_ORTHRUS_BASE, probability: 11 },
    { ...SHIP_CARACAL_BASE, probability: 8 }
  ].slice(0, TOP_SHIP_CANDIDATES),
  fitCandidates: [FIT_ZKILL_LOKI, FIT_ZKILL_VULTURE, FIT_CLAYMORE],
  stats: createPilotStats({ kills: 173, losses: 61, danger: 74, soloRatio: 3.4, avgGangSize: 10.7 })
});

const FLEET_ANCHOR = createPilotCard({
  pilotName: "Pilot Alias 01",
  characterId: 2115582319,
  characterName: "Pilot Alias 01",
  corporationId: 98536399,
  corporationName: "Corp Alias 01",
  allianceId: 99003581,
  allianceName: "Alliance Alias A",
  securityStatus: -8.1,
  status: "ready",
  fetchPhase: "ready",
  predictedShips: [
    {
      ...SHIP_LOKI_BASE,
      probability: 52,
      rolePills: ["HIC", "Long Point"],
      pillEvidence: {
        Cyno: createPillEvidence("Cyno", "Covert Ops Cloaking Device II", FIT_ZKILL_LOKI.fitLabel, 133445909),
        Bait: createPillEvidence("Bait", "Pith X-Type Large Shield Booster", FIT_ZKILL_LOKI.fitLabel, 133445909),
        HIC: createPillEvidence("HIC", "Dread Guristas Warp Disruptor", FIT_ZKILL_LOKI.fitLabel, 133445909),
        "Long Point": createPillEvidence("Long Point", "Dread Guristas Warp Disruptor", FIT_ZKILL_LOKI.fitLabel, 133445909)
      }
    },
    {
      ...SHIP_VULTURE_BASE,
      probability: 48,
      rolePills: ["Bubble", "Boosh"],
      pillEvidence: {
        Bubble: createPillEvidence("Bubble", "Shield Command Burst II", FIT_ZKILL_VULTURE.fitLabel, 133429565),
        Boosh: createPillEvidence("Boosh", "Shield Command Burst II", FIT_ZKILL_VULTURE.fitLabel, 133429565)
      }
    }
  ],
  fitCandidates: [FIT_ZKILL_LOKI, FIT_ZKILL_VULTURE],
  stats: createPilotStats({ kills: 262, losses: 47, danger: 88, soloRatio: 2.3, avgGangSize: 12.2 })
});

const FLEET_TACKLE = createPilotCard({
  pilotName: "Pilot Alias 02",
  characterId: 2117136263,
  characterName: "Pilot Alias 02",
  corporationId: 98797314,
  corporationName: "Corp Alias 01",
  allianceId: 99012464,
  allianceName: "Alliance Alias A",
  securityStatus: -5.8,
  status: "ready",
  fetchPhase: "ready",
  predictedShips: [
    {
      ...SHIP_LOKI_BASE,
      probability: 76,
      rolePills: ["Long Point", "Web", "Neut", "Cloaky", "HIC", "Bubble"],
      pillEvidence: {
        "Long Point": createPillEvidence("Long Point", "Warp Disruptor II", FIT_LOKI_TACKLE.fitLabel, 120001001),
        Web: createPillEvidence("Web", "Stasis Webifier II", FIT_LOKI_TACKLE.fitLabel, 120001001),
        Neut: createPillEvidence("Neut", "Medium Gremlin Compact Energy Neutralizer", FIT_LOKI_TACKLE.fitLabel, 120001001),
        Cloaky: createPillEvidence("Cloaky", "Covert Ops Cloaking Device II", FIT_LOKI_TACKLE.fitLabel, 120001001),
        HIC: createPillEvidence("HIC", "Warp Disruptor II", FIT_LOKI_TACKLE.fitLabel, 120001001),
        Bubble: createPillEvidence("Bubble", "Warp Disruptor II", FIT_LOKI_TACKLE.fitLabel, 120001001)
      }
    },
    {
      ...SHIP_CLAYMORE_BASE,
      probability: 24,
      rolePills: ["Boosh"],
      pillEvidence: {
        Boosh: createPillEvidence("Boosh", "Skirmish Command Burst II", "Claymore Burst Anchor", 133423603)
      }
    }
  ],
  fitCandidates: [FIT_LOKI_TACKLE, FIT_CLAYMORE],
  stats: createPilotStats({ kills: 191, losses: 63, danger: 75, soloRatio: 18.4, avgGangSize: 3.8 })
});

const FLEET_LOGI = createPilotCard({
  pilotName: "Pilot Alias 03",
  characterId: 2116405346,
  characterName: "Pilot Alias 03",
  corporationId: 98600350,
  corporationName: "Corp Alias 02",
  allianceId: 1354830081,
  allianceName: "Alliance Alias A",
  securityStatus: -3.1,
  status: "ready",
  fetchPhase: "ready",
  predictedShips: [
    {
      shipTypeId: 11987,
      shipName: "Scimitar",
      probability: 71,
      source: "inferred",
      reason: ["Shield logistics hull history detected"],
      rolePills: ["Shield Logi", "Armor Logi"],
      cynoCapable: false,
      cynoChance: 0,
      pillEvidence: {
        "Shield Logi": createPillEvidence("Shield Logi", "Large Shield Transporter II", "Scimitar Logi", 120001005),
        "Armor Logi": createPillEvidence("Armor Logi", "Large Shield Transporter II", "Scimitar Logi", 120001005)
      }
    }
  ],
  fitCandidates: [],
  stats: createPilotStats({ kills: 108, losses: 58, danger: 59, soloRatio: 1.1, avgGangSize: 13.9 })
});

const FLEET_SUGGESTED = createPilotCard({
  pilotName: "Pilot Alias 04",
  characterId: 92423345,
  characterName: "Pilot Alias 04",
  corporationId: 98744132,
  corporationName: "Corp Alias 01",
  allianceId: 99012464,
  allianceName: "Alliance Alias A",
  securityStatus: -4.4,
  status: "ready",
  fetchPhase: "ready",
  predictedShips: [{ ...SHIP_LOKI_BASE, shipName: "Scythe Fleet Issue", shipTypeId: 17720, probability: 64, cynoCapable: false, cynoChance: 0 }],
  fitCandidates: [],
  stats: createPilotStats({ kills: 84, losses: 36, danger: 64, soloRatio: 2.1, avgGangSize: 11.6 })
});

const HERO_OVERVIEW_SELECTED = [FLEET_ANCHOR, FLEET_TACKLE, FLEET_LOGI] as const;
const HERO_OVERVIEW_DISPLAY = [FLEET_ANCHOR, FLEET_TACKLE, FLEET_LOGI] as const;
const HERO_PIPELINE_SELECTED = [PROGRESSIVE_READY_CARD, FIT_FRAME_METRICS_CARD] as const;
const HERO_PIPELINE_DISPLAY = [PROGRESSIVE_READY_CARD, FIT_FRAME_METRICS_CARD] as const;
const HERO_FLEET_SELECTED = [FLEET_ANCHOR, FLEET_TACKLE, FLEET_LOGI] as const;
const HERO_FLEET_DISPLAY = [FLEET_ANCHOR, FLEET_TACKLE, FLEET_SUGGESTED, FLEET_LOGI] as const;
const FLEET_SELECTED = [FLEET_ANCHOR, FLEET_TACKLE, FLEET_LOGI] as const;
const FLEET_DISPLAY_GROUPS = [FLEET_ANCHOR, FLEET_TACKLE, FLEET_LOGI] as const;
const FLEET_DISPLAY_SUGGESTED = [FLEET_ANCHOR, FLEET_TACKLE, FLEET_SUGGESTED, FLEET_LOGI] as const;

const GROUP_PRESENTATION_NONE = createGroupPresentationMap([
  [PROGRESSIVE_PILOT_ID, { isGreyedSuggestion: false, isUngrouped: true }],
  [FIT_METRICS_PILOT_ID, { isGreyedSuggestion: false, isUngrouped: true }]
]);

const GROUP_PRESENTATION_HERO = createGroupPresentationMap([
  [2115582319, { groupId: "fleet-group-v1-a", groupColorToken: "fleet-group-color-0", isGreyedSuggestion: false, isUngrouped: false }],
  [2117136263, { groupId: "fleet-group-v1-a", groupColorToken: "fleet-group-color-0", isGreyedSuggestion: false, isUngrouped: false }],
  [2116405346, { groupId: "fleet-group-v1-b", groupColorToken: "fleet-group-color-3", isGreyedSuggestion: false, isUngrouped: false }],
  [
    92423345,
    {
      groupId: "fleet-group-v1-a",
      groupColorToken: "fleet-group-color-0",
      isGreyedSuggestion: true,
      isUngrouped: false,
      suggestionStrongestRatio: 0.86,
      suggestionStrongestSharedKillCount: 24,
      suggestionStrongestWindowKillCount: 28,
      suggestionStrongestSourcePilotId: 2117136263,
      suggestionStrongestSourcePilotName: "Pilot Alias 02"
    }
  ]
]);

const GROUP_PRESENTATION_FLEET_GROUPS = createGroupPresentationMap([
  [2115582319, { groupId: "fleet-group-v1-a", groupColorToken: "fleet-group-color-0", isGreyedSuggestion: false, isUngrouped: false }],
  [2117136263, { groupId: "fleet-group-v1-a", groupColorToken: "fleet-group-color-0", isGreyedSuggestion: false, isUngrouped: false }],
  [2116405346, { groupId: "fleet-group-v1-b", groupColorToken: "fleet-group-color-3", isGreyedSuggestion: false, isUngrouped: false }]
]);

const GROUP_PRESENTATION_FLEET_SUGGESTED = createGroupPresentationMap([
  [2115582319, { groupId: "fleet-group-v1-a", groupColorToken: "fleet-group-color-0", isGreyedSuggestion: false, isUngrouped: false }],
  [2117136263, { groupId: "fleet-group-v1-a", groupColorToken: "fleet-group-color-0", isGreyedSuggestion: false, isUngrouped: false }],
  [2116405346, { groupId: "fleet-group-v1-b", groupColorToken: "fleet-group-color-3", isGreyedSuggestion: false, isUngrouped: false }],
  [
    92423345,
    {
      groupId: "fleet-group-v1-a",
      groupColorToken: "fleet-group-color-0",
      isGreyedSuggestion: true,
      isUngrouped: false,
      suggestionStrongestRatio: 0.86,
      suggestionStrongestSharedKillCount: 24,
      suggestionStrongestWindowKillCount: 28,
      suggestionStrongestSourcePilotId: 2117136263,
      suggestionStrongestSourcePilotName: "Pilot Alias 02"
    }
  ]
]);

const FIT_METRICS_BY_LABEL = new Map<string, CombatMetrics>([
  [FIT_LOKI_TACKLE.fitLabel, METRICS_BRAWLER],
  [FIT_LOKI_RANGE.fitLabel, METRICS_BRAWLER],
  [FIT_CLAYMORE.fitLabel, METRICS_SUPPORT],
  [FIT_ZKILL_LOKI.fitLabel, METRICS_BRAWLER],
  [FIT_ZKILL_VULTURE.fitLabel, METRICS_SUPPORT]
]);

const README_MEDIA_SNAPSHOTS: Record<ReadmeMediaSceneId, Record<string, ReadmeMediaSnapshotTemplate>> = {
  hero: {
    overview: {
      selectedPilotCards: HERO_OVERVIEW_SELECTED,
      displayPilotCards: HERO_OVERVIEW_DISPLAY,
      groupPresentationByPilotId: GROUP_PRESENTATION_FLEET_GROUPS,
      fitMetricsByFitLabel: FIT_METRICS_BY_LABEL
    },
    pipeline: {
      selectedPilotCards: HERO_PIPELINE_SELECTED,
      displayPilotCards: HERO_PIPELINE_DISPLAY,
      groupPresentationByPilotId: GROUP_PRESENTATION_NONE,
      fitMetricsByFitLabel: FIT_METRICS_BY_LABEL
    },
    fleet: {
      selectedPilotCards: HERO_FLEET_SELECTED,
      displayPilotCards: HERO_FLEET_DISPLAY,
      groupPresentationByPilotId: GROUP_PRESENTATION_HERO,
      fitMetricsByFitLabel: FIT_METRICS_BY_LABEL
    }
  },
  "progressive-inference": {
    start: {
      selectedPilotCards: [PROGRESSIVE_START_CARD],
      displayPilotCards: [PROGRESSIVE_START_CARD],
      groupPresentationByPilotId: GROUP_PRESENTATION_NONE,
      fitMetricsByFitLabel: new Map()
    },
    enriching: {
      selectedPilotCards: [PROGRESSIVE_ENRICHING_CARD],
      displayPilotCards: [PROGRESSIVE_ENRICHING_CARD],
      groupPresentationByPilotId: GROUP_PRESENTATION_NONE,
      fitMetricsByFitLabel: FIT_METRICS_BY_LABEL
    },
    ready: {
      selectedPilotCards: [PROGRESSIVE_READY_CARD],
      displayPilotCards: [PROGRESSIVE_READY_CARD],
      groupPresentationByPilotId: GROUP_PRESENTATION_NONE,
      fitMetricsByFitLabel: FIT_METRICS_BY_LABEL
    }
  },
  "fit-metrics": {
    fit: {
      selectedPilotCards: [FIT_FRAME_FIT_CARD],
      displayPilotCards: [FIT_FRAME_FIT_CARD],
      groupPresentationByPilotId: GROUP_PRESENTATION_NONE,
      fitMetricsByFitLabel: FIT_METRICS_BY_LABEL
    },
    metrics: {
      selectedPilotCards: [FIT_FRAME_METRICS_CARD],
      displayPilotCards: [FIT_FRAME_METRICS_CARD],
      groupPresentationByPilotId: GROUP_PRESENTATION_NONE,
      fitMetricsByFitLabel: FIT_METRICS_BY_LABEL
    },
    roles: {
      selectedPilotCards: [FIT_FRAME_ROLES_CARD],
      displayPilotCards: [FIT_FRAME_ROLES_CARD],
      groupPresentationByPilotId: GROUP_PRESENTATION_NONE,
      fitMetricsByFitLabel: FIT_METRICS_BY_LABEL
    }
  },
  "fleet-summary": {
    groups: {
      selectedPilotCards: FLEET_SELECTED,
      displayPilotCards: FLEET_DISPLAY_GROUPS,
      groupPresentationByPilotId: GROUP_PRESENTATION_FLEET_GROUPS,
      fitMetricsByFitLabel: FIT_METRICS_BY_LABEL
    },
    suggested: {
      selectedPilotCards: FLEET_SELECTED,
      displayPilotCards: FLEET_DISPLAY_SUGGESTED,
      groupPresentationByPilotId: GROUP_PRESENTATION_FLEET_SUGGESTED,
      fitMetricsByFitLabel: FIT_METRICS_BY_LABEL
    },
    narrow: {
      selectedPilotCards: FLEET_SELECTED,
      displayPilotCards: FLEET_DISPLAY_SUGGESTED,
      groupPresentationByPilotId: GROUP_PRESENTATION_FLEET_SUGGESTED,
      fitMetricsByFitLabel: FIT_METRICS_BY_LABEL
    }
  }
};

export function parseReadmeMediaModeFromSearch(search: string): ReadmeMediaMode {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get(README_MEDIA_MODE_PARAM) !== README_MEDIA_ENABLED_VALUE) {
    return { enabled: false };
  }

  const requestedScene = params.get(README_MEDIA_SCENE_PARAM);
  const sceneId = toSceneId(requestedScene);
  const requestedFrame = params.get(README_MEDIA_FRAME_PARAM);
  const frameId = toFrameId(sceneId, requestedFrame);
  return { enabled: true, sceneId, frameId };
}

export function buildReadmeMediaQuery(params: {
  sceneId: ReadmeMediaSceneId;
  frameId: ReadmeMediaFrameId;
}): string {
  const searchParams = new URLSearchParams();
  searchParams.set(README_MEDIA_MODE_PARAM, README_MEDIA_ENABLED_VALUE);
  searchParams.set(README_MEDIA_SCENE_PARAM, params.sceneId);
  searchParams.set(README_MEDIA_FRAME_PARAM, params.frameId);
  return `?${searchParams.toString()}`;
}

export function getReadmeMediaSnapshot(): ReadmeMediaSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  return getReadmeMediaSnapshotFromSearch(window.location.search);
}

export function getReadmeMediaSnapshotFromSearch(search: string): ReadmeMediaSnapshot | null {
  const parsed = parseReadmeMediaModeFromSearch(search);
  if (!parsed.enabled) {
    return null;
  }
  const sceneSnapshots = README_MEDIA_SNAPSHOTS[parsed.sceneId];
  const template = sceneSnapshots[parsed.frameId];
  return {
    sceneId: parsed.sceneId,
    frameId: parsed.frameId,
    selectedPilotCards: template.selectedPilotCards.map(clonePilotCard),
    displayPilotCards: template.displayPilotCards.map(clonePilotCard),
    groupPresentationByPilotId: cloneGroupPresentationMap(template.groupPresentationByPilotId),
    fitMetricsByFitLabel: cloneCombatMetricsMap(template.fitMetricsByFitLabel)
  };
}

function toSceneId(requested: string | null): ReadmeMediaSceneId {
  if (requested && requested in README_MEDIA_SCENE_FRAMES) {
    return requested as ReadmeMediaSceneId;
  }
  return "hero";
}

function toFrameId(sceneId: ReadmeMediaSceneId, requested: string | null): ReadmeMediaFrameId {
  const frames = README_MEDIA_SCENE_FRAMES[sceneId];
  if (requested && frames.some((frame) => frame === requested)) {
    return requested as ReadmeMediaFrameId;
  }
  return frames[0];
}

function createPillEvidence(
  pillName: PillEvidence["pillName"],
  causingModule: string,
  fitId: string,
  killmailId: number
): PillEvidence {
  return {
    pillName,
    causingModule,
    fitId,
    killmailId,
    url: `https://zkillboard.com/kill/${killmailId}/`,
    timestamp: NOW_ISO
  };
}

function createFitCandidate(params: {
  shipTypeId: number;
  fitLabel: string;
  confidence: number;
  sourceLossKillmailId: number;
  eftSections?: FitEftSections;
  modulesBySlot: FitResolvedSlots;
}): FitCandidate {
  return {
    shipTypeId: params.shipTypeId,
    fitLabel: params.fitLabel,
    confidence: params.confidence,
    sourceLossKillmailId: params.sourceLossKillmailId,
    eftSections: params.eftSections ?? createEftSectionsFromResolvedSlots(params.modulesBySlot),
    modulesBySlot: params.modulesBySlot,
    alternates: []
  };
}

function createEftSectionsFromResolvedSlots(modulesBySlot: FitResolvedSlots): FitEftSections {
  return {
    high: modulesBySlot.high.map(formatEftLine),
    mid: modulesBySlot.mid.map(formatEftLine),
    low: modulesBySlot.low.map(formatEftLine),
    rig: modulesBySlot.rig.map(formatEftLine),
    cargo: modulesBySlot.cargo.map(formatEftLine),
    other: modulesBySlot.other.map(formatEftLine)
  };
}

function formatEftLine(module: FitResolvedSlots["high"][number]): string {
  const baseName = module.chargeName ? `${module.name},${module.chargeName}` : module.name;
  if (typeof module.quantity === "number" && module.quantity > 1) {
    return `${baseName} x${module.quantity}`;
  }
  return baseName;
}

function createPilotStats(params: {
  kills: number;
  losses: number;
  danger: number;
  soloRatio: number;
  avgGangSize: number;
}): NonNullable<PilotCard["stats"]> {
  const iskDestroyed = params.kills * 12_500_000;
  const iskLost = Math.max(1, params.losses * 8_700_000);
  const kdRatio = Number((params.kills / Math.max(1, params.losses)).toFixed(2));
  return {
    kills: params.kills,
    losses: params.losses,
    kdRatio,
    solo: Math.round((params.kills * params.soloRatio) / 100),
    soloRatio: params.soloRatio,
    avgGangSize: params.avgGangSize,
    gangRatio: Number((100 - params.soloRatio).toFixed(1)),
    iskDestroyed,
    iskLost,
    iskRatio: Number((iskDestroyed / Math.max(1, iskLost)).toFixed(2)),
    danger: params.danger
  };
}

function createPilotCard(params: {
  pilotName: string;
  characterId: number;
  characterName: string;
  corporationId: number;
  corporationName: string;
  allianceId: number;
  allianceName: string;
  securityStatus: number;
  status: PilotCard["status"];
  fetchPhase: PilotCard["fetchPhase"];
  predictedShips: ShipPrediction[];
  fitCandidates: FitCandidate[];
  stats: PilotCard["stats"];
}): PilotCard {
  return {
    parsedEntry: {
      pilotName: params.pilotName,
      sourceLine: params.pilotName,
      parseConfidence: 1,
      shipSource: "inferred"
    },
    status: params.status,
    fetchPhase: params.fetchPhase,
    characterId: params.characterId,
    characterName: params.characterName,
    corporationId: params.corporationId,
    corporationName: params.corporationName,
    allianceId: params.allianceId,
    allianceName: params.allianceName,
    securityStatus: params.securityStatus,
    stats: params.stats,
    predictedShips: params.predictedShips,
    fitCandidates: params.fitCandidates,
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: []
  };
}

function createGroupPresentationMap(
  entries: ReadonlyArray<readonly [number, GroupPresentation]>
): ReadonlyMap<number, GroupPresentation> {
  return new Map(entries);
}

function cloneGroupPresentationMap(
  source: ReadonlyMap<number, GroupPresentation>
): ReadonlyMap<number, GroupPresentation> {
  return new Map([...source.entries()].map(([pilotId, presentation]) => [pilotId, { ...presentation }]));
}

function cloneCombatMetricsMap(source: ReadonlyMap<string, CombatMetrics>): ReadonlyMap<string, CombatMetrics> {
  return new Map([...source.entries()].map(([fitLabel, metrics]) => [fitLabel, cloneCombatMetrics(metrics)]));
}

function cloneCombatMetrics(source: CombatMetrics): CombatMetrics {
  return {
    ...source,
    damageSplit: { ...source.damageSplit },
    engagementRange: { ...source.engagementRange },
    speed: { ...source.speed },
    signature: { ...source.signature },
    resists: {
      shield: { ...source.resists.shield },
      armor: { ...source.resists.armor },
      hull: { ...source.resists.hull }
    },
    assumptions: [...source.assumptions],
    trace: source.trace ? source.trace.map((entry) => ({ ...entry })) : undefined
  };
}

function clonePilotCard(source: PilotCard): PilotCard {
  return {
    ...source,
    parsedEntry: { ...source.parsedEntry },
    predictedShips: source.predictedShips.map((ship) => ({
      ...ship,
      reason: [...ship.reason],
      rolePills: ship.rolePills ? [...ship.rolePills] : undefined,
      pillEvidence: ship.pillEvidence
        ? Object.fromEntries(
            Object.entries(ship.pillEvidence).map(([pillName, evidence]) => [
              pillName,
              evidence ? { ...evidence } : evidence
            ])
          )
        : undefined
    })),
    fitCandidates: source.fitCandidates.map((fit) => ({
      ...fit,
      alternates: fit.alternates.map((row) => ({ ...row })),
      eftSections: fit.eftSections
        ? {
            high: [...fit.eftSections.high],
            mid: [...fit.eftSections.mid],
            low: [...fit.eftSections.low],
            rig: [...fit.eftSections.rig],
            cargo: [...fit.eftSections.cargo],
            other: [...fit.eftSections.other]
          }
        : undefined,
      modulesBySlot: fit.modulesBySlot
        ? {
            high: fit.modulesBySlot.high.map((module) => ({ ...module })),
            mid: fit.modulesBySlot.mid.map((module) => ({ ...module })),
            low: fit.modulesBySlot.low.map((module) => ({ ...module })),
            rig: fit.modulesBySlot.rig.map((module) => ({ ...module })),
            cargo: fit.modulesBySlot.cargo.map((module) => ({ ...module })),
            other: fit.modulesBySlot.other.map((module) => ({ ...module }))
          }
        : undefined
    })),
    kills: [...source.kills],
    losses: [...source.losses],
    inferenceKills: [...source.inferenceKills],
    inferenceLosses: [...source.inferenceLosses]
  };
}
