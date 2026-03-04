export type ReadmeMediaFrame = {
  id: string;
  title: string;
  detail: string;
};

export type ReadmeMediaClipFixture = {
  id: "progressive-inference" | "fit-metrics" | "fleet-summary";
  label: string;
  caption: string;
  frames: ReadonlyArray<ReadmeMediaFrame>;
};

export type ReadmeMediaHeroFixture = {
  title: string;
  subtitle: string;
  highlights: ReadonlyArray<string>;
};

export const README_MEDIA_HERO_FIXTURE: Readonly<ReadmeMediaHeroFixture> = {
  title: "EVE Intel at a Glance",
  subtitle: "Fast pilot parsing, progressive enrichment, and fit-focused risk context in one surface.",
  highlights: [
    "Paste pilots from local chat formats",
    "See likely ships immediately, then refine as history loads",
    "Inspect fit clues, combat profile, and fleet-level grouping"
  ]
};

export const README_MEDIA_CLIP_FIXTURES: ReadonlyArray<ReadmeMediaClipFixture> = [
  {
    id: "progressive-inference",
    label: "Progressive Inference",
    caption: "Starts with fast ship hints, then tightens probabilities as deeper history arrives.",
    frames: [
      {
        id: "start",
        title: "Fast First Paint",
        detail: "Pilot cards render with initial likely ships from page-1 evidence."
      },
      {
        id: "enriching",
        title: "Deep Paging",
        detail: "Background enrichment increases confidence and fills additional context."
      },
      {
        id: "ready",
        title: "Refined Output",
        detail: "Final ordering reflects richer kill/loss evidence."
      }
    ]
  },
  {
    id: "fit-metrics",
    label: "Fit + Combat Metrics",
    caption: "Likely fits include EFT-style modules and directional combat capability estimates.",
    frames: [
      {
        id: "fit",
        title: "Fit Evidence",
        detail: "Loss-derived module signatures identify likely loadouts."
      },
      {
        id: "metrics",
        title: "Combat Envelope",
        detail: "DPS, alpha, range band, EHP, and resist profile are shown per fit row."
      },
      {
        id: "roles",
        title: "Role Signals",
        detail: "Pills expose interdiction, logi, cyno, and bait-relevant indicators."
      }
    ]
  },
  {
    id: "fleet-summary",
    label: "Fleet Grouping + Suggestions",
    caption: "Summary rows cluster co-fly pilots and grey lower-priority suggested additions.",
    frames: [
      {
        id: "groups",
        title: "Grouped Rows",
        detail: "Deterministic color tokens keep related pilots visually connected."
      },
      {
        id: "suggested",
        title: "Suggested Pilots",
        detail: "Suggested rows remain visible but de-emphasized until selected."
      },
      {
        id: "narrow",
        title: "Narrow Layout",
        detail: "Presentation remains readable when condensed to narrow widths."
      }
    ]
  }
];