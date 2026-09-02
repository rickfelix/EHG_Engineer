import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEARN-FIX-LEARNING-IMPROVEMENT-005';

// TESTING sub-agent prospective LEAD review (evidence row 9704fb03) found the scope as
// first drafted was partially misstated and one item was unimplementable as written.
// Corrections applied here, verbatim from that review:
const { data: sd, error: fetchErr } = await sb
  .from('strategic_directives_v2')
  .select('description, scope, success_criteria, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) throw fetchErr;

const description = sd.description + `

## LEAD-phase prospective TESTING review corrections (evidence row 9704fb03-dd89-4f43-a8c5-f32dd2e2185f)

1. **BLOCKER, resolved by adding scope**: metadata.test_execution carries no artifact PATH today
   -- results-storage.js deliberately strips results.findings before persisting (only
   _findings_had_keys survives), so phase3.report_url never reaches the row. FR must add a new
   metadata.test_execution.artifact_path field (safe: testing-verdict-guard.js's
   REQUIRED_NUMERIC_FIELDS enumerates only the 4 counters, ignores extra keys; PR #7978's new
   trigger validates the same 4 keys only).
2. **Scope item 1 corrected**: Playwright artifacts are ALREADY written
   (phase3-execution.js:181-190, PLAYWRIGHT_JSON_OUTPUT_NAME) -- only hashing + threading is
   missing. A genuine sha IS already computed on the reuse path (phase3.artifact_sha at
   index.js:682/770/827) but buildMainlinePhase3TestExecution silently drops it and hardcodes
   runner:'playwright' even for vitest/API/0-count rows -- making runner honest (not just
   "unread") is a real deliverable, not a rename.
   vitest path (produces most measured rows via runTests('unit') + stdout-scraped counts,
   scripts/modules/complete-quick-fix/test-runner.js) has NO artifact file today -- needs a
   NEW opt-in vitest json reporter output, added carefully so it does not break
   scripts/modules/complete-quick-fix/index.js's existing stdout-scraping consumer.
3. **verifyArtifact() (artifact-verification.js) is Playwright-only** -- it rejects vitest
   report shapes by design. The new verifier must build on the shape-agnostic
   computeArtifactSha() only, not reuse verifyArtifact() wholesale.
4. **Shared-scope conflict**: PR #7978 (SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-012, open at
   review time) rewrites mandatory-testing-validation.js lines 297-332 -- the exact insertion
   point for this SD's gate-wiring step. EXEC must re-check PR #7978's merge status before
   editing that file; if still open, land everything else first (artifact writing/hashing/
   threading + the standalone verifier function) and sequence the gate edit after #7978 merges,
   or coordinate a rebase.
5. Gate integration must fail-soft (warn-only on missing/unreadable artifact; downgrade only on
   a genuine hash mismatch) -- mirrors the existing isReportHashMismatch non-blocking pattern.
6. Multi-repo phase3 results can carry an ARRAY of report_url (aggregateE2EResults) -- the FR
   must specify what a scalar artifact_path/artifact_sha means in that case (e.g. first repo
   only, or omit provenance for multi-repo aggregates) rather than silently picking one.`;

const scope = sd.scope + ' Also explicitly IN SCOPE (added post-review): a new metadata.test_execution.artifact_path field. Also explicitly OUT OF SCOPE (added post-review): reusing verifyArtifact() wholesale (Playwright-only, rejects vitest shapes) -- build on computeArtifactSha() only; editing mandatory-testing-validation.js before confirming PR #7978 has merged (shared-scope conflict at the exact same insertion point).';

const success_criteria = [
  ...sd.success_criteria,
  {
    criterion: 'metadata.test_execution.artifact_path is added and populated on the mainline execution path (both Playwright and, if the vitest reporter change lands, vitest)',
    measure: 'A real TESTING run\'s stored row carries a real, existing file path in artifact_path, and artifact_sha genuinely matches sha256 of that file\'s current contents',
  },
  {
    criterion: 'runner is no longer hardcoded to \'playwright\' for every mainline row -- it reflects the actual runner used (playwright, vitest, or reused/cached)',
    measure: 'A vitest-only run\'s stored row does not read runner:\'playwright\'',
  },
];

const newMetadata = {
  ...sd.metadata,
  lead_prospective_testing_review: {
    evidence_id: '9704fb03-dd89-4f43-a8c5-f32dd2e2185f',
    applied_at: new Date().toISOString(),
    pr_7978_dependency: 'gate-wiring step must re-check PR #7978 merge status before editing mandatory-testing-validation.js',
  },
};

const { error } = await sb
  .from('strategic_directives_v2')
  .update({ description, scope, success_criteria, metadata: newMetadata })
  .eq('sd_key', SD_KEY);
if (error) throw error;
console.log('Applied prospective-review corrections to', SD_KEY);
