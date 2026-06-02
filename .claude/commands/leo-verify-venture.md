<!-- reasoning_effort: high -->

---
description: Verify a built leo_bridge venture against its chairman-approved vision before S19→S20 (session-hosted judge; records a verdict, never advances/approves)
argument-hint: [--venture-id <uuid> | --venture <name>] [--dry-run]
---

# /leo-verify-venture — vision-grounded acceptance JUDGE (session-hosted)

You are the **session-hosted live judge** for the vision-grounded acceptance gate
(SD-LEO-INFRA-VISION-GROUNDED-ACCEPTANCE-001 — campaign "intelligent-venture-build" #3 of 3). After
the leo_bridge build consumer (`/leo-build-venture`) drives a venture's SD tree to completion at
Stage 19, this skill judges whether the **built venture actually satisfies the chairman-approved
vision's acceptance criteria** and records a pass/gaps verdict. The headless `stage-execution-worker`
S19 gate then READS that verdict and HOLDs the venture on a FAIL — it is the worker, never you, that
advances S19→S20.

The pure GATHER + STORE logic lives in `lib/eva/bridge/venture-vision-verifier.js`. You ARE the
injected `verifyVenture` judge, because comparing a running venture against a vision needs live
inspection (reading the repo, opening the deployment) that no headless loop can do.

## ⚠️ NEVER-ADVANCE / NEVER-APPROVE invariant (RCA a14ff998 — the S19 gate-bypass incident)

You MUST NOT, under any circumstance:
- advance the venture, write `ventures.current_lifecycle_stage`, or call any `_advanceStage` path
- create or approve a `chairman_decision`, set `chairman_approved`, or approve/modify a vision
- mark the venture "verified-good" by any means other than recording the verdict below

The venture **stays at Stage 19** the entire time. Your only write is the recorded
`vision_acceptance_verdict` (via `--record`). A PASS verdict merely lets the worker's existing,
exit-gated advance proceed; a FAIL verdict HOLDs the venture for corrective work. You never advance.

## Step 1 — Resolve the venture and introspect (ZERO writes)

Determine the `<venture-id>` (from `--venture-id`, or resolve `--venture <name>` against
`ventures.name`). Then introspect — this makes **zero writes**:

```bash
node lib/eva/bridge/venture-vision-verifier.js --venture-id <venture-id> --dry-run
```

This prints `visionPresent`, the current `vision_acceptance_verdict` (or `(none)`), and the gathered
inputs (`repoUrl`, `deploymentUrl`, `buildVerdict`, and the count of vision `extracted_dimensions`).

- If `visionPresent` is false → **STOP**. There is no chairman-approved L2 vision to verify against;
  the existing `VISION_MISSING` gate already owns that case. Do not record a verdict.
- If a current verdict already exists and you were only asked to introspect (`--dry-run` passed by the
  operator) → report it and stop.
- Otherwise proceed to Step 2.

## Step 2 — Judge the built venture against the vision (you ARE verifyVenture)

Gather the acceptance criteria and the built result, then judge each criterion with EVIDENCE:

1. **Read the vision's acceptance criteria** — the chairman-approved L2 `eva_vision_documents` row's
   `extracted_dimensions` (each `{ name, description, weight }`) plus its `content`. These are what
   "good" means for this venture.
2. **Inspect the RUNNING built venture** — read the cloned repo at `applications.local_path` (its real
   structure, routes, components, data layer) and, where useful, open the `deployment_url`. Ground
   every judgment in what the venture ACTUALLY contains, exactly as enhancement #1 grounded
   decomposition in the real repo — do not judge from the SD titles or the marketing copy.
3. **Score each dimension** `pass` / `gap` with a one-line evidence string citing what you found (or
   failed to find) in the repo/deployment. Treat `buildVerdict === 'FAIL'` as a strong negative signal.
4. **Decide the overall verdict**: `pass = true` only if every load-bearing dimension is satisfied;
   otherwise `pass = false` with a `gaps` list. For each gap, propose a **corrective SD stub**
   (`{ title, rationale }`) in `corrective_sds` — these are PROPOSALS for the operator/chairman, never
   auto-created here.

It is purely informational grounding for the operator; it never relaxes the never-advance /
never-approve constraints above.

## Step 3 — Record the verdict (the only write)

Write your judgment to a temp JSON and persist it through the canonical store (read-merge-write into
`venture_stage_work.advisory_data.vision_acceptance_verdict` + a `system_events` audit row):

```bash
# verdict.json — your judgment:
# { "pass": false,
#   "criteria_results": [ { "name": "Landing converts", "pass": true, "evidence": "Hero + CTA present in src/pages/Home.tsx" } ],
#   "gaps": [ { "name": "Email capture", "evidence": "No signup form or POST handler found in the repo" } ],
#   "corrective_sds": [ { "title": "Add email capture form + handler", "rationale": "Vision dimension 'Email capture' unmet" } ],
#   "evaluated_by": "leo-verify-venture" }
node lib/eva/bridge/venture-vision-verifier.js --venture-id <venture-id> --record verdict.json
```

This is a RECORD, not a headless judge (no `verifyVenture` runs) — it never advances or approves.
Delete the temp `verdict.json` afterward.

## Step 4 — Report

Summarize: the venture, `pass`/`gaps`, the per-dimension evidence, and (on gaps) the proposed
corrective SDs. Remind the operator:

- On **PASS**: the worker's existing S19→S20 exit gate will advance the venture on its next poll
  (confirm by re-reading `ventures.current_lifecycle_stage` — it is the WORKER, not you, that advances).
- On **GAPS**: the venture is safely HELD at Stage 19 (`VISION_ACCEPTANCE_GATE` default ON). Create the
  proposed corrective SDs (or escalate to the chairman) and re-run `/leo-verify-venture` after they land.
