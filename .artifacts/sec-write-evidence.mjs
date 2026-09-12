import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '4520716b-0603-46b5-bf7e-19fe4271fe3b';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  metadata: {
    review_type: 'targeted re-verification of SEC-H2/M1/M2/M3/M4 fixes + independent regression scan of the SEC-M2 reordering and SEC-M3 gate removal',
    prior_review: '3ed447ec-de8c-4798-9fdc-5a0c814623a5 (CONDITIONAL_PASS, 90)',
    commits_reviewed: ['0e1bd49b864 (H2/M1/M2/M3/M4)', 'prior commit adding lib/marketing/ledger-execution-mode-probe.js (H1)'],
    branch: 'feat/SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 (PR #8777)',
    files_reviewed: [
      'database/chairman-gated/20260912_venture_channel_publish_ledger_outbound_gate_trigger.sql',
      'database/chairman-gated/20260912_venture_channel_publish_ledger_outbound_gate_trigger_dry_run.mjs',
      'database/chairman-gated/20260912_venture_channel_publish_ledger_execution_mode.sql',
      'lib/marketing/publisher/index.js', 'lib/marketing/autonomy-gate.js',
      'lib/marketing/ledger-execution-mode-probe.js', 'lib/marketing/ai/email-campaigns.js',
      'lib/marketing/venture-honesty-audit.js', 'lib/marketing/content-generator.js',
      'lib/marketing/content-pipeline.js', 'lib/marketing/owned-audience-content-loop.js'
    ],
    live_db_probes: [
      'ran the FR-5 trigger dry-run against the live DB: PASS (positive/negative/unresolvable controls + the SEC-H2 chairman_decisions no-bypass regression control all true; ROLLBACK, nothing persisted)',
      'pg_constraint on venture_channel_publish_ledger: UNIQUE (correlation_id) CONFIRMED LIVE',
      'PostgREST probe: execution_mode does NOT exist in the live schema (42703) - FR-4 migration still unapplied, so the execution-mode probe caches absent=false in production right now',
      'transactional rolled-back proof: after applying the FR-4 UP body in-txn, an INSERT omitting execution_mode fails 23502 not_null_violation; the same INSERT stamped execution_mode=live succeeds'
    ],
    test_evidence: 'self-run (not trusted from the commit message): npx vitest run tests/unit/marketing tests/unit/email-campaigns-db.test.js tests/unit/governance lib/creative/asset-view-gate.test.js => 134 files passed / 1 skipped, 2060 tests passed / 12 skipped',
    findings_verified_resolved: ['SEC-H2', 'SEC-M1', 'SEC-M2', 'SEC-M3', 'SEC-M4'],
    not_reflagged_per_scope: ['SEC-L1..L5', 'SEC-M5', 'INFO']
  },
  critical_issues: [],
  warnings: [
    {
      id: 'SEC-H1-R',
      severity: 'MEDIUM',
      issue: "SEC-H1 residual: the execution-mode probe's negative cache has NO invalidation path, so the FR-4 migration's deliberate NOT-NULL trap fires against this system's OWN writers across the ceremony. lib/marketing/ledger-execution-mode-probe.js caches executionModeExists=false for the PROCESS LIFETIME once it sees 42703/PGRST204 (no TTL, no reset outside __resetExecutionModeProbeForTests). execution_mode is confirmed ABSENT live today, so any process that performs a ledger write before the FR-7 ceremony pins that cache to false. The FR-4 column is NOT NULL with no default BY DESIGN. Therefore any such process still alive after the chairman applies the migration keeps omitting the column and every subsequent INSERT fails 23502 - i.e. exactly SEC-H1's original symptom (AUTONOMOUS_LEDGER_WRITE_FAILED fail-closed on the autonomous path, 'propose-record write failed' on the propose path), reintroduced through the mirror-image direction the fix did not cover. Freshly started processes are unaffected; the exposure is the ceremony window.",
      evidence: 'MEASURED transactionally (rolled back): applied the FR-4 UP body in-txn, then issued the probe-degraded payload (autonomy-gate.js INSERT shape minus execution_mode) => 23502 "null value in column execution_mode violates not-null constraint"; the stamped variant succeeded. Live PostgREST probe returns 42703 for execution_mode today, confirming the cache pins to false in production now.',
      fail_safe_direction: 'FAIL-CLOSED (denies publishes; never authorizes an unauthorized send). Availability/correctness defect, not an outreach bypass.',
      recommendation: 'Do NOT weaken the migration (its no-default choice is correct and well-reasoned). Fix on the probe side: invalidate the negative cache on a write error that proves the column now exists - treat 23502 mentioning execution_mode as "re-probe and retry once" - and/or give the negative cache a short TTL (e.g. 60s) instead of process-lifetime. Alternatively the ceremony runbook must require restarting marketing-writer processes immediately after apply.'
    },
    {
      id: 'SEC-M2-R',
      severity: 'LOW',
      issue: "SEC-M2 reorder regression (this answers the 'extra ledger rows on a dedup-hit replay' question directly): NO extra rows can be written - UNIQUE(correlation_id) is live and prevents them - but that same constraint converts the replay into a hard fail-closed DENIAL instead. publish() passes correlationId=idempotencyKey; on the autonomous tier checkPublishAuthorization() now runs FIRST and INSERTs a ledger row keyed on that exact correlation_id. A campaign_content dedup HIT requires a prior publish in the SAME wall-clock second (the key embeds Math.floor(Date.now()/1000)), which is precisely the case where the correlation_id already exists => 23505 => AUTONOMOUS_LEDGER_WRITE_FAILED => {success:false, blockedBy:'autonomy-gate'}, where pre-reorder the same call returned {success:true, deduplicated:true}. Fail-closed and narrow, so not a security hole; recorded for accuracy.",
      evidence: 'pg_constraint: venture_channel_publish_ledger_correlation_id_key = UNIQUE (correlation_id), confirmed live; a duplicate-correlation_id INSERT reproduced 23505 inside a rolled-back transaction.',
      recommendation: 'Optional: treat 23505 on the autonomous ledger insert as "this attempt is already recorded" (re-select the existing row by correlation_id and proceed) rather than as a fail-closed write failure.'
    },
    {
      id: 'SEC-M2-N1',
      severity: 'LOW',
      issue: "Premise-accuracy note on the SEC-M2 rationale (the FIX is still correct; the stated exploit path is not reachable as written). The new code comment and the commit message justify the reorder by saying campaign_content is also written ungated by content-generator.js. content-generator.js:82-87 does write it ungated, BUT its key format is ventureId:contentId:platform:Date.now() (MILLISECONDS) while publisher/index.js builds ventureId:contentId:platform:Math.floor(Date.now()/1000) (SECONDS) - the two can never be equal, so a content-generator row can never produce a dedup hit in publish(). Separately this shows publish()'s dedup is near-dead in general: because the key embeds the current second, any retry in a later second misses the dedup and RE-DISPATCHES for real. Auth-before-dedup remains the right order regardless.",
      evidence: 'lib/marketing/content-generator.js:82-87 vs the idempotencyKey construction in lib/marketing/publisher/index.js.',
      recommendation: 'Separate ticket: make the idempotency key time-independent (venture:content:platform, or a campaign-scoped nonce) so duplicate REAL dispatches are actually prevented, and align content-generator.js to the same format.'
    },
    {
      id: 'SEC-M1-N1',
      severity: 'INFO',
      issue: "Cosmetic consequence of the SEC-M1 rename, verified non-breaking: both callers gate on mode === 'real' (content-pipeline.js:140, owned-audience-content-loop.js:173), so dropping mode from the deny/dry-run paths is correctly falsy and nothing credits a non-send. owned-audience-content-loop.js:174 now renders not_real_mode:undefined where it previously carried the authorization token.",
      recommendation: 'Surface authMode in that reason string so the operator-facing reason keeps the detail.'
    }
  ],
  recommendations: [
    'SEC-H2, SEC-M1, SEC-M2, SEC-M3 and SEC-M4 are all independently VERIFIED RESOLVED against the current code - none is cosmetic, none introduces a new variant of its own bug.',
    'NON-BLOCKING for the build, but SEC-H1-R should be closed (or explicitly handled in the ceremony runbook) BEFORE the FR-7 chairman apply, because the apply itself is the trigger.',
    'No unauthorized-outreach path was found in this pass: every new failure mode located fails CLOSED.'
  ],
  detailed_analysis: [
    'SEC-H2 RESOLVED: the trigger function contains no chairman_decisions lookup at all (grep over the UP file returns only prose in the header), no SECURITY DEFINER, and SET search_path = pg_catalog, public. The predicate is the pure positive mirror of assertOutreachAuthorized (is_demo=false AND status=active AND stage>=24 AND launch_mode=live), fail-closed on NOT FOUND. I re-ran the dry-run against the live DB myself: PASS, including the new regression control proving a chairman_decisions row for the same venture does NOT bypass the trigger. All rolled back.',
    "SEC-M1 RESOLVED: mode now appears exactly once as an assignment in publisher/index.js - mode:'real' on the post-adapter.publish() return (line 207). The auth-deny path (line 63) and the credential-missing dry-run (line 144) both carry authCheck.mode as authMode. No 'live'/'mock' authorization token can reach the dispatch field on any path.",
    'SEC-M2 RESOLVED: checkPublishAuthorization() is now the first substantive call in publish() (line ~52), ahead of the campaign_content dedup SELECT (line ~68); the dedup early-return is {success:true, postId, deduplicated:true} with no mode claim.',
    'SEC-M3 RESOLVED: assertOutreachAuthorized appears exactly once in lib/marketing/ai/email-campaigns.js - inside sendEmail() (line 67). processStep() no longer calls it, so both the actorId mismatch and the one-shot override double-consume are gone. A refusal maps to {action:"suppressed", reason:"stage_gate", detail} (line 209), distinct from the transport {action:"failed"} (line 211).',
    'SEC-M3 GAP SCAN (requested): between the fresh consent re-read (resolveSendPermission) and the sendEmail() call, processStep() performs ONLY in-memory work - const step = steps[stepIndex] and the A/B html pick. No DB write, no external call, no consequential side effect now runs ungated. The campaign_enrollments advance happens strictly AFTER a successful send, and a gate refusal returns before it. Removing processStep()s own gate call opens no gap; sendEmail() still independently refuses a direct caller that bypasses processStep() entirely.',
    'SEC-M4 RESOLVED: buildHonestyAudit() selects execution_mode and falls back to the pre-existing column list on 42703 (or a message matching /execution_mode/), mirroring evaluateGraduation(). When available it reports live/mock separately with execution_mode_known:true; when absent it reports execution_mode_known:false AND pushes an explicit gap rather than a confident total. The execution_mode !== "mock" counts-as-live rule cannot misreport NULLs, because the FR-4 migration backfills every pre-existing row to live before setting NOT NULL.',
    'PART 2 autonomy_state ordering: no read/write ordering problem exists. checkPublishAuthorization() only READS venture_channel_autonomy; the only writer is evaluateGraduation(), which is not on publish()s path. Moving the auth call earlier changes no autonomy_state sequencing.',
    'PART 2 propose-tier reorder: benign. A dedup hit in the propose_and_approve tier implies a prior successful dispatch, which implies an accepted ledger row exists, so the auth call returns allowed and the dedup return is reached unchanged. A dedup MISS behaves exactly as it did before the reorder.',
    'PART 2 new issues found: SEC-H1-R (MEDIUM, fail-closed, ceremony-window), SEC-M2-R (LOW, fail-closed), SEC-M2-N1 (LOW, premise/idempotency accuracy), SEC-M1-N1 (INFO, message cosmetics). No HIGH or CRITICAL. No path was found by which any of the five fixes permits an unauthorized real send.'
  ].join('\n\n'),
  summary: 'Re-verified SEC-H2/M1/M2/M3/M4 against the current code, the live DB and a self-run test suite: all five are genuinely RESOLVED. The SEC-M2 reorder and the SEC-M3 gate removal open no unauthorized-send path; both new failure modes they can produce fail CLOSED. One MEDIUM residual remains on the already-landed SEC-H1 fix (process-lifetime negative cache vs the NOT NULL column), which should be closed before the chairman apply ceremony.'
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID, targetApplication: 'EHG_Engineer', subAgentCode: 'SECURITY',
  probeExistsRelative: 'lib/marketing/publisher/index.js', supabase: sb
});
applySubAgentRepoVerdict(results, resolution);

const { data, error } = await sb.from('sub_agent_execution_results').insert({
  sd_id: SD_ID, sub_agent_code: 'SECURITY', sub_agent_name: 'Chief Security Architect',
  phase: 'EXEC', verdict: results.verdict, confidence: results.confidence,
  critical_issues: results.critical_issues, warnings: results.warnings,
  recommendations: results.recommendations, detailed_analysis: results.detailed_analysis,
  summary: results.summary, metadata: results.metadata,
  conditions: [
    'SEC-H1-R (MEDIUM, fail-closed): close the execution-mode probe negative-cache invalidation gap, OR record an explicit ceremony-runbook step restarting every marketing-writer process immediately after the FR-4 migration apply. The apply itself is the trigger, so this must be settled before the FR-7 chairman ceremony, not after.',
    'SEC-M2-R (LOW, fail-closed) and SEC-M2-N1 (LOW): accept as known, or ticket separately. Neither blocks this build; the idempotency-key time-dependence in SEC-M2-N1 is a pre-existing defect this SD did not introduce.'
  ],
  justification: 'All five re-reviewed findings (SEC-H2, SEC-M1, SEC-M2, SEC-M3, SEC-M4) are independently verified RESOLVED against the current code, the live database and a self-run test suite of 2060 passing tests; the verdict is CONDITIONAL rather than a full PASS solely because of SEC-H1-R, a MEDIUM fail-closed residual on the previously-landed SEC-H1 fix whose trigger is the chairman apply ceremony this SD is heading toward.',
  executed_from_cwd: process.cwd(), source: 'security-agent-subagent'
}).select('id, verdict, confidence, phase, created_at').single();

if (error) { console.error('INSERT FAILED:', error.message); process.exit(1); }
console.log('EVIDENCE ROW:', JSON.stringify(data, null, 1));
console.log('metadata.repo_path =', results.metadata.repo_path, '| repo_resolved =', results.metadata.repo_resolved, '| probe_exists =', results.metadata.probe_exists);
