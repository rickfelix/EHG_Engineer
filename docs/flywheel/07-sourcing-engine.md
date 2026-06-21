---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, sourcing-engine, belt, automation, crons-active, env-probe-false-negative]
---

# Link 7 — Automated Belt Feed (the Sourcing Engine)

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

The sourcing engine is the **automated replacement for Adam's manual belt-refill** (link 6). When
its flags are ON, cron sweeps continuously enumerate the corpus, classify+route each candidate to
a lane, dedup, stage into `roadmap_wave_items`, and (where chairman-approved) promote to claimable
SDs — keeping the belt full without a human in the loop. It is the forward complement to the
backward coherence enforcement (drift prevented at the source).

> **[ENGINE STATE — CRITICAL, corrected 2026-06-20]** The 2 behavioral staging crons (Sourcing
> **deferred-watcher** + Sourcing **gauge-gap miner**) are **REGISTERED + ACTIVE with their flags ON
> in GitHub Actions** (commit 4ba41115 / PR #4933). The local-env flag probe (`adam-startup-check`
> + the forecaster awareness module) reads `process.env` — which **never carries the GitHub-Actions
> workflow env** — so it reports a **FALSE "dormant."** That false-negative is itself a known gap
> (the probe should read the deployed workflow env / a DB `engine_state` row). As of 2026-06-20 the
> crons are **ARMED** but had **not yet been observed firing** (GitHub new-schedule latency); a
> manual `workflow_dispatch` confirms execution. NOTE the 4 umbrella `SOURCING_*` flags remain a
> **display/registry only**.
>
> An activation runbook exists at `docs/sourcing-engine-activation-runbook.md`
> (SD-LEO-INFRA-SOURCING-ENGINE-ACTIVATION-001) documenting the chairman-authorized go-live + how
> to revert each step.

## Components (verified — `lib/sourcing-engine/*`)

| File | Role |
|------|------|
| `router.js` | **PURE** `routeCandidate()` — maps a classified candidate to exactly ONE of 5 lanes. No LLM, no IO. |
| `lane.js` | The `lane` first-class field persistence (distinct from `disposition`). |
| `proactive-populator.js` | Enumerates the 4-source corpus, classifies+routes, **stages** `roadmap_wave_items` (dry-run default; chairman-double-gated). |
| `dedup-autostamp.js` | Stamps dedup match/score so shipped work isn't re-minted (the `DEDUP` lane). |
| `register-first.js` | The `--from-roadmap-item` promotion path; stamps two-way roadmap↔SD provenance. |
| `adam-direct-registry.js` | Adam-direct candidate registration + `resolveTargetWaveId`. |
| `deferred-watcher.js` | Watches deferred SDs to re-surface them as candidates. |
| `gauge-gap-miner.js` | Turns the read-only VDR gauge into a forward router (mines unbuilt caps → staged candidates). |
| `outcome-decomposer.js` | Decomposes outcome-rung work. |
| `escalator.js` | Escalation routing. |

## The 5 lanes (`router.js`, frozen vocabulary)

| Lane | Meaning |
|------|---------|
| `belt-ready` | fleet-buildable + conflict-free + non-gated + novel → goes to the belt |
| `blocked-on` | dep / write-surface conflict with an in-flight SD |
| `chairman-gated` | needs chairman authority (grant/rls/credential/operational/vision) |
| `outcome-gated` | needs an operational outcome before it is buildable (V2/V3-class) |
| `dedup` | already represented by an existing SD |

`lane` is **distinct from `disposition`** (BUILD/RESEARCH/REFERENCE/CANCEL). The router passes
disposition through unchanged and never overloads it.

## The crons / flags (env-driven)

These are **environment flags read via `process.env`** (NOT rows in `leo_feature_flags`):

- `SOURCING_ENGINE_V1`, `SOURCING_ROADMAP_ENGINE_V1`, `SOURCING_PROACTIVE_POPULATOR_V1`
- `SOURCING_GAUGE_GAP_MINER_V1` (gates `scripts/sourcing-engine/gauge-gap-miner-sweep.mjs`)
- `SOURCING_DEFERRED_WATCHER_V1` (gates `scripts/sourcing-engine-deferred-watcher-sweep.mjs`)
- `LEO_ROADMAP_AUTOSOURCE` (checked by `scripts/adam-startup-check.mjs`)

Each sweep checks its flag and prints `SUPPRESSED_FLAG_OFF` when the flag is not enabled. In
**GitHub Actions** the deferred-watcher + gauge-gap-miner crons run with their flags **ON** (commit
4ba41115 / PR #4933), so they execute on schedule there. The caveat (see the ENGINE STATE callout
above): a **local** `process.env` probe cannot see the workflow env, so a local read reports a
**false "dormant"** even while the crons are armed in CI.

## Hard safeguards (staging is conservative)

From `proactive-populator.js`: writes require `apply=true` **AND** `chairmanApproved=true`. Staging
only ever **INSERTs** `roadmap_wave_items` at `item_disposition='pending'` (the STAGED state) — it
**never** sets `promoted_to_sd_key` (never promotes staged→belt automatically) and **never** creates
an SD. Idempotent on `UNIQUE(wave_id, source_type, source_id)`. Dormant-safe (lane column omitted
when absent). So even fully activated, the populator stages candidates for review; promotion to the
belt remains a deliberate `--from-roadmap-item` act.

## Promotion to the belt

`node scripts/leo-create-sd.js --from-roadmap-item <id>` → register-first stamps provenance + sets
`roadmap_wave_items.promoted_to_sd_key` → the SD becomes claimable (the "belt"). See
[08-belt-coordinator-fleet.md].

## Existing documentation

- `docs/sourcing-engine-activation-runbook.md` — activation + revert. **Coverage: good (ops).**
- `docs/vision/ladder-roadmap-coherence.md` — the engine as the *forward complement*. **Coverage: good.**
- `docs/reference/schema/engineer/tables/conversion_ledger.md`, `roadmap_wave_items.md` — schema.
- **Gap:** no doc enumerated the engine's components, lanes, flags, and safeguards as one picture
  for a reader. This doc fills it.

## Connects to

- **Up from / replaces:** Adam's manual sourcing ([06-adam-sourcing.md]).
- **Sources from:** Backlog intake ([05-backlog-intake.md]) corpus.
- **Feeds:** the belt ([08-belt-coordinator-fleet.md]).
- **Steered by:** the build gauge ([10-vdr-build-gauge.md]) via the gauge-gap-miner.
