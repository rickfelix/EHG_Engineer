import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function analyzeBacklogDiscrepancy() {
  // Get the SD-012 record
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', 'SD-2025-09-11-stage-18-documentation-sync-consolidated')
    .single();

  if (error) {
    console.error('Error fetching SD:', error);
    return;
  }

  console.log('📊 SD-012 Database Analysis');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('SD Key:', sd.sd_key);
  console.log('Description:', sd.description);
  console.log('Backlog Items Type:', typeof sd.backlog_items);
  console.log('Backlog Items Value:', sd.backlog_items);
  console.log('Backlog Items Stringified:', JSON.stringify(sd.backlog_items, null, 2));
  console.log('\nMetadata:', JSON.stringify(sd.metadata, null, 2));

  // Check if there's a mismatch between description and actual data
  const descriptionMentionsImport = sd.description && sd.description.includes('Imported from EHG Backlog');
  const hasBacklogItems = sd.backlog_items && (Array.isArray(sd.backlog_items) ? sd.backlog_items.length > 0 : Object.keys(sd.backlog_items).length > 0);

  console.log('\n🔍 Discrepancy Analysis:');
  console.log('Description mentions import:', descriptionMentionsImport);
  console.log('Actually has backlog items:', hasBacklogItems);
  console.log('Data integrity issue:', descriptionMentionsImport && !hasBacklogItems);

  // Recommendation
  console.log('\n💡 Recommendation:');
  if (descriptionMentionsImport && !hasBacklogItems) {
    console.log('The backlog import process appears to have failed.');
    console.log('Available source documentation found:');
    console.log('  - /mnt/c/_EHG/ehg/enhanced_prds/20_workflows/18_documentation_sync.md');
    console.log('  - /mnt/c/_EHG/EHG_Engineer/docs/workflow/critique/stage-18.md');
    console.log('  - /mnt/c/_EHG/ehg/docs/workflow/backlog/backlog.yaml (15 general items)');
    console.log('\nNext steps:');
    console.log('  1. Review PRD to extract specific backlog items for Stage 18');
    console.log('  2. Update backlog_items field with properly formatted JSON');
    console.log('  3. Verify import completion');
  }
}

analyzeBacklogDiscrepancy();
