# Dogma Parity Ship Coverage Plan

## Goal
Expand parity corpus coverage using zKill-derived fits so each selected ship group has:
1. EFT fit in `data/parity/fit-corpus.jsonl`
2. pyfa reference in `data/parity/reference-results.json`
3. fit id added to `data/parity/golden-fit-ids.json`
4. covered by existing parity test (`src/lib/dogma/parity/parity.test.ts`)

## Coverage Audit (2026-02-17)
Source: `reports/dogma-parity-coverage-gap-report.json`

- Corpus ship coverage (initial): 48 / 412 published ship types
- Covered ship groups (initial): 14 / 46
- Missing ship groups (initial): 32
- Missing weapon families: 6 (`Missile Launcher Bomb`, `Missile Launcher Rapid Heavy`, `Missile Launcher Rapid Torpedo`, `Missile Launcher XL Cruise`, `Missile Launcher XL Torpedo`, `Vorton Projector`)
- Missing ammo families: 8 (`Bomb`, `Condenser Pack`, `XL Cruise Missile`, `XL Torpedo`, and advanced variants)
- Missing drone families: 2 (`Energy Neutralizer Drone`, `Stasis Webifying Drone`)

## Progress (Current Pass)
- Added fixtures this pass: 31 groups
- Current corpus size: 105 fits
- Current group coverage: 46 / 46
- Remaining missing groups: 0

## Group Expansion Tracker
| Ship Group | Status | Reference Fit ID | Notes |
|---|---|---|---|
| Attack Battlecruiser | Completed | `zkill-attack-battlecruiser-133447773` | Oracle from zKill killmail 133447773 |
| Black Ops | Completed | `zkill-black-ops-133447642` | Redeemer from zKill killmail 133447642 |
| Blockade Runner | Completed | `zkill-blockade-runner-133448704` | Crane from zKill killmail 133448704 |
| Capital Industrial Ship | Completed | `zkill-capital-industrial-ship-133419370` | Rorqual from zKill killmail 133419370 |
| Capsule | Completed | `manual-capsule-minimal-1` | Capsule minimal fallback fit (no reliable zKill fitted sample) |
| Carrier | Completed | `zkill-carrier-133436113` | Archon from zKill killmail 133436113 |
| Command Destroyer | Completed | `zkill-command-destroyer-133448856` | Bifrost from zKill killmail 133448856 (utility fit, 0 DPS) |
| Corvette | Completed | `zkill-corvette-133446733` | Impairor from zKill killmail 133446733 |
| Covert Ops | Completed | `zkill-covert-ops-133448514` | Helios from zKill killmail 133448514 |
| Destroyer | Completed | `zkill-destroyer-133448049` | Coercer from zKill killmail 133448049 |
| Dreadnought | Completed | `zkill-dreadnought-133448144` | Phoenix from zKill killmail 133448144 (XL Cruise) |
| Electronic Attack Ship | Completed | `zkill-electronic-attack-ship-133448772` | Keres from zKill killmail 133448772 |
| Exhumer | Completed | `zkill-exhumer-133448858` | Hulk from zKill killmail 133448858 |
| Expedition Command Ship | Completed | `manual-expedition-command-ship-minimal-1` | Odysseus minimal fallback fit |
| Expedition Frigate | Completed | `zkill-expedition-frigate-133446782` | Prospect from zKill killmail 133446782 |
| Flag Cruiser | Completed | `zkill-flag-cruiser-133418808` | Monitor from zKill killmail 133418808 |
| Force Auxiliary | Completed | `zkill-force-auxiliary-133448105` | Apostle from zKill killmail 133448105 |
| Force Recon Ship | Completed | `zkill-force-recon-ship-133447466` | Falcon from zKill killmail 133447466 |
| Freighter | Completed | `zkill-freighter-133351247` | Bowhead from zKill killmail 133351247 |
| Hauler | Completed | `zkill-hauler-133446261` | Badger from zKill killmail 133446261 |
| Heavy Assault Cruiser | Completed | `zkill-heavy-assault-cruiser-56615140` | Adrestia from zKill killmail 56615140 |
| Heavy Interdiction Cruiser | Completed | `zkill-heavy-interdiction-cruiser-133448632` | Onyx from zKill killmail 133448632 |
| Industrial Command Ship | Completed | `zkill-industrial-command-ship-133448827` | Orca from zKill killmail 133448827 |
| Jump Freighter | Completed | `manual-jump-freighter-minimal-1` | Rhea minimal fallback fit (no reliable zKill fitted sample) |
| Lancer Dreadnought | Completed | `zkill-lancer-dreadnought-133431340` | Hubris from zKill killmail 133431340 |
| Logistics Frigate | Completed | `zkill-logistics-frigate-133448652` | Deacon from zKill killmail 133448652 |
| Mining Barge | Completed | `zkill-mining-barge-133448254` | Covetor from zKill killmail 133448254 |
| Prototype Exploration Ship | Completed | `manual-prototype-exploration-ship-minimal-1` | Zephyr minimal fallback fit (no reliable zKill fitted sample) |
| Shuttle | Completed | `manual-shuttle-minimal-1` | Caldari Shuttle minimal fallback fit (no reliable zKill fitted sample) |
| Stealth Bomber | Completed | `zkill-stealth-bomber-133446781` | Hound from zKill killmail 133446781 (includes Bomb Launcher) |
| Supercarrier | Completed | `zkill-supercarrier-132527614` | Revenant from zKill killmail 132527614 |
| Titan | Completed | `zkill-titan-132932303` | Erebus from zKill killmail 132932303 |

## Execution Rules
- Use zKill as fit source for each group.
- Add one representative fit at a time per missing group.
- Generate pyfa reference via `scripts/pyfa_fitstats.py` flow already used in repo.
- Do not fix Dogma implementation in this phase; collect testcases/references first.
