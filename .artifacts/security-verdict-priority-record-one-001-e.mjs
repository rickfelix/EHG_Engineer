#!/usr/bin/env node
/**
 * SECURITY sub-agent evidence writer — SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E (Child E),
 * EXEC_TO_PLAN gate.
 *
 * Independent security review of the committed diff (origin/main...HEAD, 10 files, 550
 * insertions / 4 deletions): lib/fleet/claim-stamp.cjs (pick_reason scoring), the new
 * lib/fleet/qf-metadata-merge.mjs raw-pg CAS-guarded merge, its two call sites
 * (lib/sd-creation/source-adapters/qf.js, scripts/qf-start.js), the chairman-gated migration
 * pair, and a non-interference test against lib/fleet/qf-gated-hold.cjs.
 */
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E';

const FINDINGS = [
  'PASS — SQL injection: the new raw-pg write path (lib/fleet/qf-metadata-merge.mjs '
    + 'mergeQfMetadataKeys) uses exclusively parameterized placeholders ($1/$2/$3) with the '
    + 'jsonb payload passed as JSON.stringify([entry]) bound to $3::jsonb — no string '
    + 'concatenation or interpolation into SQL text anywhere in the query. The companion '
    + 'migration files (database/chairman-gated/20260906_add_quick_fixes_metadata_column[.]/'
    + '_DOWN.sql) are static DDL (ALTER TABLE ADD COLUMN IF NOT EXISTS + COMMENT ON COLUMN) '
    + 'with zero dynamic construction.',
  'PASS — RLS-bypass consistency: the new raw-pg path mirrors an already-shipped, already-'
    + 'reviewed sibling, lib/coordinator/safe-metadata-merge.mjs (QF-20260720-597), which '
    + 'performs the identical pattern (createDatabaseClient(\'engineer\', {verify:false}) + a '
    + 'parameterized jsonb `||`/jsonb_set UPDATE) against strategic_directives_v2 today. Both '
    + 'route through the same scripts/lib/supabase-connection.js connection profile — this PR '
    + 'introduces no new credential surface or new DB role, only a second table target for an '
    + 'existing, accepted architecture (atomic server-side JSONB merge cannot be expressed via '
    + 'supabase-js/.update(), hence the raw-pg seam).',
  'PASS — CAS guard adequacy: mergeQfMetadataKeys\'s UPDATE is gated by '
    + '`WHERE id = $1 AND claiming_session_id = $2`. sessionId is validated non-empty '
    + '(`if (!qfId || !sessionId || !entry ...) return {merged:false, reason:\'error\'}`), so a '
    + 'null/undefined session can never widen the predicate to `= NULL` (which SQL evaluates as '
    + 'unknown/false, not "match unclaimed"). Both call sites (qf-start.js:151-153, '
    + 'source-adapters/qf.js:268-270) pass the SAME sessionId that just won the claim_sd RPC, so '
    + 'a claim that has since moved to a different session yields rowCount=0 -> '
    + '{merged:false, reason:\'cas_lost\'} -> stampClaim returns null. No overwrite path exists: '
    + 'the provenance write either lands atomically for the current claim holder or silently '
    + 'no-ops, never clobbers another session\'s data.',
  'PASS — privilege-check bypass: both new call sites invoke stampClaim strictly AFTER their '
    + 'claim_sd RPC has already returned success (qf-start.js checks `data?.success` at line 140 '
    + 'before the stampClaim call at line 152; source-adapters/qf.js checks '
    + '`claimRes.success !== false` before the stampClaim call at line 268). claim_sd remains the '
    + 'sole authorization gate; stampClaim only records provenance afterward and is wrapped in a '
    + 'swallow-all try/catch at every call site ("fail-soft: a provenance-stamp hiccup must never '
    + 'break the claim itself") — a stamping failure can never retroactively grant or revoke a '
    + 'claim.',
  'PASS — no user-controlled free text reaches storage unvalidated: buildPickReason() in '
    + 'claim-stamp.cjs guards every numeric field with Number.isFinite (coercing NaN/Infinity to '
    + 'the sentinel string \'UNSCORED\', verified by TS-2/TS-11 unit tests), and coerces '
    + 'comparatorVersion to null unless it is already a string. The scoring function itself '
    + '(lib/priority/comparator.cjs) does not exist in this repo yet — confirmed via `ls '
    + 'lib/priority/` (ENOENT) — so resolveScoreFn\'s dynamic import genuinely exercises its '
    + 'catch-and-return-null fallback in production today; the whole pick_reason path degrades to '
    + 'UNSCORED_PICK_REASON until Child B merges. Regardless of source, the value only ever '
    + 'reaches the DB via the same parameterized JSON.stringify path above, so even a malicious '
    + 'comparatorVersion string could not achieve injection.',
  'PASS — non-interference claim verified against source, not just the new test: read '
    + 'lib/fleet/qf-gated-hold.cjs directly (unchanged — `git diff` for this file is empty) and '
    + 'confirmed isChairmanGatedQF() reads ONLY qf.owner and qf.release_condition; it never '
    + 'touches qf.metadata at all, so the new pick_reason field is structurally incapable of '
    + 'affecting the chairman-gated-hold verdict. The new proof-of-non-interference test '
    + '(tests/unit/fleet/qf-gated-hold.test.js, AC-9/AC-10/AC-11) exercises this with the 3 live '
    + 'chairman-gated fixture shapes plus a non-gated case, both with and without the provenance '
    + 'field, and asserts byte-identical verdicts.',
  'PASS — new/affected unit suites all pass: ran `npx vitest run '
    + 'tests/unit/fleet/claim-stamp-pick-reason.test.js tests/unit/fleet/qf-metadata-merge.test.js '
    + 'tests/unit/fleet/qf-gated-hold.test.js` — 3 files, 30 tests, all green.',
  'NOTE (non-blocking, out of scope by design) — the chairman-gated migration is deliberately '
    + 'staged unapplied outside the auto-scanned migration directories (database/chairman-gated/, '
    + 'per that directory\'s own README on the TIER-2 default-deny gate being bypassable via '
    + 'LEO_MIGRATION_TIER_GATE_BYPASS). Every write-side caller (mergeQfMetadataKeys) already '
    + 'degrades fail-soft on Postgres 42703 whether or not/whenever this migration is eventually '
    + 'applied by the chairman ceremony, so this does not block a security PASS for the code '
    + 'shipped in this diff.',
];

const SUMMARY = 'SECURITY EXEC_TO_PLAN verdict: PASS. Reviewed the full committed diff '
  + '(origin/main...HEAD, 10 files / 550 insertions) against the concerns raised: the new raw-pg '
  + 'write path (qf-metadata-merge.mjs) uses fully parameterized queries with no injection '
  + 'surface; it mirrors an already-accepted sibling pattern (safe-metadata-merge.mjs) for the '
  + 'RLS-bypass/raw-pg architecture, introducing no new credential or connection-profile surface; '
  + 'its CAS guard (id + claiming_session_id) is sufficient to prevent cross-session provenance '
  + 'clobbering, verified both by reading the WHERE predicate and by the two call sites\' pre-'
  + 'validated sessionId; both new call sites invoke the provenance stamp only after their '
  + 'claim_sd RPC already succeeded, wrapped fail-soft, so no privilege-check bypass is possible; '
  + 'the chairman-gated migration is static, additive DDL with no dynamic construction; and the '
  + 'claimed non-interference with qf-gated-hold.cjs is confirmed true by reading that unchanged '
  + 'source (it never reads metadata at all), not merely asserted by the new test. All 30 new/'
  + 'affected unit tests pass. No findings requiring remediation.';

async function main() {
  const supabase = await getSupabaseClient();

  const results = {
    verdict: 'PASS',
    confidence: 90,
    summary: SUMMARY,
    findings: FINDINGS,
    recommendations: [],
    validation_mode: 'retrospective',
    metadata: {
      recorded_by: '.artifacts/security-verdict-priority-record-one-001-e.mjs',
      assessment_type: 'exec_to_plan_security_review',
      pr_url: 'https://github.com/rickfelix/EHG_Engineer/pull/8344',
      commit_sha: '5252b1a2e00',
      diff_range: 'origin/main...HEAD',
      files_reviewed_diff: [
        'lib/fleet/claim-stamp.cjs',
        'lib/fleet/qf-metadata-merge.mjs',
        'lib/sd-creation/source-adapters/qf.js',
        'scripts/qf-start.js',
        'database/chairman-gated/20260906_add_quick_fixes_metadata_column.sql',
        'database/chairman-gated/20260906_add_quick_fixes_metadata_column_DOWN.sql',
        'database/chairman-gated/README.md',
        'tests/unit/fleet/claim-stamp-pick-reason.test.js',
        'tests/unit/fleet/qf-metadata-merge.test.js',
        'tests/unit/fleet/qf-gated-hold.test.js',
      ],
      checks_performed: {
        sql_injection: 'PASS',
        rls_bypass_pattern_consistency: 'PASS',
        cas_guard_adequacy: 'PASS',
        privilege_check_bypass: 'PASS',
        user_controlled_input_safety: 'PASS',
        non_interference_claim_verified_against_source: 'PASS',
        unit_tests_run: '30/30 passed',
      },
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults('SECURITY', SD_KEY, null, results, {
    phase: 'EXEC_TO_PLAN',
  });

  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,validation_mode,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }

  console.log('Stored SECURITY verdict row:', JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
}
