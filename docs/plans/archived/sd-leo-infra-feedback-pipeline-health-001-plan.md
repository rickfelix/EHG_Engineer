<!-- Archived from: scratch/sd-plan-feedback-pipeline-health.md -->
<!-- SD Key: SD-LEO-INFRA-FEEDBACK-PIPELINE-HEALTH-001 -->
<!-- Archived at: 2026-04-23T23:36:27.170Z -->

# Plan: Feedback Pipeline Health & Auto-Triage Activation

## Summary

The feedback inbox pipeline (capture → triage → sensemaking → /leo assist) ships with stages 2–3 dormant and no end-to-end invariant. Producer `scripts/clockwork/gh-failure-monitor.cjs` writes zero-signal CI-failure rows hourly; `scripts/modules/inbox/auto-triage.js` exists but has no scheduled workflow that invokes it; `lib/quality/sensemaking-enricher.js` is a pure reader and never computes dispositions for un-analyzed rows; and `lib/quality/assist-engine.js` has no defense-in-depth filter against un-triaged rows. Result: operator-facing `/leo assist` runs see inbox items with `priority=null`, `ai_triage_classification=null`, `sensemaking_disposition=null`, zero diagnostic payload, and stale references to completed SDs.

RCA report: `scratch/rca-assist-stale-ci-20260423.md`. 5-whys chain terminates at "no end-to-end pipeline health invariant". 18 stale rows already dispositioned as `noise_stale_auto_capture` on 2026-04-23; a further 2 currently-live rows were preserved. Without this SD the bleeding producer will continue to generate zero-signal rows at cron cadence and every future `/leo assist` run will waste sub-agent retries on un-actionable inbox items.

## Strategic Objectives

- Make the feedback inbox a trustworthy work queue: every `status='new'` row older than 2 hours has a non-null `ai_triage_classification`.
- Close the loop between producer → triage → consumer: no orphan stages, no silent-null fallthrough, no broken-pipeline-ships-anyway.
- Self-police via an SLO-style invariant so future regressions surface loudly instead of accumulating as inbox noise.
- Eliminate the operator reliance on ad-hoc bulk-dispose scripts for CI auto-captures.

## Key Changes

- **CAPA-2 (PRIMARY)**: New workflow `.github/workflows/clockwork-auto-triage.yml` on cron `30 * * * *` (offset 15 min from producer) invoking `scripts/modules/inbox/auto-triage.js --max-items 20`.
- **CAPA-3**: Enrich producer inserts in `scripts/clockwork/gh-failure-monitor.cjs:88-111` with SD linkage (parse `feat/SD-<KEY>` → set `metadata.sd_key` and `strategic_directive_id`) and set `metadata.sensemaking_correlation_id = errorHash` so the view's JOIN can hit.
- **CAPA-4**: Harden `autoDismissResolved` in `scripts/clockwork/gh-failure-monitor.cjs:122-166` to additionally dismiss when referenced SD is `status='completed'` OR branch has been deleted AND row is >24h old.
- **CAPA-5**: Add consumer defense-in-depth filter in `lib/quality/assist-engine.js:114-119` — skip (or warn-and-skip) rows where `ai_triage_classification IS NULL AND created_at < NOW() - INTERVAL '1 hour'`.
- **CAPA-6 (SLO)**: New workflow `.github/workflows/feedback-pipeline-health.yml` (weekly) invoking new script `scripts/modules/inbox/check-pipeline-health.js` that asserts `count(status='new' AND ai_triage_classification IS NULL AND created_at < NOW() - INTERVAL '2h') == 0` and opens a GitHub issue on violation.

## Files to Modify

- `.github/workflows/clockwork-auto-triage.yml` (new, ~40 LOC)
- `scripts/clockwork/gh-failure-monitor.cjs` (~50 LOC across insert + update + auto-dismiss)
- `lib/quality/assist-engine.js` (~10 LOC filter addition)
- `.github/workflows/feedback-pipeline-health.yml` (new, ~40 LOC)
- `scripts/modules/inbox/check-pipeline-health.js` (new, ~60 LOC)

## Steps

- [ ] CAPA-2: Create `.github/workflows/clockwork-auto-triage.yml`; mirror structure of `leo-assist-periodic.yml`; verify one cron tick on main triages a seeded row end-to-end.
- [ ] CAPA-3: Patch `gh-failure-monitor.cjs` insert and update blocks to parse SD key from branch, look up `strategic_directive_id`, and set `metadata.sensemaking_correlation_id`. Regression test: dedup key unchanged (`sha256(workflow_name:run_id)`).
- [ ] CAPA-4: Extend `autoDismissResolved` with SD-completion check and branch-deletion-with-age check. Manual test: re-run against the 2 preserved rows and any new stale rows.
- [ ] CAPA-5: Add `.not('ai_triage_classification', 'is', null)` (or equivalent guarded warn-log path) to `loadInboxItems`. Unit test in `lib/quality/__tests__/assist-engine.test.js`.
- [ ] CAPA-6: Create health-check script and weekly workflow. Wire an issue-creation step so the SLO violation is visible to the operator.
- [ ] Integration test: after all changes merge and one full cron cycle passes, `count(status='new' AND ai_triage_classification IS NULL AND age > 2h) === 0` in production feedback table.
- [ ] Retrospective: document pipeline-decomposition anti-pattern (shipping stage 1 without gate asserting stages 2–3 exist) as a reusable LEO protocol learning.

## Risks

- **Triage workflow cost**: hourly LLM triage on up to 20 items adds API spend. Mitigation: start at 20/hour cap; adjust after one week's data.
- **False-positive auto-dismiss in CAPA-4**: dismissing on SD-completion might hide a genuine post-merge CI break. Mitigation: require BOTH SD-completed AND age-of-run >24h before dismissing; and only for `category='ci_failure'`.
- **CAPA-5 filter over-broad**: might hide freshly-arrived rows that haven't triaged yet. Mitigation: grace window of 1 hour before filter applies.
- **Concurrent RCA producer rows**: while this SD is in flight, the producer will continue generating rows. Mitigation: land CAPA-2 first so triage drains the ongoing stream.

## References

- RCA: `scratch/rca-assist-stale-ci-20260423.md`
- Related completed SD: `SD-LEO-INFRA-GITHUB-ACTIONS-FAILURE-001` (producer)
- Related orphan SD: `SD-LEO-INFRA-FEEDBACK-PIPELINE-ACTIVATION-001-D` (triage script shipped, scheduler never merged)
- Pattern: `PAT-INBOX-PIPELINE-INVARIANT-001` — multi-stage pipelines must have integration-level invariants, not just per-stage tests.
