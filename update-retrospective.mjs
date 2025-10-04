import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Get current retrospective
const { data: sd, error: fetchError } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('id', 'SD-RECONNECT-003')
  .single();

if (fetchError) {
  console.error('Error:', fetchError);
  process.exit(1);
}

const retrospective = JSON.parse(fs.readFileSync('/tmp/sd-reconnect-003-retrospective.json', 'utf-8'));

// Update retrospective with critical finding
retrospective.what_could_improve.push(
  "Orphan detector had critical logic flaw - only scanned 2 files instead of all stage components",
  "Recommendation #3 (delete 14 orphans) was based on flawed data - 13/14 were false positives",
  "Grep validation (mandatory step) prevented catastrophic deletion of 13 active components"
);

retrospective.lessons_learned.push(
  "Grep validation before deletion is MANDATORY - caught 93% false positive rate",
  "Static analysis tools need comprehensive test coverage before production use",
  "Multi-layer orchestration requires recursive import analysis, not single-file scans",
  "Quality process (validation gates) prevented ~4-8 hours of production incident recovery"
);

retrospective.metrics.false_positives_detected = 13;
retrospective.metrics.true_orphans_found = 1;
retrospective.metrics.components_saved_by_validation = 13;
retrospective.metrics.orphan_detector_accuracy = "7%";

retrospective.recommendations_for_future = [
  "REVISED: Delete only Stage52DataManagementKB.tsx (confirmed orphan with 0 references)",
  "Fix orphan-detector.js to scan ALL stage files for imports, not just 2 orchestrators",
  "Create comprehensive import dependency graph for cross-component analysis",
  "Create similar audit SDs for other component directories (pages, hooks, contexts)",
  "Add orphan detector accuracy testing before production recommendations",
  "Document chunk workflow architecture (LaunchGrowthChunkWorkflow pattern)",
  "Add stage component architecture to onboarding documentation"
];

// Update SD metadata
const updatedMetadata = {
  ...(sd.metadata || {}),
  retrospective,
  retrospective_updated: new Date().toISOString(),
  critical_finding: "Orphan detector false positives prevented by validation gates"
};

const { error: updateError } = await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: updatedMetadata,
    updated_at: new Date().toISOString()
  })
  .eq('id', 'SD-RECONNECT-003');

if (updateError) {
  console.error('Error:', updateError);
  process.exit(1);
}

console.log('✅ SD-RECONNECT-003 retrospective updated with critical findings');
console.log('   - Added 3 improvements');
console.log('   - Added 4 lessons learned');
console.log('   - Updated metrics with validation results');
console.log('   - Revised recommendations based on grep validation');
