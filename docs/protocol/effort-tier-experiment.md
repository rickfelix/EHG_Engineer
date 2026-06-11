---
category: documentation
status: approved
version: 1.0.0
author: rickfelix
last_updated: 2026-06-11
tags: [documentation, protocol, experiment]
---

# Effort-Tier Experiment — Arm Protocol (SD-MAN-INFRA-EFFORT-TIER-EXPERIMENT-001)

Chairman-directed experiment measuring quality loss vs token savings across effort
tiers (xhigh / high / medium). Quality gates are the measuring instrument and
**must not change** during the experiment.

## How arms work (coordinator-facing)

Effort is a session-level **operator** setting (`/effort`) invisible to code —
verified: it appears nowhere in transcript JSONL or env. Arms are therefore
**recorded, never detected**:

1. The operator sets `/effort <tier>` in a worker window at launch.
2. The coordinator records the arm immediately:
   `npm run effort:set-arm -- <worker_session_id> <xhigh|high|medium> [--shift day|night]`
   (writes `claude_sessions.metadata.effort_arm` + provenance).
3. Every SD the worker completes is auto-stamped with
   `metadata.execution_context` (arm, model, item class, session) by the
   LEAD-FINAL completion seam — no worker action required.
4. Token attribution: `npm run effort:attribute -- --sd <SD-KEY> --persist`
   (sums transcript-JSONL usage blocks within the SD's claim window;
   falls back to a documented proxy and marks `tokens_source`).

## Stratification & minimums

- Assign arms per worker-window (e.g. night shift = medium, day = xhigh),
  stratified by item class (docs / test / code).
- **n ≥ 30 SDs per arm per class** before any conclusion — the readout
  enforces this (INSUFFICIENT-N cells are never concluded).

## Readout & pre-registered decision rule

`npm run effort:readout` (on-demand; weekly via the chairman cadence).

> PRE-REGISTERED RULE (immutable during the experiment): a lower tier is
> adopted as a class default ONLY if its first-pass gate rate is within
> **5pp** of xhigh on that class with **n ≥ 30** per arm-class cell.

Confound handling: model id is recorded per SD (model-vs-model comparison is a
separate experiment — record, don't vary); per-skill `reasoning_effort`
frontmatter overrides are visible in transcripts and noted in the readout.

### Related
- `lib/fleet/claim-stamp.cjs` — execution-context stamp (FR-1)
- `scripts/effort-experiment/` — attribute-tokens, set-arm, readout
- [Fleet-Worker Loop Directive](./fleet-worker-loop-directive.md)
