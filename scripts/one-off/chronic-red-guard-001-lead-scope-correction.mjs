#!/usr/bin/env node
/**
 * LEAD-phase scope correction for SD-LEO-INFRA-CHRONIC-RED-GUARD-001.
 *
 * A dispatched validation-agent, independently re-verified against live CI history and source
 * (gh run list on both workflows; scripts/sentinels/audit-security-linter.mjs:210-212;
 * docs/audits/migration-dispositions.json + scripts/lib/migration-disposition-ledger.mjs;
 * .github/workflows/migration-deploy-drift-guard.yml step list; a live failing run's full log),
 * found the SD's submitted premise (inherited verbatim from QF-20260824-600 and QF-20260824-315)
 * was wrong on multiple measured facts:
 *
 * 1. The sentinel's pg_net finding is explicitly excluded from `findings`/`clean`/`--strict`
 *    (audit-security-linter.mjs:210-212, documented in a comment at :160-165) -- it CANNOT be
 *    the cause of the sentinel's red runs, confirmed absent from the historical log lines too.
 * 2. Both red-run counts were undercounts: drift guard is 20/20 (at least; measured 100/100
 *    separately) red back to >=2026-08-07, not "8 consecutive"; sentinel is 12 consecutive
 *    weekly reds since 2026-06-08, not "6 since 07-20" (last success was 2026-06-02).
 * 3. The real, accumulating cause of the sentinel's reds is a live security backlog -- 12
 *    RLS-disabled tables, 1 sensitive-column exposure, 2 mutable-search-path SECURITY DEFINER
 *    functions -- trending 1 -> 11 -> 12 across the three sampled runs, not a static
 *    acknowledged state.
 * 4. FR-1 as submitted (add a CEREMONY_PENDING branch to the blocking predicate) would duplicate
 *    a mechanism that already exists: scripts/lib/migration-disposition-ledger.mjs +
 *    docs/audits/migration-dispositions.json already implement exactly what FR-2/FR-3 proposed
 *    to build, including an "auto:chairman-gate-marker" source for exactly this file class, and
 *    is ALREADY suppressing a chairman-gated file today. The predicate edit would itself violate
 *    the SD's own FR-3 principle (baselines are data, not predicate edits).
 * 5. FR-4 ("both workflows green on next scheduled run") is unachievable as scoped: the drift
 *    guard fails on 3 independent steps (Strict apply-state verifier; Disposition ledger is in
 *    sync with its seeder; FR-6 fail-open wiring proof), only the first of which FR-1 addresses.
 *    Re-verified the FR-6 step directly (run 32744548692's log): it is a GENUINE test failure --
 *    "an APPLIED ledger entry cannot suppress a real gap or fake completion, end to end" expects
 *    output containing "LEDGER CONTRADICTS SCHEMA" and receives the normal advisory report
 *    instead -- a real fail-open safety-mechanism defect, not ceremony noise. Separately, the
 *    live gap list contains 3 genuine NOT_APPLIED migrations (not ceremony-classified) that must
 *    stay blocking under the SD's own design.
 *
 * All 7 claims independently re-verified against live CI (`gh run list`), live source, and a
 * live run's failure log before this correction was written -- not accepted on the sub-agent's
 * word alone.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CHRONIC-RED-GUARD-001';

const description = `Chronic-red guard pair: CEREMONY_PENDING ledger re-sync + sentinel real-backlog disposition

# Chronic-red guard pair: CEREMONY_PENDING ledger re-sync + sentinel real-backlog disposition

## Type
infrastructure

**Provenance (CORRECTED at LEAD -- both submitted QFs mismeasured their root cause; corrected numbers below are independently re-verified against live \`gh run list\` history and a live failing run's log, not accepted on a sub-agent's word)**:
- QF-20260824-600 claimed "8 consecutive red runs" for migration-deploy-drift-guard. Measured: at least 20/20 (100/100 separately sampled) consecutive failures, back to >=2026-08-07.
- QF-20260824-315 claimed "6 consecutive weekly reds since 07-20" for security-linter-sentinel, caused by the ONE documented platform-blocked pg_net finding. Measured: 12 consecutive weekly reds since 2026-06-08 (last success 2026-06-02); pg_net is explicitly excluded from the sentinel's \`findings\`/\`clean\`/\`--strict\` computation (scripts/sentinels/audit-security-linter.mjs:210-212) and cannot be the cause -- confirmed absent from the historical failure logs too. The real, ACCUMULATING cause is a live security backlog: 12 RLS-disabled tables + 1 sensitive-column exposure + 2 mutable-search-path SECURITY DEFINER functions, trending 1->11->12 across sampled runs (2026-06-08 -> 2026-07-20 -> 2026-08-24).

Both approved-with-rationale ladder decisions by Adam (e38f6e14, bfeb85ff) were made on these unmeasured premises. Belt refill on coordinator deficit ping 9d19f0d6. Sourced by Adam 0549d739.

## Problem (one class, two specimens -- pathology framing correct, root-cause framing was wrong)
A guard that stays red on a KNOWN, deliberate, documented state is the QUARANTINE=CI-BLIND shape: readers stop looking, and any NEW finding hides inside the standing red. This framing is correct and is exactly what has happened: the drift guard's own ceremony-file drift has *already* been joined by 3 genuine, ordinary NOT_APPLIED migrations hiding in the same red; the sentinel's *actual* backlog (RLS/sensitive/mutable-fn) has grown 12x since the guard first turned red, invisible behind an assumption that pg_net was the sole cause.

CEREMONY_PENDING is already correctly classified by the drift guard AND already has a working, data-driven suppression mechanism (scripts/lib/migration-disposition-ledger.mjs + docs/audits/migration-dispositions.json, source:"auto:chairman-gate-marker") -- it drifted red because the ledger was never re-seeded after new chairman-gated migrations landed, not because the guard lacks a warn-not-block path. The sentinel has NO equivalent mechanism for its real (non-pg_net) findings and currently hardcodes its one existing exemption list (\`EXEMPTED_TABLES\`/\`EXEMPTED_TABLE_PATTERNS\`, audit-security-linter.mjs:52-72) directly in the predicate -- itself a violation of the "baselines are data" principle this SD exists to establish.

## Scope (one SD, corrected)
- FR-1 (drift guard, CEREMONY_PENDING portion): Re-seed and commit \`docs/audits/migration-dispositions.json\`, and harden \`npm run migration:dispositions:seed\` so ceremony-pending chairman-gated files stay reliably re-dispositioned as new ones land (a seeder-reliability fix, NOT a new predicate branch -- adding a CEREMONY_PENDING branch to the blocking predicate would duplicate the existing ledger mechanism and itself violate FR-3). This clears both the "Strict apply-state verifier" step's ceremony-attributable portion AND the "Disposition ledger is in sync with its seeder" step.
- FR-1b (NEW -- promoted from a real defect the validation pass found, not ceremony noise): Fix the "FR-6 fail-open wiring proof" test failure (tests/integration/migration-apply-state-ledger-wiring.test.js, case "an APPLIED ledger entry cannot suppress a real gap or fake completion, end to end") -- a genuine safety-mechanism defect where a ledger entry claiming APPLIED for a migration schema evidence contradicts does not trigger the expected "LEDGER CONTRADICTS SCHEMA" fail-open detection. Required for FR-4's "green" criterion to be honest; if PLAN determines this is a larger, separable defect, it may be split into a companion SD with an explicit cross-reference here -- but must not be silently dropped.
- FR-2 (sentinel, corrected): pg_net is NOT the cause of the sentinel's reds and needs no baseline entry -- it is already correctly excluded. The real, accumulating blockers (12 RLS-disabled tables, 1 sensitive-column exposure, 2 mutable-search-path SECURITY DEFINER functions as of 2026-08-24, growing) require a PLAN-phase, finding-by-finding disposition: for each, either (a) real remediation (enable RLS / add policy / fix search_path), or (b) a narrowly-justified baseline entry (finding fingerprint + documentation ref + genuine platform/architecture-blocked reason + review-by date) reusing \`migration-disposition-ledger.mjs\`'s existing schema. A blanket baseline of all findings is explicitly REJECTED -- it would suppress a live, worsening security regression, which is the opposite of this SD's intent and a Gate-1 security concern in its own right.
- FR-2b (NEW): Migrate the sentinel's hardcoded \`EXEMPTED_TABLES\`/\`EXEMPTED_TABLE_PATTERNS\` (audit-security-linter.mjs:52-72) out of the predicate into a data manifest, consistent with FR-3's own principle -- the sentinel currently violates the exact principle this SD is meant to establish for it. Also fix the missing \`venture_artifacts_storm_quarantine_20260704\` exemption (an unexempted sibling of the already-exempted \`_20260610\` table, inflating the live finding count by one).
- FR-3 (unchanged in principle, retargeted): Baselines are DATA (manifest/allowlist files), never predicate edits -- already satisfied for the drift guard via the existing ledger; is the actual FR-2/FR-2b work for the sentinel. Reuse \`migration-disposition-ledger.mjs\`'s schema (reason + owner + review_by + sd_key) rather than inventing a second format.
- FR-4 (corrected success criteria): "Both guards green on next scheduled run" is achievable ONLY if (a) the ledger is re-seeded (FR-1), (b) the FR-6 wiring defect is fixed or explicitly companion-SD'd (FR-1b), (c) the 3 currently-NOT_APPLIED migrations (20260821_worker_wind_down_events.sql, 20260821_purge_killed_venture_scheduler_queue.sql, 20260819_eva_scheduler_metrics_created_at_index.sql) are resolved -- applied, or determined stale/obsolete and explicitly dispositioned; deploying migrations is a different action class than guard-hardening and PLAN must decide whether it is in this SD's scope or a named, explicit companion action -- and (d) the sentinel's real security backlog is resolved to zero or narrowly, individually baselined per FR-2. PLAN must produce a concrete, measured plan for each before EXEC begins.
- Post-ship census: both workflows' next scheduled runs, measured and cited on the SD -- reporting the true outcome (including any remaining named blockers), not assuming "both green" is automatic from FR-1/FR-2/FR-3 alone.

## Out of scope (unchanged, now correctly grounded)
The pg_net remediation itself (lib/security/pg-net-exposure.js) -- confirmed genuinely platform-blocked: \`postgres\` has zero grant-authority over \`supabase_admin\`-owned \`net.*\` objects, REVOKE silently no-ops, ALTER DEFAULT PRIVILEGES hard-errors 42501, and a SECURITY DEFINER event-trigger workaround was built and independently failed for the same reason. Ceremony DDL mechanics (the chairman-gate process itself, not this SD's concern).

## Success criteria (corrected)
- Drift guard: ceremony-attributable reds clear via ledger re-seed; FR-6 wiring defect fixed or explicitly companion-SD'd; the 3 named NOT_APPLIED migrations explicitly dispositioned (applied, or documented as stale with a follow-up owner) -- not silently left red.
- Sentinel: every one of the 15 live findings (as of 2026-08-24) is either remediated or carries an individually-justified baseline entry with a documentation ref and review-by date; a blanket baseline is rejected. \`EXEMPTED_TABLES\` migrated to a data manifest.
- A synthetic NOVEL finding still reds each guard (fixtures) -- unchanged from the original intent.
- Post-ship census on both workflows' next scheduled runs, measured and cited, reporting the true outcome.
`;

const rationale = `Two same-day QFs (QF-20260824-600, QF-20260824-315) both diagnosed a chronic-red CI guard as caused by an acknowledged/known-safe state the guard should warn-not-block on. LEAD-phase validation independently re-measured both against live CI history (gh run list on both workflows), live source (audit-security-linter.mjs's strict-findings computation, the disposition ledger module, the drift guard's 3-step workflow), and a live failing run's full log -- and found the drift guard's claimed cause (CEREMONY_PENDING) is only 1 of 3 failing steps, and the sentinel's claimed cause (pg_net) is provably excluded from its strict predicate and was never the cause. The real causes are a stale disposition ledger (fixable by re-seeding, not a predicate edit -- FR-3-compliant) and a live, accumulating (1->11->12) RLS/security-exposure backlog that must not be blanket-baselined away. Scope corrected to fix the measured root causes rather than the submitted, unmeasured premise.`;

const strategicObjectives = [
  'Close the chronic-red CI-blindness pattern on both guards by fixing their MEASURED root causes (a stale disposition ledger; a genuine FR-6 wiring defect; a live, accumulating security backlog), not the QFs\' unmeasured, incorrect premise (CEREMONY_PENDING blocking; pg_net causing sentinel reds)',
  'Establish and extend the "baselines are data, not predicate edits" pattern for the sentinel, reusing the drift guard\'s already-shipped ledger mechanism rather than inventing a parallel format',
  'Ensure the sentinel\'s real, worsening RLS/security-exposure backlog is disposed of via genuine remediation or individually-justified, auditable baseline entries -- never a blanket suppression that would hide a live regression',
];

const keyChanges = [
  { change: 'Re-seed docs/audits/migration-dispositions.json and harden npm run migration:dispositions:seed for reliable re-dispositioning of new chairman-gated files (FR-1)', impact: 'Clears the ceremony-attributable portion of both the Strict apply-state verifier step and the Disposition ledger sync step, with zero predicate edits' },
  { change: 'Fix the genuine FR-6 fail-open wiring-proof test failure (tests/integration/migration-apply-state-ledger-wiring.test.js) or explicitly split it into a cross-referenced companion SD (FR-1b)', impact: 'The gate\'s corrupt-ledger safety mechanism is proven live and correct, not silently broken behind ceremony noise' },
  { change: 'Finding-by-finding disposition of the sentinel\'s 15 live RLS/sensitive/mutable-fn findings: real remediation or individually-justified baseline entries via the existing ledger schema; pg_net requires no baseline since it is already correctly excluded (FR-2)', impact: 'Closes a live, growing security backlog instead of masking it; sentinel becomes a real signal again' },
  { change: 'Migrate the sentinel\'s hardcoded EXEMPTED_TABLES/EXEMPTED_TABLE_PATTERNS out of the predicate into a data manifest; fix the missing venture_artifacts_storm_quarantine_20260704 exemption (FR-2b)', impact: 'The sentinel itself stops violating the "baselines are data" principle this SD establishes' },
  { change: 'Explicit disposition (apply or document-as-stale) of the 3 currently-NOT_APPLIED migrations found live in the drift guard\'s gap list', impact: 'FR-4\'s "both green" success criterion becomes honestly achievable rather than assumed' },
];

const successCriteria = [
  { criterion: 'Drift guard: ceremony reds clear via ledger re-seed; FR-6 wiring defect fixed or companion-SD\'d; the 3 named NOT_APPLIED migrations explicitly dispositioned', measure: 'Next scheduled/triggered drift-guard run after merge, measured and cited on the SD' },
  { criterion: 'Sentinel: all 15 live findings (as of 2026-08-24) either remediated or carry an individually-justified baseline entry (fingerprint + doc ref + reason + review-by); pg_net untouched (already correctly excluded); EXEMPTED_TABLES migrated to a data manifest', measure: 'Next Sunday scheduled sentinel run after merge, measured and cited on the SD; zero blanket baseline entries' },
  { criterion: 'A synthetic novel finding still reds each guard (fixtures)', measure: 'Fixture pair per guard: known-state input -> warning/suppressed; novel-finding input -> hard fail' },
];

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: existing, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (readErr) throw new Error(`read failed: ${readErr.message}`);

  const metadata = {
    ...existing.metadata,
    lead_scope_correction: {
      corrected_at: new Date().toISOString(),
      corrected_by: 'LEAD validation (dispatched validation-agent, independently re-verified)',
      reason:
        'Both submitted QFs mismeasured their root cause. Sentinel: pg_net is provably excluded from the strict findings computation and cannot be the cause; real cause is a live, accumulating (1->11->12) RLS/security-exposure backlog. Drift guard: CEREMONY_PENDING is only 1 of 3 failing steps (ledger-sync + a genuine FR-6 wiring-proof test failure are the other two); FR-1 as submitted would have duplicated the already-shipped disposition-ledger mechanism and violated the SD\'s own FR-3 principle.',
      corrected_red_run_counts: {
        drift_guard: 'at least 20/20 (100/100 separately sampled) consecutive failures since >=2026-08-07, not "8 consecutive"',
        sentinel: '12 consecutive weekly reds since 2026-06-08 (last success 2026-06-02), not "6 since 07-20"',
      },
      verified_via: [
        'gh run list --workflow=migration-deploy-drift-guard.yml --limit 20 --json conclusion,createdAt,status',
        'gh run list --workflow=security-linter-sentinel.yml --limit 20 --json conclusion,createdAt,status',
        'scripts/sentinels/audit-security-linter.mjs:210-212 (pg_net exclusion from findings/clean/strict)',
        'gh run view 32744548692 --json jobs (3 failing steps in drift guard)',
        'gh run view 32744548692 --log-failed (FR-6 wiring proof genuine test failure)',
        'docs/audits/migration-dispositions.json + scripts/lib/migration-disposition-ledger.mjs (existing ledger mechanism)',
      ],
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      description,
      scope: 'Chronic-red guard pair: re-seed the drift guard\'s disposition ledger, fix a genuine FR-6 wiring defect, and dispose of the sentinel\'s real (non-pg_net) security backlog via remediation or individually-justified baseline entries.',
      rationale,
      strategic_objectives: strategicObjectives,
      key_changes: keyChanges,
      success_criteria: successCriteria,
      metadata,
    })
    .eq('sd_key', SD_KEY);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log(`✅ LEAD scope correction applied to ${SD_KEY}`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
