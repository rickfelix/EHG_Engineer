import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEARN-FIX-LEARNING-IMPROVEMENT-005';

const { data: sd, error: fetchErr } = await sb
  .from('strategic_directives_v2')
  .select('description, scope, success_criteria, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) throw fetchErr;

const description = sd.description + `

## LEAD-phase VALIDATION review corrections (evidence row 680890f5-cfd9-4d0d-aaa8-1c9d8c2a8f6b)

1. **runner is ALREADY correctly populated** on both mainline branches (index.js:397-403
   playwright, :529-535 vitest) -- the earlier prospective review overstated this as a gap.
   The real, sole gap is artifact_sha + a new artifact_path: 0 of 3,055 live TESTING rows
   carry an artifact_path key at all; only 1 (hand-authored, not code-produced) carries
   artifact_sha.
2. **Reuse existing primitives, do not reinvent**: lib/sub-agents/testing/
   artifact-verification.js already exports computeArtifactSha(), readArtifactWithSha()
   (TOCTOU-safe by construction), and isReportHashMismatch() (already fail-soft: returns
   false when either side is absent -- exactly the semantics this SD needs). Import and wire
   these; do not author new hashing/comparison logic.
3. **Fresh-vs-cached honesty hazard, must be resolved**: index.js:176-184 feeds
   buildMainlinePhase3TestExecution() from EITHER a fresh executeE2ETests() run OR
   buildPhase3FromEvidence(freshEvidence) (the cached-reuse branch). Stamping artifact_sha
   without distinguishing these would attribute a REUSED artifact's hash to what looks like a
   fresh run -- recreating exactly the evidence-without-provenance defect this SD exists to
   fix. The FR must thread which branch produced phase3 through to the stamped metadata (e.g.
   an explicit source: 'fresh'|'reused' alongside artifact_path/artifact_sha).
4. **Vitest provenance is NOT establishable yet** -- runTests('unit', ...)
   (complete-quick-fix/test-runner.js) shows no evidence of a JSON-reporter artifact ever
   written to disk today. Do NOT commit vitest-path provenance to this SD's scope; PLAN must
   first confirm whether a vitest artifact file can be established at reasonable cost, and if
   not, descope vitest provenance to a documented follow-up (do not silently drop it).
   Playwright-path provenance alone is still real, observable value for feature/bugfix/
   E2E-requiring SDs (the branch that actually executes for that population), even though it
   will not show up on infrastructure-type SDs whose TESTING runs stay on the vitest branch.
5. **Gate edit sequencing, reconfirmed with exact target**: PR #7978 (still open at this
   review) inserts a new measured===null advisory block into mandatory-testing-validation.js
   between current main:332 and :334 (immediately before "// 10. TESTING validation passed")
   -- exactly where a hash-verification check would naturally land. Land this SD's gate edit
   only after #7978 merges, and key the new check off resolveMeasuredState()'s (the function
   #7978 introduces) truthy branch as an ADDITIONAL step, not a re-edit of #7978's own
   297-332 change.`;

const scope = sd.scope + ' CORRECTED per VALIDATION review: "make runner honest" is DROPPED from scope (already correct on both branches) -- the sole write-side gap is artifact_sha + a new artifact_path, with an explicit fresh-vs-reused source marker. Vitest-path provenance is OUT OF SCOPE pending PLAN feasibility confirmation (no known on-disk artifact today); if infeasible at reasonable cost, file a follow-up rather than silently dropping it.';

// Replace the runner-honesty success criterion (now factually wrong) with the corrected one.
const success_criteria = sd.success_criteria.filter(
  (c) => !String(c.criterion || '').includes("runner is no longer hardcoded")
);
success_criteria.push({
  criterion: 'A fresh (non-reused) Playwright TESTING run stamps metadata.test_execution.artifact_path/.artifact_sha with real values, using the EXISTING artifact-verification.js primitives (computeArtifactSha/readArtifactWithSha/isReportHashMismatch), and a REUSED/cached run is marked distinctly (e.g. source:"reused") so its artifact_sha is never presented as if it came from a fresh run',
  measure: 'A fresh run\'s row has source:"fresh" (or equivalent) and a real matching hash; a reused-evidence row is distinguishable and never silently conflated with a fresh one',
});

const newMetadata = {
  ...sd.metadata,
  lead_validation_review: {
    evidence_id: '680890f5-cfd9-4d0d-aaa8-1c9d8c2a8f6b',
    applied_at: new Date().toISOString(),
  },
};

const { error } = await sb
  .from('strategic_directives_v2')
  .update({ description, scope, success_criteria, metadata: newMetadata })
  .eq('sd_key', SD_KEY);
if (error) throw error;
console.log('Applied VALIDATION-review corrections to', SD_KEY);
