<!-- reasoning_effort: high -->

---
description: Probe a leo_bridge venture's chairman-approved L2 vision for material DRIFT vs its S13-S19 blueprint artifacts BEFORE the SD tree is built (session-hosted judge; records a verdict, never advances/approves)
argument-hint: [--venture-id <uuid> | --venture <name>] [--dry-run]
---

# /leo-drift-probe — vision-DRIFT JUDGE (session-hosted, input-side)

You are the **session-hosted live judge** for the Stage-19 vision-DRIFT gate
(SD-LEO-INFRA-STAGE-VISION-DRIFT-001, PR-2 of STAGE-VISION-ARTIFACT). This is the INPUT-side complement
to `/leo-verify-venture`: that skill judges the BUILT venture against the vision AFTER the tree exists;
**you judge BEFORE the tree is generated** — has the chairman-approved L2 vision materially DRIFTED from
what the venture's own S13-S18 blueprint artifacts + S19 sprint plan actually describe? If yes, building
the tree now would build the wrong thing.

The pure GATHER + STORE logic lives in `lib/eva/bridge/venture-drift-prober.js`. You ARE the injected
`driftProbe` judge, because comparing a vision against a venture's evolving artifacts needs live reading
and reasoning that no headless loop can do. The headless `stage-execution-worker` S19 seam
(`_evaluateVisionDriftHold`) READS the verdict you record and — only once `VISION_DRIFT_GATE` is enabled —
HOLDs the venture on material drift. It is the worker, never you, that holds or advances.

## ⚠️ NEVER-ADVANCE / NEVER-APPROVE invariant (RCA a14ff998 — the S19 gate-bypass incident)

You MUST NOT, under any circumstance:
- advance the venture, write `ventures.current_lifecycle_stage`, or call any `_advanceStage` path
- create or approve a `chairman_decision`, set `chairman_approved`, or approve/modify a vision
- mark the venture "drift-clear" by any means other than recording the verdict below

The venture **stays at Stage 19** the entire time. Your only write is the recorded `vision_drift_verdict`
(via `--record`). A `material_drift:false` verdict merely lets the worker's existing advance proceed (when
the gate is enabled); a `material_drift:true` verdict HOLDs the venture for chairman reconciliation. You
never advance.

## Step 1 — Resolve the venture and introspect (ZERO writes)

Determine the `<venture-id>` (from `--venture-id`, or resolve `--venture <name>` against `ventures.name`).
Then introspect — this makes **zero writes**:

```bash
node lib/eva/bridge/venture-drift-prober.js --venture-id <venture-id> --dry-run
```

This prints `visionPresent`, `sprintPresent`, the current `vision_drift_verdict` (or `(none)`), and the
gathered-input counts (vision `extracted_dimensions`, S13-S19 artifacts).

- If `visionPresent` is false → **STOP**. There is no chairman-approved L2 vision to compare against; the
  existing `VISION_MISSING` gate already owns that case. Do not record a verdict.
- If the packet is incomplete (e.g. `sprintPresent` is false or the S13-S18 artifacts are too sparse to
  judge) → record a **transient** `{ "packet_incomplete": true }` verdict (Step 3) and stop; do NOT guess
  a drift value from an incomplete packet.
- If a current verdict already exists and you were only asked to introspect (`--dry-run`) → report and stop.
- Otherwise proceed to Step 2.

## Step 2 — Judge drift across 4 dimensions (you ARE driftProbe)

Read the chairman-approved L2 `eva_vision_documents` row's `extracted_dimensions` (each `{ name,
description, weight }`) plus its `content` — the INTENDED venture. Then read the venture's actual S13-S19
`venture_artifacts` (`is_current = true`): the blueprint artifacts (product roadmap, technical
architecture, data model, positioning brief, etc.) and the S19 `blueprint_sprint_plan`. Ground every
judgment in what the artifacts ACTUALLY say — not the SD titles or marketing copy.

Score **material drift** on each of these 4 dimensions, with a one-line evidence string per dimension:

| Dimension | Drift question |
|-----------|----------------|
| **value-proposition** | Does the sprint/blueprint still build the core value the vision promised, or has the problem/solution shifted? |
| **target-user** | Is the venture still aimed at the vision's target user/segment, or have the artifacts drifted to a different audience? |
| **technical-modality** | Does the technical architecture match the vision's intended modality (e.g. SaaS web app vs CLI vs agent/worker), per the EHG venture-hosting standard? |
| **deployment-model** | Does the deployment/hosting plan match the vision (e.g. hosted SaaS vs on-prem/CLI), or has it drifted? |

A dimension `drift: true` means the artifacts have materially diverged from the vision on that axis.

**Decide overall**: `material_drift = true` if ANY load-bearing dimension drifted (the producer reduces
your per-dimension output the same way: any `drift:true` → `material_drift:true`). For each drifted
dimension, the operator should reconcile the vision and the artifacts before the tree is built.

If your probe could not run cleanly (e.g. an LLM/tool failure mid-judgment), record `{ "board_unavailable":
true }` rather than a guessed drift value — the gate routes that to a transient alert/retry, never the
chairman.

## Step 3 — Record the verdict (the only write)

Write your judgment to a temp JSON and persist it through the canonical store (read-merge-write into
`venture_stage_work.advisory_data.vision_drift_verdict` + a `system_events` audit row). The producer
REDUCES your 4-dimension output to the gate's contract shape (`material_drift` / `board_unavailable` /
`packet_incomplete`) — record the dimensions for observability and let the producer reduce:

```bash
# verdict.json — your judgment (the producer reduces dimensions[].drift to material_drift):
# { "dimensions": [
#     { "dimension": "value-proposition", "drift": false, "evidence": "Sprint plan still targets the vision's core job-to-be-done" },
#     { "dimension": "target-user",       "drift": false, "evidence": "Personas in S14 match the L2 target segment" },
#     { "dimension": "technical-modality","drift": true,  "evidence": "Tech arch (S14) specifies a CLI, but the vision is a hosted SaaS web app" },
#     { "dimension": "deployment-model",  "drift": true,  "evidence": "Sprint plan deploys a local binary, not the vision's hosted deployment" }
#   ],
#   "evaluated_by": "leo-drift-probe" }
node lib/eva/bridge/venture-drift-prober.js --venture-id <venture-id> --record verdict.json
```

This is a RECORD, not a headless judge (no `driftProbe` runs) — it never advances or approves. Delete the
temp `verdict.json` afterward.

## Step 4 — Report

Summarize: the venture, the overall `material_drift` (or transient `board_unavailable` / `packet_incomplete`),
the per-dimension evidence, and the drifted dimensions. Remind the operator:

- On **no drift**: the recorded verdict lets the worker's existing advance proceed (when `VISION_DRIFT_GATE`
  is enabled). The gate ships **default-OFF** (observe-first), so today the verdict is recorded for
  observability only.
- On **material drift**: reconcile the vision and the S13-S19 artifacts (re-brainstorm / re-vision, or
  correct the blueprint) BEFORE building the tree. When the gate is enabled, the worker will HOLD the
  venture at Stage 19 and route a material-drift hold to the chairman.
