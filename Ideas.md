Capability Snapshot (from this repo)
  eve-intel is already strong for single-paste pilot triage:

  - Fast paste parser for local/chat formats + dedupe (src/lib/parser.ts)
  - Progressive pipeline (base intel first, deeper history later) with caching and background refresh (src/lib/usePilotIntelPipelineEffect.ts, src/lib/pipeline/breadthPipeline.ts)
  - zKill + ESI enrichment with retry/cache logic (src/lib/api/zkill.ts, src/lib/api/esi.ts)
  - Ship probability inference + fit reconstruction + EFT export (src/lib/intel.ts, src/lib/intel/fits.ts)
  - Risk heuristics (cyno/bait + role pills) with evidence links (src/lib/cyno.ts, src/lib/roles.ts, src/lib/ui.tsx)
  - Dogma combat estimates (DPS/alpha/range/EHP/resists/confidence) (src/lib/dogma/calc.ts, src/components/PilotCardView.tsx)

  If I were an EVE player, I’d prioritize these changes

  1. Add “when/where last active” context

  - Show last seen date/time and recent systems/regions per pilot.
  - This is a repeated player ask in intel-tool feedback (not just kill counts).

  2. Add relationship/group intelligence

  - “Often flies with”, repeated wingmen, likely alt clusters, corp/alliance overlap scoring.
  - This directly matches common PvP hunting needs and feedback from existing tool threads.

  3. Add operator controls for API budget and depth

  - UI toggles for lookback depth, deep pages, refresh aggressiveness.
  - Right now many limits are hardcoded (7d lookback cap, 20 pages, fixed concurrency), and users explicitly ask for lower API pressure/caching control.

  4. Improve trust/uncertainty UX

  - Make every major label show evidence count + recency (not just binary pills).
  - De-emphasize single-number “danger” as a primary decision metric.

  5. Add optional ESI SSO mode

  - Standings coloring, contacts-based tagging, (for own chars) richer state.
  - ESI scopes exist for location/contacts/standings, so this is feasible as opt-in.

  6. Add team outputs

  - Discord/webhook alerts for high-risk pilot arrivals or inference changes.
  - Optional “intel channel formatted output” for fast FC/scout sharing.

  What I’d remove/de-emphasize

  1. Reduce hardcoded hull heuristics as primary truth

  - Especially cyno-capable hull lists; prefer data-driven dogma/capability models.

  2. Avoid “certainty” UI when confidence is low

  - Hide or downgrade pills/labels without strong recent evidence.

  3. Desktop privacy default

  - Make clipboard polling clearly opt-in/toggleable.

  Community signals I used

  - Reddit EVE Vision feature feedback: related chars, better risk displays, query history, API load concerns
    https://www.reddit.com/r/Eve/comments/8kg2qe/eve_vision_know_your_enemy/
  - D-Scan Space (local+dscan oriented intel workflow, public grouped scans with system context)
    https://d-scan.space/
    https://d-scan.space/scans
  - EVE forum thread discussing local intel behavior and “perfect intel” concerns
    https://forums.eveonline.com/t/local-perfect-intel-in-a-nutshell/266307
  - ESI auth scope surface (for optional SSO features like location/contacts/standings)
    https://esi.evetech.net/latest/swagger.json
  - zKill API docs (for real-time/feed style integrations)
    https://zkillboard.com/information/api/