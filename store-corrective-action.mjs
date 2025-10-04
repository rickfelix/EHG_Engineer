import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('Error: SUPABASE_ANON_KEY not found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Load corrective action report
const report = JSON.parse(fs.readFileSync('/tmp/sd-reconnect-003-corrective-action.json', 'utf-8'));

// Get current SD metadata (using 'id' column which contains SD-RECONNECT-003)
const { data: sd, error: fetchError } = await supabase
  .from('strategic_directives_v2')
  .select('metadata, id')
  .eq('id', 'SD-RECONNECT-003')
  .single();

if (fetchError) {
  console.error('Error fetching SD:', fetchError);
  process.exit(1);
}

// Add corrective action to metadata
const updatedMetadata = {
  ...(sd.metadata || {}),
  corrective_action: report
};

// Update SD with corrective action
const { error: updateError } = await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: updatedMetadata,
    updated_at: new Date().toISOString()
  })
  .eq('id', 'SD-RECONNECT-003');

if (updateError) {
  console.error('Error updating SD:', updateError);
  process.exit(1);
}

console.log('✅ Corrective action report stored in SD-RECONNECT-003 metadata');
console.log(`   - Issue: ${report.title}`);
console.log(`   - Severity: ${report.issue_severity}`);
console.log(`   - Components saved: ${report.impact_prevented.components_saved}`);
console.log(`   - False positives: ${report.validation_process.false_positives_detected}/14`);
