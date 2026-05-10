import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sdKey = 'SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001';

const { data: cur, error: ge } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, scope, key_changes, risks, success_metrics, metadata')
  .eq('sd_key', sdKey)
  .single();

if (ge || !cur) {
  console.error('SELECT error:', ge);
  process.exit(1);
}

const updated = {
  scope: "Canonicalize sd_type enum across 5 modules (4 SD_TYPE_THRESHOLDS map copies + plan-parser.js inferSDType return values) using DB CHECK as single source of truth via new lib/sd-type-enum.js. Replace silent default-to-feature pattern with fail-loud validator. Update existing tests that assert phantom 'fix' value to assert canonical 'bugfix'. Witnessed incident: database-agent had to substitute fix→bugfix on UPDATE during this SD source-feedback LEAD-TO-PLAN. Tier-2: 80-120 src LOC + 180-220 test LOC.",
  key_changes: [
    { change: 'Create lib/sd-type-enum.js exporting CANONICAL_SD_TYPES + isValidSdType + assertValidSdType', impact: 'Single source of truth aligned with DB CHECK constraint; consumers import from one place.' },
    { change: "plan-parser.js inferSDType: return canonical 'bugfix' instead of phantom 'fix' at lines 159+168", impact: "Closes the witnessed incident path. Update plan-parser.test.js:141,174 + target-application.test.js:227 fixture." },
    { change: 'Replace 4 SD_TYPE_THRESHOLDS map copies with shared import: scripts/modules/sd-quality-scoring.js:13, scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js:31, scripts/modules/handoff/executors/plan-to-lead/gates/heal-before-complete.js:283, scripts/story-requirements-template.js:16', impact: 'Removes phantom fix key from threshold-map consumers; threshold lookups validate against canonical enum.' },
    { change: 'leo-create-sd.js: replace silent warn+default-to-feature with fail-loud throw on unknown sd_type post-mapping', impact: "Prevents future drift; CLI errors immediately on typos like 'fix'." },
    { change: 'Add tests/db-invariants/sd-type-canonical.test.js querying pg_constraint = lib/sd-type-enum.js exported set', impact: 'DB-CHECK and lib/sd-type-enum.js can never drift apart silently.' },
    { change: 'Add tests/sd-type-threshold-canonical.test.js iterating all 4 threshold maps via dynamic import', impact: 'Pin all consumers to canonical enum.' },
    { change: 'Add scripts/leo-create-sd-types.test.js (6 cases): mapToDbType + post-mapping unknown throws', impact: 'New coverage for previously untested CLI validator.' }
  ],
  risks: [
    { risk: "Existing tests asserting phantom 'fix' value will break on first run", impact: 'low', likelihood: 'high', mitigation: 'Identified by testing-agent (5c224612): plan-parser.test.js:141,174 + target-application.test.js:227. Update assertions in same PR.' },
    { risk: 'Schema migration needed for CHECK contraction', impact: 'low', likelihood: 'low', mitigation: 'Testing-agent verified: 806 rows, 7 distinct values, ALL within CHECK list. Zero data migration. Optional dormant-value contraction deferred to post-merge.' },
    { risk: 'A consumer of the threshold map outside the 4 identified copies', impact: 'medium', likelihood: 'low', mitigation: 'AST static guard test will fail if any new file hardcodes SD_TYPE_THRESHOLDS without importing canonical. Mirror the worktree-rmsync junction-safety guard pattern.' }
  ],
  success_metrics: [
    { metric: "Phantom 'fix' references eliminated", target: "0 occurrences of literal 'fix' as sd_type in scripts/, lib/, tests/" },
    { metric: 'DB CHECK / lib enum equality', target: 'sd-type-canonical.test.js asserts 100% set equality' },
    { metric: 'New test coverage', target: "22-28 new test cases pass; 4 existing tests updated to canonical 'bugfix'" },
    { metric: 'Zero LEO regression', target: 'lib/eva test suite unchanged pass rate (currently ~177/177 lib/, ~406/406 in lib/eva)' }
  ],
  metadata: {
    ...(cur.metadata || {}),
    lead_evaluation: {
      evaluated_at: new Date().toISOString(),
      evaluated_by: 'LEAD-Opus-4.7',
      decision: 'APPROVED',
      validation_gate: 'Q1+Q4+Q5+Q7+Q8 all PASS',
      witnessed_incident: 'database-agent fix→bugfix substitution on UPDATE during source-feedback LEAD-TO-PLAN',
      scope_correction_during_lead: 'Surface 4 in SD description (vision-scorer.js) is wrong per testing-agent ac0a3184. Actual phantom-fix lives in 4 threshold-map copies (sd-quality-scoring.js + 2 handoff gates + story-requirements-template.js). PRD must reflect.',
      testing_agent_evidence_id: '5c224612-63ba-4a8a-8600-05a4e8d5084c',
      tier_assessment: 'Tier-2',
      loc_estimate: { src: '80-120', test: '180-220' },
      data_migration_required: false,
      witness_pattern: 'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 12th-witness (DB CHECK writer / 5 consumer modules)'
    }
  }
};

const { error: ue } = await supabase.from('strategic_directives_v2').update(updated).eq('id', cur.id);
if (ue) {
  console.error('UPDATE error:', ue);
  process.exit(1);
}
console.log('✓ SD updated with LEAD evaluation + scope correction');
