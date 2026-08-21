# Runbook: Venture Journey UAT Operations

**Category**: Protocol
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001
**Last Updated**: 2026-08-21
**Tags**: uat, venture-journey-walk, test-credentials, deploy-freshness

## Purpose

Operator-facing description of the venture journey UAT mechanism: how a
venture's declared user journey gets walked by an automated Playwright
session, what it requires to authenticate, and how a chairman's site-review
approval stays honest across redeploys. Before this SD, `lib/uat/result-recorder.js`'s
write path referenced columns that never existed on `uat_test_runs` — every
walk that ran either threw immediately or silently discarded its result,
which is part of why UAT execution rate across the venture portfolio was
observed at roughly once per 14 days.

## Journey Walk: What It Does

For a venture sprint orchestrator SD with `metadata.journey_steps` set
(derived from a Stage-15 `blueprint_user_journey` artifact via
`lib/eva/bridge/orchestrator-journey-steps.js`), `lib/apa/journey-walk-orchestrator.js`'s
`runVentureJourneyWalk()`:

1. Acquires a live instance of the venture's deployed build.
2. Runs venture-specific preflight checks (`lib/apa/venture-step-executors.js`'s
   `preflightChecks` — e.g. AltifyAI's land/signup-form/upload-absent/feedback-widget
   checks, grounded in this SD's own FR-0 live evidence).
3. Walks the declared journey steps via `lib/apa/browser-executor.js`'s generic
   `runJourneyWalk()`, using a step-executor resolved per step_id.
4. Records the result via `lib/uat/result-recorder.js` (now schema-correct)
   and stamps `metadata.journey_walk_result` on the orchestrator SD.
5. Re-runs as a Stage-20 code-quality sub-step (`lib/eva/quality-findings/db-sourced-findings.js`'s
   `produceJourneyWalkFindings()`) for any venture with `deployment_url` set,
   feeding `uat_test` findings through the existing Stage 20 → Stage 23
   verdict-rollup path.

**A parent orchestrator with `metadata.journey_steps` set cannot pass
PLAN-TO-LEAD while its journey walk result is failing or absent** — this is a
WAIT condition (not FAIL), keyed strictly on the `journey_steps` flag, never
on `sd_type` (`scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js`).

## Test Credentials: Never Registration

The walker authenticates via pre-provisioned credentials only. It never
registers a new account — this is a hard constraint, not a preference, and
the code is structured to fail loudly rather than fall back to registration.

**Two identities, not one.** A venture that has been live for a while has
users whose accounts predate some prior deploy (an "existing" identity); a
brand-new signup has none of that history. These exercise genuinely
different code paths — this is exactly what surfaced AltifyAI's post-deploy
dashboard regression (QF-20260819-687): a fresh account would never have
hit it.

**Provisioning** (a human/ops task — nothing in this codebase can do this
itself, per the never-create-accounts constraint):

```bash
# Existing-identity credential for venture key ALTIFYAI
VENTURE_UAT_TEST_ACCOUNT_ALTIFYAI_EXISTING='{"email":"...","password":"..."}'

# Fresh-identity credential (optional; falls back to the above if unset)
VENTURE_UAT_TEST_ACCOUNT_ALTIFYAI_FRESH='{"email":"...","password":"..."}'

# Legacy single-credential form (still supported as a fallback for both types)
VENTURE_UAT_TEST_ACCOUNT_ALTIFYAI='{"email":"...","password":"..."}'
```

`lib/apa/venture-step-executors.js`'s `getTestCredential(ventureKey, personaType)`
reads the typed var first, falling back to the un-suffixed form. Neither slot
is populated for any venture as of this writing — the mechanism exists;
provisioning is separate follow-up work.

**Fail-closed by design.** The walker refuses to submit credentials unless it
can positively confirm (a) a genuine sign-in affordance is present (not just
that a snapshot-in-time check missed it — it waits, bounded, for the
element) and (b) the page it's about to submit to is still on the expected
origin. Both checks throw rather than proceed on failure. This closed three
real gaps found during a three-round adversarial security review this SD ran
against its own code — see `strategic_directives_v2.metadata.security_findings_exec_to_plan`
on this SD for the full finding-by-finding trail.

## Deploy-Freshness: Keeping Chairman Approval Honest

`venture_gate_attestations`' `chairman_site_review` PASS verdicts previously
never invalidated when a venture redeployed — a chairman's "I approved this
site" could silently drift from what's actually live. `lib/eva/bridge/chairman-site-review-attestation.js`
now embeds the venture's `venture_deployments.sha` into `subject_ref`
(`venture_site:<id>:deploy:<sha>`) at write time; `lib/eva/lifecycle/crack-gate-evaluator.js`'s
`checkDeployFreshness()` compares that against the current sha at read time
and downgrades a stale PASS to `STALE_DEPLOY`.

This is observe-only today (both consumers — `lib/marketing/autonomy-gate.js`'s
publish gate and `stage-24-go-live.js`'s deploy precondition — remain
shadow-mode), and `venture_deployments.sha` is the literal string `"unknown"`
for most ventures until a deploy pipeline populates it. The check fails
toward availability (a possibly-stale PASS keeps reading fresh) when it
can't determine either sha, never toward inventing a block.

**Not yet built** (tracked, not dropped): running the existing-identity
fixture as a post-deploy gate in each venture's own `deploy.yml`, which needs
the credential-provisioning step above to happen first.

## Related

- PRD: `product_requirements_v2` id `PRD-SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001` (FR-0 through FR-6)
- SD metadata: `strategic_directives_v2.metadata` on `SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001` —
  `fr0_falsifier_artifact`, `oracle_m1_m2_m3_resolution`, `security_findings_exec_to_plan`,
  `real_callee_attestation`
