// SD-FDBK-ENH-PAT-PHANTOM-TABLE-001 / CAPA-2:
// UPSERT the PAT-PHANTOM-TABLE-TEST-MISALIGNMENT-001 row into issue_patterns,
// cross-linked to PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 via metadata.related_patterns.
//
// Schema empirically verified at LEAD phase (VALIDATION row 7abcad58, RISK row 33844bdd):
// issue_patterns has NO top-level `related_patterns` column. Cross-link lives in metadata jsonb.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const row = {
  pattern_id: 'PAT-PHANTOM-TABLE-TEST-MISALIGNMENT-001',
  category: 'infrastructure',
  severity: 'medium',
  status: 'active',
  issue_summary: 'Phantom-table/test call-surface misalignment: when a PR removes a table-name string literal from src/ but leaves orphaned __tests__/ assertions referencing the removed name, the gate-pipeline pre-merge fails to catch the inconsistency. RCA origin: QF-20260509-849. CAPA-2 files this pattern; CAPA-3 adds the pre-merge gate scripts/phantom-test-audit.js + LEAD-FINAL-APPROVAL gate wrapper.',
  occurrence_count: 1,
  source_feedback_ids: ['9f24c164-471a-4f0c-a506-4d5762c52a55'],
  metadata: {
    related_patterns: ['PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001'],
    rca_source: 'QF-20260509-849',
    capa_coverage: ['CAPA-2', 'CAPA-3'],
    capa_deferred: ['CAPA-4'],
    closing_sd_key: 'SD-FDBK-ENH-PAT-PHANTOM-TABLE-001',
  },
};

const { data, error } = await supabase
  .from('issue_patterns')
  .upsert(row, { onConflict: 'pattern_id' })
  .select('pattern_id, status, metadata')
  .single();

if (error) {
  console.error('UPSERT failed:', error.message);
  process.exit(1);
}
console.log('UPSERT ok:', JSON.stringify(data, null, 2));
