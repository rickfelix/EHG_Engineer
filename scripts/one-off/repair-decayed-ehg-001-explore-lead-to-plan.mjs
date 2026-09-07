#!/usr/bin/env node
/**
 * SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 — Explore breadth pass at LEAD-TO-PLAN.
 *
 * Resolves the SD's own SEQUENCING note (Solomon da57d707, 19:22Z): whether
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001's testIgnore fix (specimen bf46dd4e, ehg
 * repo's playwright.config.ts, 4070-spec denominator) changes THIS SD's 294/532 failure
 * count and must be waited on before the triage clusters are frozen.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-REPAIR-DECAYED-EHG-001';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 90,
  phase: 'LEAD',
  execution_time_ms: 0,
  summary: 'Read EHG_Engineer\'s own playwright.config.js (root, this repo -- the config this SD\'s tests/e2e suite actually runs under, testDir: "./tests/e2e") in full. Its testIgnore array is [\'**/venture-creation/**\', \'**/*.test.js\', \'**/*.test.ts\'] -- there is NO \'/.worktrees/\' (or any absolute-cwd-path) pattern anywhere in it. The sibling SD SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001\'s specimen bf46dd4e (a testIgnore that matches an ABSOLUTE .worktrees/ cwd path, collecting 0 of 4070 tests) is scoped to a DIFFERENT config file entirely -- the EHG (frontend, ehg repo) playwright.config.ts, which the sibling SD\'s own scope text names explicitly. The 4070-spec figure in that sibling SD and this SD\'s ~3435-test/532-measured figures are two different suites in two different repos. CONCLUSION: the specific mechanism the SEQUENCING note worried about (a worktree-cwd testIgnore collision silently shrinking the denominator) does not exist in this SD\'s own config, so the 294/532 failure count is NOT invalidated by whether or when the sibling SD\'s fix lands. The sequencing dependency baked into this SD\'s own description is corrected: this SD does not need to wait on the sibling.',
  critical_issues: [],
  warnings: [
    {
      id: 'EXP-1',
      severity: 'LOW',
      issue: 'The 294/532 measurement is ~1 day old (RCA agent run a7ff036e, 2026-09-05) and was NOT re-run at LEAD time because a full run costs 20-35 minutes. Live drift since then (other SDs merging code that touches tests/e2e) means the exact per-spec failure list should be re-measured fresh at EXEC start, not assumed frozen from the LEAD-time description.',
      evidence: 'SD description: "MEASURED by Adam 2026-09-05 18:2xZ" and "not re-run by Adam because a full run is 20-35 minutes".',
      location: 'strategic_directives_v2.description (this SD)',
    },
    {
      id: 'EXP-2',
      severity: 'MEDIUM',
      issue: 'Scope item 4 (a scoped TESTING mode satisfying EXEC-TO-PLAN for non-UI changes) is explicitly gated on "a chairman ruling in flight by SMS" that had not landed as of the SD description\'s last edit. Building the mode itself is unconditional scope; whether the gate READS that ruling to accept scoped evidence is not this SD\'s call to make unilaterally.',
      evidence: 'SD scope: "Whether a scoped run SATISFIES the EXEC-TO-PLAN gate is a chairman ruling in flight; this SD builds the mode, the gate reads the ruling."',
      location: 'strategic_directives_v2.scope (this SD)',
    },
  ],
  recommendations: [
    'PLAN: scope the PRD around 4 independently-buildable increments so the 20-35min full-run cost and the failure-triage volume do not force one oversized PR: (1) the 4 cross-cutting fixes (fixture teardown, legacy_id, module-not-found, ENOENT) -- shared-root-cause repairs each closing multiple specs at once; (2) the e2e_timeout_ms CLI plumbing (--e2e-timeout-ms through execute-subagent.js into phase3-execution.js options) -- fully independent, zero test-suite dependency; (3) the quarantine list + CI-asserted count job; (4) the scoped TESTING mode (built regardless of the chairman ruling\'s outcome, per the SD\'s own text).',
    'PLAN: re-run the full e2e suite fresh at EXEC start (not relying on the 2026-09-05 snapshot) to get a current failure list before freezing which specs go in the quarantine list vs. which get fixed.',
    'PLAN: page.click timeouts (47 in the stale measurement) are explicitly "triaged per spec" per the SD\'s own scope text -- not promised as a blanket fix; budget for most of these landing in the quarantine list rather than individually repaired, unless a shared root cause emerges during triage.',
  ],
  detailed_analysis: {
    searched_identifiers: ['testIgnore', 'DEFAULT_E2E_TIMEOUT_MS', 'e2e_timeout_ms', '--full-e2e', 'legacy_id'],
    searched_paths: ['playwright.config.js', 'lib/sub-agents/testing/phases/phase3-execution.js', 'scripts/execute-subagent.js'],
    playwright_config_testignore: ['**/venture-creation/**', '**/*.test.js', '**/*.test.ts'],
    sibling_sd_scope_confirmed_different_repo: true,
    sequencing_dependency_resolved: 'not applicable to this SD -- the specific bug does not exist in this config',
  },
  metadata: {
    breadth_search: true,
    exhaustive: false,
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  probeExistsRelative: 'scripts/one-off/repair-decayed-ehg-001-explore-lead-to-plan.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('EXPLORE', sdRow.id, { code: 'EXPLORE', name: 'Explore' }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
