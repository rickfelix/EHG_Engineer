#!/usr/bin/env node
/**
 * One-off: VALIDATION sub-agent evidence for SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F, LEAD phase.
 *
 * Records the read-only verification of the SD's three factual premises (C4.1 inert stage-17
 * self-approval write, C4.2 stage-24 is_high_consequence drift, C4.3 monitoring-category stub
 * with an already-running automated producer), the duplicate/prior-art check, and the scope
 * concerns PLAN must resolve before authoring the PRD.
 *
 * READ-ONLY: this script performed no DDL/DML against the live database beyond the evidence
 * row it writes here. C4.2 in particular is a chairman-gated data change and was NOT applied.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F';
const PHASE = 'LEAD';

const findings = [
  {
    id: 'c4-1-premise-confirmed-resolved-at-column-absent',
    severity: 'HIGH',
    summary: 'C4.1 CONFIRMED. Live read-only probe `select id,resolved_at from chairman_decisions limit 1` returns PostgREST 42703 "column chairman_decisions.resolved_at does not exist". The write at lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js lines 508-512 -- `.from(\'chairman_decisions\').update({ status: \'approved\', decision: \'approve\', resolved_at: new Date().toISOString() }).eq(\'id\', decisionId)` inside the `if (gateRecommendation === \'PASS\')` branch -- therefore targets a non-existent column and has never approved anything. The SD premise that this write is inert is factually correct.',
  },
  {
    id: 'c4-1-mechanism-correction-error-is-returned-not-thrown-and-the-pass-log-lies',
    severity: 'HIGH',
    summary: 'C4.1 MECHANISM CORRECTION (material for PLAN). The SD description says the failure is "caught by a non-fatal try/catch". It is NOT caught. supabase-js resolves a failed .update() to `{ data, error }` rather than rejecting -- empirically demonstrated in this very session: the verification probe used `.then(({data,error}) => ...)` and received the 42703 in the resolved value, not a rejection. The call site ignores the returned object entirely (no `const { error } =` destructure, no .throwOnError()), so the outer catch at lines 517-519 never fires. Consequence: execution falls through to line 513, `logger.info(\'[Stage17] PASS -- chairman decision auto-approved: ${decisionId}\')`, which emits a FALSE auto-approval log on every PASS while the decision row stays pending. The defect is therefore "silently discarded error + misleading success log", not "caught and warned". Removing the write per C4.1 must also remove or correct that log line, otherwise the misleading operator-facing message survives the fix.',
  },
  {
    id: 'c4-1-corroborated-by-an-in-file-comment',
    severity: 'INFO',
    summary: 'C4.1 is independently corroborated inside the same file: the recordGateResult comment block at lines 448-458 (SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-2) explicitly declines to bridge-write venture_gate_attestations because that would be "the exact self-approval pattern" the vga_attester_not_producer CHECK exists to prevent, and parenthetically cites "this file\'s own existing chairman_decisions auto-approval, which silently no-ops today". A prior SD already diagnosed this write as a dead self-approval and routed around it rather than removing it. C4.1 closes that loop.',
  },
  {
    id: 'c4-1-removal-is-behaviour-preserving',
    severity: 'INFO',
    summary: 'C4.1 removal carries no functional risk: createOrReusePendingDecision (lines 496-503) runs BEFORE the dead UPDATE and already persists the pending decision row. Deleting the PASS-branch UPDATE leaves the pending decision exactly as it is today, because the UPDATE never mutated it. The only observable change is the disappearance of the false "auto-approved" log line. No caller depends on a status=approved row produced here (the write has never produced one).',
  },
  {
    id: 'c4-2-premise-confirmed-stage-24-is-the-only-false-among-its-peers',
    severity: 'HIGH',
    summary: 'C4.2 CONFIRMED. Read-only query of venture_stages for stage_number in (3,19,24,25) returns is_high_consequence: stage 3 = true, stage 19 = true, stage 24 = FALSE, stage 25 = true. Stage 24 is the sole outlier, exactly as the SD states.',
  },
  {
    id: 'c4-2-stage-24-is-a-kill-gate-which-sharpens-the-inconsistency',
    severity: 'HIGH',
    summary: 'C4.2 evidence beyond the SD text: the full stage-24 row is stage_name "Launch Readiness", stage_key "launch_readiness_gate", gate_type "kill", work_type "decision_gate", gate_label "KILL GATE: Launch readiness - all prerequisites must pass", is_irreversible FALSE, is_high_consequence FALSE. A stage the schema itself labels a KILL GATE carrying is_high_consequence=false is a self-evident data inconsistency, not a judgement call. This materially strengthens the case for the correction and should be quoted in the chairman-gated file\'s BUG prose. PLAN should also decide explicitly whether is_irreversible (also FALSE) is in or out of scope -- the SD scopes only is_high_consequence, and this validation does NOT assert is_irreversible is wrong.',
  },
  {
    id: 'c4-2-must-be-chairman-gated-classifier-confirms-tier-2',
    severity: 'HIGH',
    summary: 'C4.2 routing CONFIRMED mechanically. scripts/lib/migration-tier-classifier.mjs FORBIDDEN_TOPLEVEL (line 44) includes the UPDATE token, and classifyMigration() was run read-only against the literal statement `UPDATE venture_stages SET is_high_consequence = TRUE WHERE stage_number = 24;` -> {"tier":2,"reason":"unrecognized_or_unsafe_statement"}. Tier 2 = chairman-gated, cannot be self-applied by a worker. This is machine-confirmed, not convention-inferred.',
  },
  {
    id: 'c4-2-file-convention-confirmed-including-the-dry-run-sibling',
    severity: 'MEDIUM',
    summary: 'C4.2 convention confirmed from database/chairman-gated/20260913_claim_sd_parent_child_single_pointer.sql: header is the path comment, `-- @chairman-gated`, `-- @approved-by: <email>` (the line scripts/lib/migration-guards.js APPROVED_BY_RE enforces), the SD key, then BUG/FIX prose and an explicit "STAGED ONLY ... NOT applied by this SD\'s own worker" clause. DOWN sibling = same basename + `_DOWN.sql`. NOTE for PLAN: the two most recent DATA-changing chairman-gated files (20260912_venture_channel_publish_ledger_execution_mode, 20260913_uat_control_pack_evaluated_derive) each ship a THIRD file, an executable `*_dry_run.mjs` sibling, which the function-body-only claim_sd file does not. C4.2 is a data UPDATE, so it should follow the data-change precedent and ship the dry-run sibling, not just the UP/DOWN pair.',
  },
  {
    id: 'c4-3-producer-and-cron-wiring-confirmed-end-to-end',
    severity: 'INFO',
    summary: 'C4.3 producer wiring CONFIRMED. scripts/cron/venture-ops-actuals-sweep.mjs line 42 imports runVentureUptimeProbe from ../../lib/ops/venture-uptime-probe.js, registers it as armed machinery (line 56, key venture-uptime-probe) and invokes it as "Job 3: uptime probe" at line 293. lib/ops/venture-uptime-probe.js runVentureUptimeProbe (line 188) computes state via the pure computeNextProbeState (line 71) and persists it at lines 206-208 as `.from(\'venture_deployments\').update({ metadata: { ...row.metadata, probe } })`, with probe fields reachable/surfaced/last_checked_at/consecutive_failures/status_code/last_error -- exactly the field set the SD names. Same sweep already re-reads metadata.probe.reachable downstream at line 350, so a second reader is an established pattern here.',
  },
  {
    id: 'c4-3-live-data-is-fresh',
    severity: 'INFO',
    summary: 'C4.3 live data CONFIRMED fresh. venture_deployments holds 4 rows across 3 distinct ventures, every row carrying a populated metadata.probe. Two rows show last_checked_at 2026-09-13T11:54:42.169Z (same day as this validation run), one shows 2026-09-12T15:32:58.899Z. consecutive_failures 0 and surfaced false across the sample. The producer is genuinely running on schedule, not dormant -- so C4.3 is a reader-wiring task, not a build-the-producer task.',
  },
  {
    id: 'c4-3-monitoring-stub-located-analytics-precedent-confirmed',
    severity: 'INFO',
    summary: 'C4.3 target CONFIRMED. lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js line 52 `ADVISORY_CATEGORIES = [\'analytics\', \'monitoring\']`. The `monitoring` category has no case of its own -- it falls through to the `default:` branch (lines 338-343) whose isAdvisory path sets `detail = \'No automated producer; chairman attestation suffices\'` at line 342. The analytics precedent to mirror is exact: precompute helper checkTelemetryAnalyticsWired (line 180) calling verifyCapabilityWired (line 183, imported line 41), awaited once before the synchronous checklist .map() at line 258, consumed by `case \'analytics\':` (lines 328-337) which only swaps detail text and keeps `status = \'advisory\'`. C4.3 can follow this shape 1:1.',
  },
  {
    id: 'c4-3-scope-concern-the-analytics-half-of-the-sd-title-is-already-done',
    severity: 'HIGH',
    summary: 'DUPLICATE-WORK RISK. The SD row\'s own title says "...replace chairman-attestation-suffices on monitoring AND ANALYTICS with automated producers (C4.1-C4.3)". Analytics is ALREADY DONE -- delivered by SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C, visible at lines 323-337 and 180-188 of the target file. Only the `monitoring` default-branch stub remains. The task scope as briefed to this validation correctly narrows C4.3 to monitoring only, but the persisted SD title does not. PLAN must scope the PRD to monitoring ONLY and should correct the SD title, or a future reader will re-implement the analytics producer that already exists. This is the single highest-value finding in this validation.',
  },
  {
    id: 'c4-3-stale-header-prose-contradicts-shipped-code',
    severity: 'MEDIUM',
    summary: 'Same file, lines 9-12 (the FR-3 header block) still reads "analytics, monitoring categories have no automated producer in S17-S22 ... mark them as ADVISORY (chairman attestation suffices)". That statement became false when the analytics producer shipped and will become doubly false when C4.3 lands. The file already carries precedent for amending this header in place (the SD-FDBK-FIX-BUILD-LEGAL-DOC-001 note at lines 14-18 that documents legal\'s removal from ADVISORY_CATEGORIES). C4.3 should amend the header prose in the same style rather than leave two contradicting descriptions of the same list.',
  },
  {
    id: 'c4-3-probe-reachable-is-liveness-not-health-404-reads-as-reachable',
    severity: 'HIGH',
    summary: 'SEMANTIC TRAP for C4.3. lib/ops/venture-uptime-probe.js checkReachability line 51 returns `reachable: statusCode >= 200 && statusCode < 500`. A 404 therefore counts as REACHABLE, and this is not hypothetical -- live row venture 6e23ad2b-2f6c-45b2-8ee9-e9e69a32bb66 currently has status_code 404 WITH reachable:true. If C4.3 renders monitoring detail text as "monitoring healthy/wired" off `reachable`, stage-24 launch readiness will report a 404-serving deployment as monitored and fine. PLAN must specify the exact predicate and wording: the honest claim this data supports is "an uptime probe is running and last checked at <ts>" (monitoring COVERAGE/liveness), optionally qualified by status_code, NOT "the deployment is healthy". Recommend the detail text surface last_checked_at and status_code explicitly.',
  },
  {
    id: 'c4-3-per-venture-reader-must-aggregate-multiple-deployment-rows',
    severity: 'MEDIUM',
    summary: 'C4.3 implementation detail. venture_deployments is per-URL, not per-venture: venture 50763b6a-1fad-4e1e-b2fc-296a1d66ebf9 currently has TWO rows (https://altifyai.rickfelix2000.workers.dev and https://altifyai.app) with DIFFERENT probe timestamps (2026-09-12T15:32Z vs 2026-09-13T11:54Z). The analytics precedent verifyCapabilityWired(supabase, ventureId, ...) is single-valued per venture, so a naive 1:1 mirror that does .eq(venture_id).single() will throw or silently pick one row. PLAN must define the aggregation rule (recommend: newest last_checked_at wins, and treat any row with surfaced=true as the governing signal).',
  },
  {
    id: 'c4-2-and-c4-3-are-the-same-stage-under-two-numbers',
    severity: 'HIGH',
    summary: 'CROSS-ITEM COUPLING not called out in the SD scope. C4.2 targets DB venture_stages.stage_number 24 (stage_name "Launch Readiness", stage_key launch_readiness_gate) while C4.3 edits a file named stage-23-launch-readiness.js that hardcodes `stage_number: 23` at line 203 and whose header is titled "Stage 23 Analysis Step -- Launch Readiness Kill Gate". These are the SAME logical stage under two different numbers post-renumber. Confirming evidence: the stage-24 DB row\'s metadata.checklist_categories is exactly ["code_quality","marketing_assets","distribution_channels","analytics","monitoring","legal"] -- the very category list the stage-23 file builds, including the `monitoring` entry C4.3 fixes; component_path is "Stage23LaunchReadiness.tsx". Sibling SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H (C5.1) explicitly owns "the stage_number 23 telemetry label" among the live stage literals. PLAN must NOT fix the literal here (that is -H\'s scope and would collide), but the PRD must state the identity so the C4.2 chairman-gated file and the C4.3 code edit are understood to touch one stage, and so -F is sequenced against -H rather than silently racing it.',
  },
  {
    id: 'no-prior-art-duplicate-check-clean',
    severity: 'INFO',
    summary: 'DUPLICATE CHECK CLEAN for all three items as scoped. (1) `git log --all --grep` for both "VENTURE-QUALITY-CAPA-001-F" and the broader "VENTURE-QUALITY-CAPA" returns ZERO commits on any branch -- no sibling has started. (2) grep for "VENTURE-QUALITY-CAPA-001-F" across lib/, scripts/ and database/ returns zero hits, so no code or staged migration references this SD yet. (3) sub_agent_execution_results for sd_id c73060db-54f9-4074-b386-83818db386ea was EMPTY before this row -- this is the first evidence written for this SD. (4) database/chairman-gated/ contains no venture_stages file, so C4.2 is not already staged. The only overlap found anywhere is the already-shipped ANALYTICS producer, recorded separately above.',
  },
  {
    id: 'sd-family-context-nine-draft-siblings',
    severity: 'INFO',
    summary: 'Context for LEAD: SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F (id c73060db-54f9-4074-b386-83818db386ea, status draft, current_phase LEAD) is one of nine lettered children (A-J) of parent e76214ff-be74-460b-9c30-68ba610ef711, ALL still status=draft. -F is not blocked by any sibling for C4.1 and C4.2. Its only real coupling is the -H stage-literal overlap recorded above, and that coupling is advisory (do-not-touch), not a hard dependency.',
  },
];

const warnings = [
  'C4.2 IS A CHAIRMAN-GATED DATA CHANGE AND WAS NOT APPLIED BY THIS VALIDATION. Every database call made during this validation was a read (select) plus the single evidence-row write this script performs. venture_stages was READ ONLY; stage 24 is still is_high_consequence=false in the live DB. EXEC must stage the change as database/chairman-gated/<date>_venture_stages_stage_24_high_consequence.sql + _DOWN.sql (+ a _dry_run.mjs sibling per the data-change precedent) and must NOT self-apply. Expect this SD to reach LEAD-FINAL with a WAIT on chairman apply-verification rather than a clean completion.',
  'The SD title over-scopes C4.3 to "monitoring and analytics". Analytics already has its automated producer (SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C, lines 323-337). PLAN must write the PRD for MONITORING ONLY and correct the title; taking the title literally would mean re-implementing shipped code.',
  'The C4.1 description in the SD ("caught by a non-fatal try/catch") mis-states the failure mechanism. The error is returned-and-discarded by supabase-js, never thrown, so the catch never fires and a false "chairman decision auto-approved" INFO log is emitted on every PASS. The PRD must scope the log line alongside the UPDATE or the misleading operator message outlives the fix.',
  'C4.3 must not equate probe `reachable` with healthy: a 404 currently satisfies reachable (statusCode < 500) and one live venture is in exactly that state right now. Wording the monitoring detail as a health claim would ship a new false-green into a kill gate -- the same class of defect this CAPA family exists to remove.',
  'Do NOT fix the `stage_number: 23` literal at line 203 of stage-23-launch-readiness.js in this SD. That literal is sibling SD-...-001-H (C5.1) scope; touching it here creates a cross-child collision.',
];

const recommendations = [
  'APPROVE the SD for LEAD-TO-PLAN. All three factual premises (C4.1 missing resolved_at column, C4.2 stage-24 is_high_consequence=false among true peers, C4.3 monitoring stub with a live automated producer) were independently verified read-only and all three hold. No duplicate implementation exists.',
  'PLAN must narrow C4.3 in the PRD to the `monitoring` category ONLY and amend the SD title, which still claims analytics is in scope.',
  'PLAN must specify the exact monitoring predicate and detail wording, on the basis that probe.reachable is a LIVENESS signal (200-499) and not a health signal. Recommended shape: mirror checkTelemetryAnalyticsWired as a precomputed checkVentureUptimeProbed({supabase, ventureId, logger}) awaited before the checklist .map(), add a `case \'monitoring\':` that keeps status=\'advisory\' and only changes detail text, surfacing last_checked_at and status_code and degrading to the existing generic string on any error or absent row -- byte-for-byte the analytics degradation contract.',
  'PLAN must define the multi-deployment aggregation rule for C4.3 (venture_deployments is per-URL; one live venture already has two rows with differing probe timestamps). Recommended: newest last_checked_at wins, with any surfaced=true row governing.',
  'EXEC C4.1: delete the PASS-branch UPDATE at stage-17-blueprint-review.js lines 508-512 AND the false-success logger.info at line 513 together. Keep createOrReusePendingDecision and the else-branch pending log intact. Consider collapsing the now-single-purpose try/catch. Removal is behaviour-preserving because the UPDATE never mutated anything.',
  'EXEC C4.2: stage the UPDATE as a chairman-gated file following the 20260913_claim_sd_parent_child_single_pointer.sql header convention (@chairman-gated, @approved-by, SD key, BUG/FIX prose, explicit STAGED-ONLY clause) with a _DOWN.sql restoring is_high_consequence=false, plus a _dry_run.mjs sibling matching the 20260912/20260913 data-change precedent. Quote the kill-gate evidence (gate_type="kill", gate_label="KILL GATE: ...") in the BUG prose -- it is the strongest justification available.',
  'EXEC C4.3: amend the stale FR-3 header prose at lines 9-12 in the same commit, following the in-file precedent of the SD-FDBK-FIX-BUILD-LEGAL-DOC-001 note at lines 14-18, so the header stops asserting that analytics and monitoring have no producer.',
  'PLAN should note the C4.2/C4.3 stage-identity coupling (DB stage 24 == the file named stage-23) in the PRD and sequence -F against sibling -H (C5.1), which owns the stage-literal sweep.',
];

const summary = 'LEAD-phase VALIDATION for SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F: all three premises VERIFIED read-only and CONFIRMED TRUE. C4.1 -- chairman_decisions.resolved_at returns 42703 column-does-not-exist, so the stage-17 PASS-branch self-approval UPDATE (stage-17-blueprint-review.js:508-512) is genuinely inert; corroborated by an in-file comment at lines 448-458 that already calls it a silent no-op. One material correction: the error is RETURNED by supabase-js, not thrown, so the try/catch never fires and a false "auto-approved" INFO log is emitted on every PASS -- the fix must remove that log too. C4.2 -- stage 24 is_high_consequence=FALSE against true for stages 3/19/25, and the full row shows gate_type="kill" with gate_label "KILL GATE", making the inconsistency self-evident; migration-tier-classifier.mjs was run read-only against the literal UPDATE and returned tier 2, mechanically confirming the change is chairman-gated and MUST NOT be self-applied (it was NOT applied here). C4.3 -- the producer is live, not dormant: the cron sweep imports and invokes runVentureUptimeProbe as Job 3 and venture_deployments carries metadata.probe on 4/4 rows with last_checked_at as recent as today, so C4.3 is reader-wiring only. Duplicate check CLEAN: zero commits on any branch matching the SD key or family, zero source references, zero prior evidence rows, no staged venture_stages migration. Verdict is CONDITIONAL_PASS (CONCERNS) on four scope issues PLAN must resolve, not on any failed premise: (1) the SD TITLE still claims analytics is in scope but the analytics producer already shipped under SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C -- taking the title literally means duplicating shipped code; (2) probe.reachable is liveness (200-499), not health -- a live venture is 404-with-reachable-true right now, so health wording would ship a new false-green into a kill gate; (3) venture_deployments is per-URL and one venture already has two rows with differing timestamps, so the reader needs an aggregation rule the analytics precedent does not provide; (4) C4.2 and C4.3 are the same logical stage under two numbers (DB stage 24 vs the hardcoded 23 in stage-23-launch-readiness.js:203), whose literal belongs to sibling -H (C5.1) and must not be touched here.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 95,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: PHASE,
      read_only_attestation:
        'No UPDATE/INSERT/DELETE was issued against any table during this validation other than this evidence row. C4.2 (venture_stages.is_high_consequence) was READ ONLY and remains unapplied pending chairman ceremony.',
      live_queries_run: [
        "select id,resolved_at from chairman_decisions limit 1 -> ERROR 42703 'column chairman_decisions.resolved_at does not exist'",
        'select stage_number,is_high_consequence from venture_stages where stage_number in (3,19,24,25) -> 3:true, 19:true, 24:FALSE, 25:true',
        'select * from venture_stages where stage_number = 24 -> stage_name "Launch Readiness", stage_key launch_readiness_gate, gate_type "kill", is_high_consequence false, is_irreversible false, metadata.checklist_categories includes analytics+monitoring',
        'select venture_id,url,metadata from venture_deployments limit 3 -> all rows carry metadata.probe; last_checked_at 2026-09-13T11:54:42.169Z (x2) and 2026-09-12T15:32:58.899Z; one row status_code 404 WITH reachable:true',
        'select venture_id,url from venture_deployments (count exact) -> 4 rows across 3 distinct ventures; venture 50763b6a has 2 rows',
        'select id,sub_agent_code,phase,verdict from sub_agent_execution_results where sd_id = c73060db-54f9-4074-b386-83818db386ea -> [] (empty before this row)',
      ],
      local_checks_run: [
        "classifyMigration('UPDATE venture_stages SET is_high_consequence = TRUE WHERE stage_number = 24;') -> {tier:2, reason:'unrecognized_or_unsafe_statement'} (chairman-gated required)",
        'git log --all --grep="VENTURE-QUALITY-CAPA-001-F" -> 0 commits; --grep="VENTURE-QUALITY-CAPA" -> 0 commits',
        'grep -rn "VENTURE-QUALITY-CAPA-001-F" lib scripts database -> 0 hits',
      ],
      artifacts_read: [
        'lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js (lines 435-525)',
        'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js (lines 1-20, 165-195, 320-345, plus category/import grep)',
        'lib/ops/venture-uptime-probe.js (lines 30-60, plus export/metadata grep)',
        'scripts/cron/venture-ops-actuals-sweep.mjs (import/invocation grep, lines 42/56/288-313/350)',
        'database/chairman-gated/20260913_claim_sd_parent_child_single_pointer.sql (header convention)',
        'database/chairman-gated/ directory listing',
        'scripts/lib/migration-tier-classifier.mjs (FORBIDDEN_TOPLEVEL line 44)',
        'lib/sub-agents/resolve-repo.js, lib/sub-agents/registry.json',
      ],
      premise_verdicts: {
        'C4.1_resolved_at_column_absent': 'CONFIRMED (42703), with a mechanism correction: error returned not thrown; false success log emitted',
        'C4.2_stage_24_is_high_consequence_false': 'CONFIRMED (24=false vs 3/19/25=true); kill-gate metadata strengthens it; tier-2 chairman-gated confirmed mechanically',
        'C4.3_monitoring_stub_and_live_producer': 'CONFIRMED (stub at line 342 default branch; producer live with same-day probe data); scope must exclude already-shipped analytics',
      },
      duplicate_check: 'CLEAN for C4.1/C4.2/C4.3 as scoped. Sole overlap: the analytics producer named in the SD TITLE already shipped (SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C).',
      quick_fixes_reviewed: [],
    },
    phase: PHASE,
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_KEY,
    { name: 'Principal Systems Analyst' },
    results,
    { sdKey: SD_KEY, phase: PHASE, source: 'manual' },
  );

  console.log('VALIDATION EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
