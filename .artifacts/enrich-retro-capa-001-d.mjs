import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { updateRetrospectiveWithToken } from '../lib/retro/write-with-token.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const RETRO_ID = 'd81dcd26-5ac9-4d44-93d6-1fa7fcdbb9ee';

const newSuccessPatterns = [
  'Adversarial sub-agent passes at every phase (RISK+VALIDATION at LEAD, TESTING at PLAN-TO-EXEC, SECURITY+TESTING at EXEC-TO-PLAN, VALIDATION+REGRESSION at PLAN-TO-LEAD) each caught a distinct, real defect before it shipped -- the multi-agent pipeline earned its keep at nearly every gate, not just once.',
  "Re-grepping every named file/symbol/premise at LEAD claim time (per the SD's own re-grep instruction) surfaced three stale/wrong premises in the SD's own scope text before any code was written -- catching real drift instead of theoretical risk.",
  'When review tooling (browser automation) was unavailable, the FR-2 experience-review pilot reported one real finding plus two honestly-marked INCONCLUSIVE findings rather than fabricating journey-coverage data.',
];

const newFailurePatterns = [
  "A scorer (scoreWireframeFidelity) can be unit-tested and still have zero production call sites -- simply 'registering the gate' would have produced a printed discriminator that never generates real data.",
  'An incomplete-row insert probe used to check constraint state gave a false read (looked like a migration was already applied when it was not); only a complete, NOT-NULL-satisfying probe row proves constraint state.',
  "jsonb_set does not create missing INTERMEDIATE path elements, only the final one -- a migration reported '1 row affected' and silently no-op'd on its first live apply; caught only by re-querying immediately after applying, never by trusting the row-count.",
  "Two sibling SDs (this one and CAPA-001-A) independently widened the SAME CHECK constraint with different, non-overlapping value lists on unmerged branches -- a collision invisible to either SD's own text, found only by direct code/DB reconciliation.",
  "The SD's own scope text said fidelity compares against blueprint_wireframes; the actual code (getExportedScreens) reads a different artifact type (stitch_design_export) that zero ventures fleet-wide have ever produced -- a text/code mismatch that would have shipped a gate with guaranteed-zero real data.",
];

const newKeyLearnings = [
  {
    category: 'RE_GREP_AT_CLAIM_TIME',
    evidence: "LEAD-phase re-verification found 3 stale/wrong premises in the SD's own scope text",
    learning: 'Re-grep every named file/symbol/premise at claim/authoring time, not just at handoff -- it catches real drift (dead call sites, unapplied migrations, wrong artifact-type references), not just theoretical risk.',
    applicability: 'Apply to every SD inheriting scope text from a parent/sibling SD or an earlier planning pass.',
  },
  {
    category: 'MIGRATION_VERIFICATION',
    evidence: "jsonb_set's first live apply silently no-op'd on an intermediate path element",
    learning: "jsonb_set only creates the FINAL path element, never missing intermediate ones -- always re-query the row immediately after applying a jsonb_set migration; a reported row-count is not proof of the intended write.",
    applicability: 'Any migration using jsonb_set on a nested/multi-level JSON path.',
  },
  {
    category: 'CONSTRAINT_STATE_VERIFICATION',
    evidence: 'An incomplete-row insert probe wrongly suggested a sibling migration was already applied',
    learning: 'Verify CHECK/NOT NULL constraint state with a complete, NOT-NULL-satisfying probe row -- an incomplete insert probe can fail for the wrong reason and give a false read on whether a migration already landed.',
    applicability: 'Any pre-flight check that infers schema state from an INSERT attempt rather than reading the constraint definition directly.',
  },
  {
    category: 'CROSS_SD_COLLISION',
    evidence: 'Sibling SD CAPA-001-A independently widened the same CHECK constraint with a different value list on an unmerged branch',
    learning: "Two sibling SDs touching the same constraint/table can silently diverge on unmerged branches; reconcile via direct code/DB comparison before applying either migration, not by trusting either SD's own written scope.",
    applicability: 'Any set of sibling SDs (same parent) that touch the same schema object.',
  },
  {
    category: 'HONEST_INCONCLUSIVE',
    evidence: 'FR-2 experience-review pilot had no connected browser-automation extension against a pure client-rendered SPA',
    learning: 'An honest INCONCLUSIVE finding beats fabricated data when review tooling is unavailable -- document the tooling limitation and record only what was actually verifiable.',
    applicability: 'Any review/audit pilot run without its full intended tooling.',
  },
  {
    category: 'PRINTED_DISCRIMINATOR_RISK',
    evidence: 'scoreWireframeFidelity had unit tests but zero production call sites',
    learning: 'A function can be fully unit-tested and still be dead code in production -- before registering a gate/criterion on a scorer, confirm it has a real, live call site, or the gate becomes a printed discriminator that never produces real data.',
    applicability: 'Any gate registration (bind-criterion-checker, quality gates) built on an existing scorer function.',
  },
  {
    category: 'MULTI_AGENT_GATE_VALUE',
    evidence: '5 distinct adversarial sub-agent passes (RISK, VALIDATION, TESTING, SECURITY, REGRESSION) each caught a different real defect',
    learning: 'The multi-phase adversarial sub-agent pipeline caught a different real defect at nearly every gate -- treat repeated catches as evidence the pipeline is working, not friction to route around.',
    applicability: 'Reference this SD when justifying sub-agent invocation cost on similar CAPA-pattern SDs.',
  },
  {
    category: 'TRANSIENT_PERMISSION_BLOCK',
    evidence: 'DDL/migration-execution permission classifier blocked twice (database-agent path and direct script), cleared ~20 min later on retry with no code change',
    learning: "A session-level permission-classifier block on DDL execution can be transient infrastructure flakiness, not a defect in the SD's own design -- signal it to the coordinator per protocol rather than working around it, and do not over-attribute it to the SD's own scope.",
    applicability: 'Any SD whose EXEC phase needs direct migration execution.',
  },
  {
    category: 'CROSS_SD_PRODUCER_READER_DRIFT',
    evidence: 'REGRESSION found the live DB 15-value category CHECK constraint and finding-shape.js FINDING_CATEGORIES are different sets',
    learning: "A pre-existing producer/reader drift (DB constraint vs JS array) spanning 3+ SDs' ownership is a genuine finding worth flagging for follow-up, not fixing inline when ownership is unclear and out of the current SD's scope.",
    applicability: 'Any REGRESSION finding that surfaces cross-cutting drift owned by multiple SDs.',
  },
];

const newActionItems = [
  {
    owner: 'Follow-up SD/QF (cross-SD, venture_quality_findings ownership)',
    action: 'Reconcile the venture_quality_findings category CHECK constraint (live DB, 15 values) with lib/eva/quality-findings/finding-shape.js FINDING_CATEGORIES -- DB is missing feedback_widget_present/error_capture_wired; JS is missing performance/responsive.',
    source: 'regression_finding',
    priority: 'medium',
    category: 'DATA_INTEGRITY',
    smart_format: true,
    success_criteria: 'DB CHECK constraint values and FINDING_CATEGORIES array are the same set, verified by direct comparison, not by re-running the same probe.',
  },
  {
    owner: 'CAPA-001-A + CAPA-001-D coordination',
    action: "Coordinate migration sequencing between CAPA-001-A and CAPA-001-D before either applies its widened category CHECK constraint value list, to avoid a silent regression on the shared constraint.",
    source: 'lead_reverification',
    priority: 'high',
    category: 'MIGRATION_SEQUENCING',
    smart_format: true,
    success_criteria: "Both SDs' constraint migrations are diffed against each other and applied as a single reconciled value list, not two independent ALTERs.",
  },
  {
    owner: 'Experience-review pilot follow-up',
    action: 'Re-run the FR-2 experience-review pilot once a connected browser-automation extension is available, replacing the 2 honestly-marked INCONCLUSIVE interactive-journey findings with real verified results.',
    source: 'tooling_gap',
    priority: 'medium',
    category: 'TOOLING_GAP',
    smart_format: true,
    success_criteria: 'The two INCONCLUSIVE journey findings are replaced by PASS/FAIL findings backed by an actual browser session.',
  },
];

function dedupeStrings(existing, incoming) {
  const seen = new Set((existing || []).map((s) => (typeof s === 'string' ? s : JSON.stringify(s))));
  const merged = [...(existing || [])];
  for (const item of incoming) {
    const key = typeof item === 'string' ? item : JSON.stringify(item);
    if (!seen.has(key)) {
      merged.push(item);
      seen.add(key);
    }
  }
  return merged;
}

async function main() {
  const { data: existing, error: fetchError } = await supabase
    .from('retrospectives')
    .select('success_patterns, failure_patterns, key_learnings, action_items')
    .eq('id', RETRO_ID)
    .single();

  if (fetchError) {
    console.error('Fetch failed:', fetchError.message);
    process.exit(1);
  }

  const payload = {
    success_patterns: dedupeStrings(existing.success_patterns, newSuccessPatterns),
    failure_patterns: dedupeStrings(existing.failure_patterns, newFailurePatterns),
    key_learnings: dedupeStrings(existing.key_learnings, newKeyLearnings),
    action_items: dedupeStrings(existing.action_items, newActionItems),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await updateRetrospectiveWithToken(
    (p) => supabase.from('retrospectives').update(p).eq('id', RETRO_ID).select().single(),
    payload,
    'retro_sub_agent'
  );

  if (error) {
    console.error('Update failed:', error.message);
    process.exit(1);
  }

  console.log('Updated retrospective:', data.id);
  console.log('success_patterns:', data.success_patterns.length);
  console.log('failure_patterns:', data.failure_patterns.length);
  console.log('key_learnings:', data.key_learnings.length);
  console.log('action_items:', data.action_items.length);
  console.log('quality_score:', data.quality_score);
  console.log('status:', data.status);
}

main();
