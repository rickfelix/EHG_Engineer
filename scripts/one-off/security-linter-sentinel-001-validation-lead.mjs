#!/usr/bin/env node
/**
 * SD-LEO-FIX-SECURITY-LINTER-SENTINEL-001 — VALIDATION at the LEAD phase (pre LEAD-TO-PLAN).
 *
 * Scope validation of the SD's corrected description/scope/success_criteria against
 * (a) the sentinel source read directly, (b) the four staged DDL files read directly,
 * (c) LIVE pg_catalog measurement via an independent query, and (d) the cross-repo
 * consumer source in the ehg repo.
 *
 * Verdict FAIL: the table-side scope is exact and well-evidenced, but the function-side
 * scope is mis-measured (claims 1 flagged function, live count is 2, and the remediation
 * targets a function that is already pinned), and 9 of the 12 tables receive duplicate
 * RLS-enable statements across two staged files — contradicting the SD's own
 * "covered exactly once" criterion.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD = 'SD-LEO-FIX-SECURITY-LINTER-SENTINEL-001';

const results = {
  verdict: 'FAIL',
  confidence: 96,
  execution_time_ms: 0,
  critical_issues: [
    {
      id: 'VAL-C1',
      severity: 'HIGH',
      issue:
        'SD claims function_search_path_mutable = 1 function. LIVE count is 2, and NEITHER is the function the staged remediation pins. The SD as scoped cannot turn the sentinel green.',
      evidence:
        "Live run of scripts/sentinels/audit-security-linter.mjs --json against the engineer instance: securityDefinerMutableFns = ['log_sd_mutation_audit','set_session_awaiting_approval'] (count 2). Independent pg_proc query confirms proconfig IS NULL for both. The function the SD's remediation targets, fn_advance_venture_stage, has proconfig = ['search_path=public'] — ALREADY PINNED — so it is NOT flagged, and database/migrations/20260616_security_hygiene_rls_searchpath.sql part (2) (ALTER FUNCTION public.fn_advance_venture_stage(...) SET search_path = pg_catalog, public) is a NO-OP against current prod that closes zero findings. That file's own self-verification DO $verify$ block only asserts a 'search_path=%' entry exists, which is already true today, so it would pass trivially without closing anything. Live strict sum: findings = 0 views + 12 rls + 1 sensitive + 2 fns = 15. Applying all four staged files closes 13, leaving findings = 2 and --strict still exiting 1.",
      location:
        'scripts/sentinels/audit-security-linter.mjs:123-128,193-194; database/migrations/20260616_security_hygiene_rls_searchpath.sql:68-69,93-101',
      recommendation:
        "Correct the SD's success_criteria to name the two actually-flagged functions. Remediation for both already exists staged and unapplied OUTSIDE the SD's declared 4-file set: database/migrations/20260831_pin_search_path_log_sd_mutation_audit.sql pins log_sd_mutation_audit. set_session_awaiting_approval has NO pin authored anywhere — it was introduced SECURITY DEFINER without SET search_path by database/migrations/20260901_session_awaiting_approval_rpc.sql:9-12 (applied), i.e. a fresh regression from 2026-09-01 that the sentinel is correctly detecting. Either add both to scope or explicitly descope the function axis and drop any success criterion asserting a green/clean sentinel.",
    },
    {
      id: 'VAL-C2',
      severity: 'MEDIUM',
      issue:
        "SD asserts every table is covered EXACTLY ONCE with no duplicate RLS-enable across files. FALSE for 9 of the 12 tables.",
      evidence:
        "Parsed all four files for ALTER TABLE ... ENABLE ROW LEVEL SECURITY (comment lines stripped). 12 distinct tables, matching the live rlsDisabled set name-for-name. But database/chairman-gated/20260825_enable_rls_chronic_red_guard_zero_consumer_tables.sql's 9 tables (claim_rejects, coverage_matrix, coverage_matrix_rotation_runs, door_routing_ledger, selection_postures, sourcing_chairman_queue, v_hc_flag_enabled, v_s22_flag_enabled, venture_preview_instances) are a STRICT SUBSET of 20260831_rls_lockdown_triage_three_failing_001.sql's 10 (same 9 + v_id). Each of those 9 therefore carries TWO separate RLS-enable statements across two independently chairman-gated, both-unapplied files. The 20260831 CORRECTION header (lines 36-56) removes north_star and scope_completion_chain and cites 20260825 as its authority, but never addresses that its remaining 10 tables subsume 20260825 entirely. 20260831 is a strict superset in effect (it adds the write-grant REVOKEs that 20260825 lacks).",
      location:
        'database/chairman-gated/20260825_enable_rls_chronic_red_guard_zero_consumer_tables.sql:135-143 vs 20260831_rls_lockdown_triage_three_failing_001.sql:73-82',
      recommendation:
        "Not a correctness bug at apply time — ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent. It is a ceremony/bookkeeping hazard: whichever file the chairman stamps second becomes a fully no-op migration that applies and changes nothing (dead-by-construction). Decide and record explicitly whether 20260825 is superseded by 20260831 (recommended: mark 20260825 superseded, since 20260831 covers its 9 plus v_id plus the REVOKEs), or narrow 20260831 to v_id only. Either way, retract the 'exactly once' claim from the SD text or make it true.",
    },
  ],
  warnings: [
    {
      id: 'VAL-W1',
      severity: 'LOW',
      issue:
        "20260616's header states it is TIER-2 'because it contains ALTER statements'. The classifier actually rates it TIER-2 for a different reason, making the gating basis more fragile than the prose implies.",
      evidence:
        "classifyMigration() run live: 20260616 => {tier:2, reason:'do_block_present'}; 20260902 => {tier:2, reason:'do_block_present'}; 20260831 => {tier:2, reason:'multiple_commands_in_statement'}; 20260825 => {tier:1, reason:'all_statements_provably_additive', matched:[9 enable_rls entries]}. So bare ALTER TABLE ... ENABLE ROW LEVEL SECURITY is classified TIER-1 (auto-apply eligible) — 20260825 is protected ONLY by living in database/chairman-gated/, not by its content. And 20260616 (which DOES live in the auto-apply-scanned database/migrations/) is TIER-2 only by virtue of its DO blocks; simplifying away its self-verification would silently drop it to TIER-1 and make it auto-appliable.",
      location: 'scripts/lib/migration-tier-classifier.mjs; database/migrations/20260616_security_hygiene_rls_searchpath.sql:7-13',
      recommendation:
        'Correct the 20260616 header to state the real tier-2 basis (DO block present), and note that its DO blocks are load-bearing for gating, not just for verification. Non-blocking for this SD.',
    },
    {
      id: 'VAL-W2',
      severity: 'LOW',
      issue:
        'An unrelated in-tree migration carries a bogus @approved-by stamp. Not in this SD scope, but adjacent to it and worth routing.',
      evidence:
        "database/migrations/20260831_pin_search_path_log_sd_mutation_audit.sql:1 reads '-- @approved-by: rickfelix@example.com'. That value MATCHES the APPROVED_BY_RE extraction regex in scripts/lib/migration-guards.js:30 (it is a syntactically valid email with no angle brackets), so extractApprovedBy() returns it rather than null. It is still blocked, because checkApproverFactor() (line 52) additionally requires case-insensitive equality with git user.email, which is rickfelix2000@gmail.com — so the approver factor fails with a mismatch rather than a missing-header reason. Defence holds, but a placeholder that satisfies the extractor is a weaker posture than the '<pending ...>' form the other files use, which fails extraction outright.",
      location: 'database/migrations/20260831_pin_search_path_log_sd_mutation_audit.sql:1; scripts/lib/migration-guards.js:30,44-56',
      recommendation:
        'Blank the value to a bare "-- @approved-by:" or the "<pending ...>" form used by the sibling files. This file is the remediation for one of the two functions in VAL-C1, so it is likely to be pulled into scope anyway.',
    },
    {
      id: 'VAL-W3',
      severity: 'LOW',
      issue: 'SQL soundness was verified structurally, not by a real parser — no psql or SQL parser is available in this environment.',
      evidence:
        'Checked: dollar-quote tag balance (20260902 and 20260616 each have $$ x2 and $verify$ x2, balanced; 20260825 and 20260831 have none), zero unbalanced BEGIN;/COMMIT; pairs in all four, all four terminate on a semicolon, and every statement shape is a recognized DDL form. No `psql` binary and no pgsql-parser/libpg-query in node_modules, so a true parse was not possible.',
      location: 'all four DDL files',
      recommendation: 'Treat syntactic soundness as high-confidence-structural rather than parser-proven. The chairman ceremony applies these in a transaction with self-verifying DO blocks, which is the real backstop.',
    },
  ],
  recommendations: [
    'CLAIM 1 (sentinel semantics) — PASS on definitions. sensitive_columns_exposed IS the session_id subset of rls_disabled_in_public: both queries share the identical predicate (n.nspname=public AND relkind IN (r,p) AND relrowsecurity=false), the sensitive one merely adds a join to pg_attribute on attname=session_id (lines 105-118), and both are filtered through the same isExemptTable(). Header line 9 states this explicitly. Confirmed live: sensitiveExposed=[claim_rejects], which is a member of the 12-table rlsDisabled set.',
    'CLAIM 1 (strict-fail composition) — PASS. The strict sum at lines 193-194 is exactly securityDefinerViews + rlsDisabled + sensitiveExposed + securityDefinerMutableFns. definerRlsBypassExposed (check 5) and pgNetExposure (check 6) are both excluded, with the rationale documented inline at lines 185-192 and 143-148. clean = findings===0 && triggerEnabled, so the event-trigger liveness is a fifth strict condition the SD does not mention; it is currently true, so it does not affect this SD.',
    'CLAIM 1 (counts) — table axis PASS, function axis FAIL. Live: 12 rls_disabled, 1 sensitive, 0 definer views, trigger enabled — all as claimed. function_search_path_mutable is 2, not 1. See VAL-C1.',
    'CLAIM 2 (files exist, unstamped, not worker-appliable) — PASS. All four files exist and are readable. All four are UNSTAMPED against the real guard: running APPROVED_BY_RE from scripts/lib/migration-guards.js:30 over each returns null (20260825 deliberately has no @approved-by line at all; 20260831 and 20260902 use "<pending -- apply via the chairman 3-factor ceremony>", which the regex rejects because it excludes <>/" and has no @; 20260616 has an empty value). None is worker-appliable: 20260825/20260831/20260902 sit in database/chairman-gated/ which the auto-apply scanner does not scan, and 20260616 lives in the scanned database/migrations/ but classifies TIER-2 so it does not auto-apply, and its empty @approved-by blocks scripts/apply-migration.js regardless.',
    'CLAIM 2 (the 20260831 correction) — PASS, and it is high quality. The correction is present at lines 36-56 with a genuine causal explanation: north_star and scope_completion_chain were removed because a bare no-policy RLS-enable would have silently broken live anon/authenticated consumers, which the file\'s original repo-wide grep missed. north_star and scope_completion_chain are confirmed ABSENT from the ALTER/REVOKE bodies; v_id is present; the remaining set is exactly 10 tables with matching REVOKEs.',
    'CLAIM 2 (12 tables + 1 function covered) — table coverage is EXACT. The union of RLS-enable statements across the four files is exactly the 12 table names the live sentinel reports, with no extras and no omissions: 20260831 covers 10, 20260902 covers north_star, 20260616 covers scope_completion_chain. The "exactly once" sub-claim fails (VAL-C2) and the function coverage is misdirected (VAL-C1).',
    'CLAIM 3 (no exemption changes) — PASS. scripts/sentinels/exempted-tables.json has no diff against HEAD and does not appear in git status. Its last touching commit is 944a3e8567f from the earlier CHRONIC-RED-GUARD SD. The SD correctly avoided the exemption route.',
    'HIGH-VALUE POSITIVE FINDING — the north_star policy is verified correct against the live consumer, which is the single most dangerous statement in the whole change set. database/chairman-gated/20260902_...sql:63-67 creates FOR SELECT TO anon, authenticated USING (status = \'chairman_ratified\'). Read independently in the ehg repo, src/hooks/useNorthStar.ts:45-49 issues .from("north_star").select(...).eq("status","chairman_ratified").order("updated_at").limit(1) via the anon key, and src/components/eva-chat/intents/northStarIntent.ts:41 consumes that same hook. The policy predicate matches the consumer filter EXACTLY, the role list covers the anon key, and RLS does not restrict the ordering column. This closes the finding without breaking the consumer.',
    'scope_completion_chain read path also verified safe: 20260616 adds FOR SELECT USING (true) with no TO clause (defaults TO PUBLIC), and 20260902 revokes only INSERT/UPDATE/DELETE/TRUNCATE, preserving SELECT. The security_invoker=on view public.writer_consumer_asymmetry_witnesses therefore keeps working for anon/authenticated callers.',
    'INDEPENDENT ASSESSMENT (claim 4) — RLS-enable is materially and unambiguously the better remediation than the original Option-A exemption, and I reach that conclusion on reasoning independent of the SD framing. Three grounds. (1) The exemption route is FALSE by its own criterion: exempted-tables.json is for tables that are intentionally not RLS-governed (system tables, disposable quarantine/backup copies). These 12 are live governance and venture tables. Writing them into the exemption manifest would encode a claim that is simply untrue and would permanently blind the detector to them — the sentinel would go green while the exposure remained, which is strictly worse than an honest red. (2) The exposure is real and currently live, not theoretical: the 20260902 header records, and my own live check corroborates, relrowsecurity=false with full anon+authenticated grants including INSERT/UPDATE/DELETE on north_star and scope_completion_chain, and the 20260831 header documents the same for venture_preview_instances. That is an unauthenticated read/write/delete surface reachable through PostgREST today. An exemption closes the alert; RLS closes the hole. (3) The differentiated shape is what makes it safe rather than reckless: bare enable+revoke is only applied to tables whose consumers were verified service-role-only (service_role bypasses RLS unconditionally, so those consumers are provably unaffected), while the two tables with real anon-key consumers each get a policy verified against the consumer\'s actual query. The originally-proposed blanket treatment of all 12 WOULD have broken north_star and scope_completion_chain — the correction in this SD is the substantive safety improvement, not incidental cleanup. One caveat on my own endorsement: the safety argument rests on consumer censuses I verified for north_star and scope_completion_chain but took on documentation for the other 10, so PLAN should re-run the zero-consumer census for those 10 rather than inherit it.',
    'RECOMMENDED DISPOSITION — do not pass LEAD-TO-PLAN on the current text. The remediation DESIGN is sound and should proceed; the SD SCOPE STATEMENT is wrong in two measurable ways. Fix before handoff: (a) correct the function-axis claim from 1 to 2 and name log_sd_mutation_audit and set_session_awaiting_approval, pulling in 20260831_pin_search_path_log_sd_mutation_audit.sql and authoring a pin for set_session_awaiting_approval; (b) resolve the 20260825/20260831 duplication and retract or repair the "exactly once" claim; (c) restate any "sentinel goes clean" success criterion so it is achievable by the files actually in scope.',
  ],
  metadata: {
    phase_context: 'LEAD scope validation prior to LEAD-TO-PLAN handoff',
    live_measurement: {
      instrument: 'scripts/sentinels/audit-security-linter.mjs --json, run live against the engineer instance',
      findings_strict_sum: 15,
      securityDefinerViews: 0,
      rlsDisabled: 12,
      sensitiveExposed: ['claim_rejects'],
      securityDefinerMutableFns: ['log_sd_mutation_audit', 'set_session_awaiting_approval'],
      triggerEnabled: true,
      projected_findings_after_all_four_files_applied: 2,
    },
    coverage_matrix: {
      distinct_tables_with_rls_enable: 12,
      matches_live_rls_disabled_set_exactly: true,
      tables_with_duplicate_rls_enable: 9,
      duplicate_pair: '20260825 (9 tables) is a strict subset of 20260831 (10 tables)',
      function_covered_by_files: 'fn_advance_venture_stage (already pinned live — no-op)',
      functions_actually_flagged: ['log_sd_mutation_audit', 'set_session_awaiting_approval'],
    },
    approved_by_state: {
      '20260825_enable_rls_chronic_red_guard_zero_consumer_tables.sql': 'no @approved-by line at all — unstamped',
      '20260831_rls_lockdown_triage_three_failing_001.sql': '<pending ...> placeholder — regex rejects — unstamped',
      '20260902_security_linter_sentinel_north_star_and_chain.sql': '<pending ...> placeholder — regex rejects — unstamped',
      '20260616_security_hygiene_rls_searchpath.sql': 'empty value — unstamped',
    },
    tier_classification: {
      '20260616': 'tier 2 (do_block_present)',
      '20260902': 'tier 2 (do_block_present)',
      '20260831': 'tier 2 (multiple_commands_in_statement)',
      '20260825': 'tier 1 (all_statements_provably_additive) — protected only by chairman-gated/ directory',
    },
    exempted_tables_json_unchanged: true,
    independent_instruments_used: [
      'direct read of scripts/sentinels/audit-security-linter.mjs (not the SD summary of it)',
      'LIVE execution of the sentinel in --json mode against pg_catalog',
      'INDEPENDENT live pg_proc query for proconfig/prosecdef on the three named functions (separate instrument from the sentinel itself)',
      'programmatic parse of ALTER TABLE ... ENABLE ROW LEVEL SECURITY across all four files with comment lines stripped, to compute the coverage/duplication matrix rather than trusting file headers',
      'live execution of classifyMigration() from scripts/lib/migration-tier-classifier.mjs against all four files',
      'live execution of APPROVED_BY_RE from scripts/lib/migration-guards.js against all four files',
      'cross-repo read of ehg/src/hooks/useNorthStar.ts and northStarIntent.ts to verify the policy predicate against the real consumer filter',
      'git diff/status on scripts/sentinels/exempted-tables.json',
    ],
    caveats: [
      'SQL syntax verified structurally (dollar-quote balance, statement termination, BEGIN/COMMIT balance); no psql or SQL parser available for a true parse.',
      'Zero-consumer census for the 10 blanket-treated tables was taken on documentation, not re-run. Recommended for PLAN.',
    ],
  },
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD,
    { name: 'Principal Systems Analyst', code: 'VALIDATION' },
    results,
    { phase: 'LEAD', sdKey: SD },
  );
  console.log('STORED ID:', stored?.id, '| verdict:', stored?.verdict, '| phase:', stored?.phase, '| confidence:', stored?.confidence);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
