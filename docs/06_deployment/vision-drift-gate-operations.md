# Stage-19 Vision-Drift Gate — Operations Runbook

**Category**: Deployment
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-INFRA-STAGE-VISION-DRIFT-001 (EXEC)
**Last Updated**: 2026-06-03
**Tags**: eva, venture-build, stage-19, vision-drift, gate, operations

## What this gate does

The Stage-19 vision-drift gate is the **input-side** safety check for `leo_bridge` venture builds:
before a venture's SD tree is generated at Stage 19, it asks *"has the chairman-approved L2 vision
materially DRIFTED from what the venture's own S13-S18 blueprint artifacts + S19 sprint plan actually
describe?"* If yes, building the tree now would build the wrong thing. It is the complement to the
**output-side** vision-acceptance gate (`/leo-verify-venture`), which verifies the built result *after*
the tree exists.

The gate is **dormant (default-OFF)** — it ships observe-first and only records verdicts until it is
explicitly enabled.

## Components

| Component | File | Role |
|-----------|------|------|
| Decision layer (PR-1) | `lib/eva/bridge/vision-drift-gate.js` | Pure classifier: `classifyVisionDrift` / `shouldHoldForVisionDrift`. Reads a recorded verdict, decides hold/advance + cause. No DB, no side effects. |
| Worker seam (PR-1) | `lib/eva/stage-execution-worker.js` `_evaluateVisionDriftHold` | Reads `venture_stage_work.advisory_data.vision_drift_verdict` and delegates to the decision layer. Break-HOLD only — never advances. |
| Producer (PR-2) | `lib/eva/bridge/venture-drift-prober.js` | Gathers vision + S13-S19 artifacts, runs the injected judge, REDUCES its output to the contract verdict, and records it. CLI: `--dry-run` (introspect) / `--record <file>`. |
| Judge skill (PR-2) | `.claude/commands/leo-drift-probe.md` | Session-hosted 4-dimension judge (value-prop / target-user / technical-modality / deployment-model). |
| Backfill (PR-2) | `scripts/eva/backfill-vision-drift-marker.mjs` | One-time SET-ONCE marker for ventures already at S19. |

## Verdict contract (load-bearing)

The producer records exactly one of these keys at `venture_stage_work.advisory_data.vision_drift_verdict`;
`classifyVisionDrift` reads only these, in priority order:

| Key | Meaning | Gate outcome |
|-----|---------|--------------|
| `{ board_unavailable: true }` | Probe failed / timed out | HOLD, cause=transient (alert+retry, never chairman) |
| `{ packet_incomplete: true }` | Read-in packet (vision/artifacts/sprint) incomplete | HOLD, cause=transient |
| `{ material_drift: true }` | Vision diverged from the artifacts | HOLD, cause=chairman (reconcile) |
| `{ material_drift: false }` | Vision matches | no-hold (normal advance) |
| (absent / non-boolean) | NOT_EVALUATED | fail-OPEN unless `VISION_DRIFT_STRICT` |

> The producer's `normalizeDriftVerdict()` collapses the 4-dimension judge output to `{ material_drift }`
> (true if ANY dimension drifted). Storing the raw per-dimension object would classify NOT_EVALUATED on
> every verdict and make the gate a permanent no-op. An unusable probe result degrades to
> `board_unavailable` — never a silent `material_drift:false`.

## Operating the producer (recording verdicts)

A real drift-probe is **session-hosted** — the CLI refuses to judge headlessly. Use the skill:

```text
/leo-drift-probe --venture-id <uuid>     # in a live Claude session
```

Introspect what is recorded (zero writes):

```bash
node lib/eva/bridge/venture-drift-prober.js --venture-id <uuid> --dry-run
```

Backfill ventures already parked at S19 so they become observable (dry-run first):

```bash
node scripts/eva/backfill-vision-drift-marker.mjs            # dry-run: report candidates
node scripts/eva/backfill-vision-drift-marker.mjs --apply    # write the SET-ONCE marker
```

## Enablement sequence (observe → enforce)

The gate ships OFF. Enable it only after the session-hosted producer is proven to record verdicts on real
S19 ventures. Both flags are env-only (instant rollback by unsetting).

1. **Observe (current)** — `VISION_DRIFT_GATE` unset/OFF. The worker seam is skipped (byte-identical legacy
   advance); the producer still records verdicts for observability. Backfill S19 ventures and watch
   `system_events` `VISION_DRIFT_VERDICT` rows accumulate.
2. **Enable, fail-open** — set `VISION_DRIFT_GATE=true`. The worker now HOLDs on `material_drift`
   (→ chairman) and on transient verdicts (→ alert/retry). A venture with **no** recorded verdict
   (NOT_EVALUATED) still **advances** (fail-open) because the producer is session-only and does not run on
   the headless worker path.
3. **Enforce (verify-before-build)** — additionally set `VISION_DRIFT_STRICT=true`. Now NOT_EVALUATED
   HOLDs too. Only flip this once you are confident every S19 venture gets a recorded verdict, or builds
   will deadlock waiting on a session-hosted probe.

| Flag | Default | Effect when ON |
|------|---------|----------------|
| `VISION_DRIFT_GATE` | OFF | Worker honors recorded verdicts (HOLD on material/transient drift) |
| `VISION_DRIFT_STRICT` | OFF | NOT_EVALUATED (no verdict) also HOLDs |

## Invariants & rollback

- **Never-advance**: the producer and decision layer touch zero `_advanceStage` call sites and perform no
  venture-stage / governance / vision writes. A static guardrail test forbids `setInterval`/`setTimeout`/
  cron in the producer (it must stay session-hosted, not a daemon).
- **Rollback**: unset `VISION_DRIFT_STRICT` then `VISION_DRIFT_GATE` (instant, env-only). Recorded
  `advisory_data.vision_drift_verdict` values are additive/data-only and safe to leave in place.

## Related

- Acceptance (output-side) gate: `/leo-verify-venture`, `lib/eva/bridge/venture-vision-verifier.js`
- SDs: SD-LEO-INFRA-STAGE-VISION-ARTIFACT-001 (PR-1, decision layer) → SD-LEO-INFRA-STAGE-VISION-DRIFT-001 (PR-2, producer)
