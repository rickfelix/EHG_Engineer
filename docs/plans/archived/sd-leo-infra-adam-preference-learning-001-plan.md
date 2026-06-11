<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_adam3_learnsurface.md -->
<!-- SD Key: SD-LEO-INFRA-ADAM-PREFERENCE-LEARNING-001 -->
<!-- Archived at: 2026-06-09T19:42:46.217Z -->

# Adam preference-learning + scope-tagged surfacing (advisory lane + scheduled chairman exec email)

## Type
infrastructure

## Priority
high

## Objective
Close Adam's learning + surfacing loop — learn the chairman's accept/defer/reject weights, scope-tag every output, and make the chairman executive email a reliable proactive artifact (the chairman-chosen channel).

## Scope
- SURFACING (scope-tagged): extend `buildAdvisoryPayload` in `scripts/adam-advisory.cjs` with `scope_key` + `reuse_class` + `applies_to_scopes[]` (additive JSONB on the existing adam_advisory payload, no migration; reuse the existing `repo` field for the per-scope repo path) and prefix the advisory body with `[<scope_key>]`. The two-stage `actioned_at` ACK is unchanged (a delivered-but-ignored idea re-surfaces ONCE, an actioned one never repeats).
- CHAIRMAN EMAIL (the chosen channel): generalize `scripts/adam-exec-summary.mjs` NEEDS-YOU into a per-scope roll-up (harness / platform / N-venture opportunity counts); scope-tag each `.adam-chairman-decisions.json` item label; add per-scope counters to `.adam-email-last.json` for trend arrows. SCHEDULE the exec email reliably — it is currently manual/not in package.json/no cron; wire it onto a cadence so it is the always-on proactive chairman artifact.
- PREFERENCE LEARNING: wire the decision ledger (reuse `.adam-chairman-decisions.json`) to learn accept/defer/reject weights from advisory `actioned_at` + EVA `chairman_feedback`; re-weight the materiality bar so previously-dismissed CLASSES drop below the silence threshold.
- SELF-IMPROVEMENT (weekly, idle-gated): grade the surfaced->accepted ratio through the EXISTING `adam_self_assessment` loop; PROPOSE (never auto-apply) scan-skill refinements behind archive-not-delete + coordinator review.
- COMPOUNDING: promote a pattern seen across >=2 scopes to ONE higher-scope advisory (reuse_class) rather than N duplicates (respects the <=1-advisory cap).

## Acceptance Criteria
- Advisories + the chairman email carry scope tags; the exec email runs on a reliable schedule.
- The preference model re-weights the materiality bar from actioned_at / chairman_feedback.
- Self-improvement proposes (does not auto-apply) skill refinements.

## Success Metrics
- The chairman receives a scheduled scope-tagged exec email (no longer manual-only).
- Surfaced->accepted ratio is tracked and trends up as the preference model learns.

## Rationale
All surfacing reuses the existing advisory lane + exec email (no new notification path); the chairman chose the executive email as the proactive channel, so its scheduling gap must close. Depends on the scan-core + EVA-seam SDs. EHG_Engineer (touches Adam's own surfaces). See the proactive-Adam design.
