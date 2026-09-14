#!/usr/bin/env node
/**
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158 — TESTING + SECURITY evidence at EXEC-TO-PLAN.
 *
 * TESTING: an independent EXEC-phase sub-agent verified the merged fix (PR #8967) against
 * live source and the live DB, ran the full touched-area suite itself, and mutation-tested 3
 * mutations (all intended-kill) plus found 2 surviving mutants covering FR-2's production call
 * sites (createPattern's created_at, and the two occurred_at call sites in
 * scripts/auto-extract-patterns-from-retro.js). Those 2 gaps were closed in a follow-up commit
 * (PR #8970) with new tests, independently mutation-tested by me: both now fail exactly as
 * expected on the targeted mutation, restored, full suite green (282/282).
 *
 * SECURITY: an independent EXEC-phase sub-agent reviewed the merged diff for injection risk in
 * the new occurred_at handling, prototype-pollution risk in metadata.sites[] iteration,
 * authorization/exposure risk in the widened SD-status batch query, provenance-integrity risk
 * in createPattern's created_at override, and regressions in existing severity-bypass/closed-
 * source logic. PASS, with 2 LOW informational findings, both pre-existing and out of this
 * diff's scope (not introduced or worsened by it): an over-permissive `authenticated`-role RLS
 * policy on issue_patterns, and a pre-existing raw-string .or() filter interpolation at
 * scripts/auto-extract-patterns-from-retro.js:417 (untouched by this diff).
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const testingResults = {
    verdict: 'PASS',
    confidence: 92,
    phase: 'EXEC',
    execution_time_ms: 0,
    summary: "Independent EXEC-phase verification of the merged fix (PR #8967, commit c7cfb4ce481). Confirmed all 4 production-file changes genuinely match their description by reading the shipped source directly (not trusted from the commit message). Ran the full touched-area suite independently: 277/277 (27 files) on the original PR. Mutation-tested 3 changes directly: (B) filter.mjs statuses.every->.some flips exactly 1 test red (the OPEN-SD-among-3 test); (C) class-escalation.js's NaN-fallback guard removed flips exactly 2 tests red (the invalid-Date test in class-escalation.test.js AND the malformed-occurred_at test in issue-knowledge-base-occurred-at.test.js, proving the occurred_at chain is genuinely wired across the module boundary, not a mock echo); (D) fetchPatternSourceSDStatuses's sites-collection loop disabled flips exactly 1 test red (the MUTATION GUARD test asserting the real .in() argument list). All 3 restored cleanly (git status clean after each). Found 2 SURVIVING mutants initially: (A) deleting createPattern's conditional created_at spread left 277/277 green -- zero test coverage existed for that half of FR-2; (E) deleting occurred_at from either of the two production call sites in scripts/auto-extract-patterns-from-retro.js also left 277/277 green -- the library-layer tests proved recordOccurrence/createPattern honor occurred_at when called directly, but nothing proved the PRODUCTION call sites actually pass it. Independently confirmed the PRIMARY fix's real-world yield against the live DB (not just synthetic fixtures): sampled 500 patterns carrying metadata.sites[], found 830/830 distinct site sd_ids resolve cleanly against strategic_directives_v2.id (0 unresolvable -- ruling out the classic 'looks wired but the id shapes never match' failure mode), 203/500 patterns have >1 distinct site sd_id (the population the old single-SD-only predicate could never reach), and 190 of those are now correctly all-closed-suppressible by the fix. Both surviving mutants (A, E) were closed in a follow-up commit (PR #8970): added direct createPattern created_at coverage (3 new tests in issue-knowledge-base-occurred-at.test.js) and a production call-site wiring assertion (2 new tests in batch-resilience.test.js asserting extractPatternsFromImprovements's two call sites receive occurred_at===retro.created_at). Independently re-ran both closing mutations myself: reverting createPattern's created_at spread now fails exactly 'a brand-new pattern gets created_at set to the supplied occurred_at' (was previously vacuous); reverting the recordOccurrence call site's occurred_at now fails exactly 'recordOccurrence branch: occurred_at === retro.created_at' (was previously vacuous). Both restored, full suite green: 282/282 across 27 files.",
    critical_issues: [],
    warnings: [],
    recommendations: [
      'Consider the same createPattern/call-site wiring test pattern for any future additive parameter threaded through this same recordOccurrence/createPattern/extractPatternsFromImprovements chain, to avoid the same class of library-tested-but-production-untested gap recurring.',
    ],
    detailed_analysis: {
      commands_run: [
        'npx vitest run tests/learn/ tests/unit/learning/ tests/unit/rca-skip-governance.test.js tests/unit/rca-trigger-quick-wire.test.js tests/unit/rca-orchestrator-noise.test.js -> 277/277 (PR #8967), then 282/282 after PR #8970',
        'Mutation B: filter.mjs statuses.every -> .some -> exactly 1 test fails, restored',
        'Mutation C: class-escalation.js NaN-fallback guard removed -> exactly 2 tests fail (cross-module), restored',
        'Mutation D: fetchPatternSourceSDStatuses sites-collection disabled -> exactly 1 test fails, restored',
        'Mutation A (surviving, then closed): createPattern created_at spread removed -> was 0 fail (277/277), now exactly 1 fail after PR #8970, restored',
        'Mutation E (surviving, then closed): recordOccurrence call site occurred_at removed -> was 0 fail, now exactly 1 fail after PR #8970, restored',
        'Live DB sample: 500 issue_patterns rows with metadata.sites[], resolved 830/830 site sd_ids against strategic_directives_v2, measured 203/500 multi-SD patterns, 190 newly-suppressible',
      ],
    },
    metadata: {
      independent_verification: true,
      test_execution: buildTestExecution({
        executed: 282,
        passed: 282,
        failed: 0,
        skipped: 0,
        runner: 'vitest',
        source: 'fresh',
      }),
    },
  };

  const securityResults = {
    verdict: 'PASS',
    confidence: 90,
    phase: 'EXEC',
    execution_time_ms: 0,
    summary: "Reviewed the merged diff (PR #8967, commit c7cfb4ce481; PR #8970 test-only) for 5 specific risk classes against the actual traced call graph, not hypothetically. (1) occurred_at injection: used only as input to `new Date(occurred_at)` then `.toISOString()`, never raw SQL or a dynamic property lookup; all writes go through the parameterized Supabase query builder; both NaN-fallback guards (issue-knowledge-base.js createPattern, class-escalation.js mergeSite) prevent an Invalid Date from ever being written; full trust-chain trace confirms occurred_at's only 2 live callers both pass retro.created_at, a service-role-generated DB column, not user-submitted input -- no issue. (2) metadata.sites[] prototype pollution: reads a fixed literal property (s.sd_id) never a dynamic key, consumed only by Map/Set operations (confirmed via direct probe that Map.get('__proto__')/Set.add('constructor') behave as plain data ops, immune to the classic obj[key]=... pollution vector); mergeSite builds new objects via hardcoded property names only, never Object.assign(target, site); SITES_CAP=50 plus fetchPatternSourceSDStatuses's existing 100-row .in() batching bound any DoS surface -- no issue. (3) widened SD-status batch query: selects only id,status (no new columns/tables), runs exclusively server-side via the service-role client in the retro-extraction cron and 2 other confirmed-server-side callers, querying IDs sourced from data this same pipeline already wrote -- not a widened trust boundary; flagged one PRE-EXISTING LOW item (an over-permissive authenticated-role RLS policy on issue_patterns, database/migrations/create-issue-patterns-table.sql) that this diff does not introduce or worsen. (4) createPattern's occurred_at overwriting created_at: reachability-confirmed to exactly 2 live callers, both retro.created_at (service-role-generated, not externally reachable); grepped every consumer of issue_patterns.created_at (filter.mjs, recordOccurrence, getPattern, search, calculateRecencyScore) and confirmed none of them use created_at for any suppression/escalation/scoring/trust decision -- provenance/display-only today, so backdating it has no exploitable downstream effect given the actual codebase. (5) regressions: severity bypass position/logic unchanged and still evaluated before the closed-source check; closed-source predicate falls back byte-identically to the original single-SD behavior when metadata.sites[] has no resolvable ids, and the new N-SD path fails toward NOT suppressing (statuses.some(undefined) aborts) rather than risking a false suppress; both live callers of fetchPatternSourceSDStatuses confirmed to run before filterPatternsForLearning against the same pattern list, so no stale/missing-ID risk; no RLS or trigger change made by this diff. Found 2 LOW informational items, both pre-existing and confirmed via git show --stat to be OUTSIDE this diff's changeset: the RLS breadth noted above, and a pre-existing raw-string .or() filter interpolation at scripts/auto-extract-patterns-from-retro.js:417 (unrelated function, not touched by this SD). Neither blocks this PR; both worth separate tracking if not already known.",
    critical_issues: [],
    warnings: [
      {
        id: 'SEC-1',
        severity: 'LOW',
        issue: "issue_patterns carries an over-permissive `authenticated`-role RLS policy (USING (true) WITH CHECK (true)) that predates this SD and is not introduced or worsened by it -- any authenticated user could already forge metadata.sites[].sd_id (and every other column) directly. This diff's new batch-query surface only looks up id,status for already-forgeable-source ids. Worth a separate ticket if not already tracked; out of scope for this SD.",
        evidence: 'database/migrations/create-issue-patterns-table.sql:141-146',
      },
      {
        id: 'SEC-2',
        severity: 'LOW',
        issue: 'A pre-existing raw-string .or() filter interpolation exists in the same file this SD touches (scripts/auto-extract-patterns-from-retro.js:417), but confirmed via git show --stat NOT part of this SD\'s changeset -- unrelated function, untouched. Flagged for awareness only.',
        evidence: 'scripts/auto-extract-patterns-from-retro.js:417 (pre-existing, not modified by commit c7cfb4ce481)',
      },
    ],
    recommendations: [
      'Track SEC-1 (issue_patterns RLS breadth) and SEC-2 (pre-existing .or() interpolation) as separate, out-of-scope follow-ups if not already logged.',
    ],
    detailed_analysis: {
      commands_run: [
        'git show c7cfb4ce481, git show ff4f1ff2e1d -- full diff review of both commits',
        'Traced occurred_at from both production call sites through to its only 2 consumers (createPattern, recordOccurrence) and confirmed no raw-SQL/dynamic-property path',
        'node -e probe confirming Map.get/Set.add immunity to __proto__/constructor string keys',
        'Grepped every consumer of issue_patterns.created_at for a trust/scoring dependency -> none found',
        'git show --stat confirmed SEC-2\'s cited line is outside this SD\'s changeset',
        'Read database/migrations/create-issue-patterns-table.sql and fix-issue-patterns-service-role-rls.sql for the applicable RLS policy',
      ],
    },
    metadata: { independent_verification: true },
  };

  for (const [code, name, results] of [['TESTING', 'Testing', testingResults], ['SECURITY', 'Security', securityResults]]) {
    const resolution = await resolveSubAgentRepo({
      sdId: sdRow.id,
      targetApplication: 'EHG_Engineer',
      subAgentCode: code,
      probeExistsRelative: 'scripts/one-off/learn-158-exec-to-plan-evidence.mjs',
      supabase,
    });
    applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
    const stored = await storeSubAgentResults(code, sdRow.id, { code, name }, results, { sdKey: SD_KEY, phase: 'EXEC' });
    console.log('STORED:', code, JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
