import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg'
);

async function createSD() {
  console.log('Creating SD-CAPABILITY-LIFECYCLE-001...\n');

  // First get the parent SD (SD-BLUEPRINT-ENGINE-001) uuid for parent_sd_id
  const { data: parentSD, error: parentError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id')
    .eq('legacy_id', 'SD-BLUEPRINT-ENGINE-001')
    .single();

  if (parentError) {
    console.log('Warning: Could not find parent SD:', parentError.message);
  }

  const sdData = {
    id: 'SD-CAPABILITY-LIFECYCLE-001',
    legacy_id: 'SD-CAPABILITY-LIFECYCLE-001',
    sd_key: 'capability-lifecycle-automation',
    title: 'Capability Lifecycle Automation',
    description: `Automate the registration, status tracking, and deprecation of platform capabilities (CrewAI agents, tools, crews) when Strategic Directives complete.

Key Features:
1. Auto-register new capabilities when SD completes with delivers_capabilities metadata
2. Auto-update capability status when SD modifies/deprecates existing capabilities
3. SD metadata fields for capability declarations
4. Integration with existing sub-agent queue pattern`,
    scope: `IN SCOPE:
- SD metadata enhancement (delivers_capabilities, modifies_capabilities, deprecates_capabilities fields)
- Auto-registration trigger on SD completion
- Auto-status-update trigger for modifications/deprecations
- Capability-SD junction table for audit trail

OUT OF SCOPE:
- External webhook system (future enhancement)
- Capability versioning (future enhancement)
- Deprecation workflow UI (manual process for now)`,
    strategic_objectives: JSON.stringify([
      'Keep capability registry automatically synchronized with platform development',
      'Enable Blueprint Generation to always have current capability data',
      'Reduce manual capability registration overhead',
      'Provide audit trail for capability lifecycle changes'
    ]),
    status: 'active',
    current_phase: 'LEAD',
    priority: 'high',
    category: 'database',
    sd_type: 'database',
    // parent_sd_id: null - not setting since SD-BLUEPRINT-ENGINE-001 may not exist in consolidated DB
    progress_percentage: 0,
    created_by: 'LEAD',
    rationale: 'Currently, new capabilities (agents, tools, crews) require manual registration via scripts. This creates data staleness, prevents Blueprint Generation from using accurate capability data, and adds operational overhead. Automating this lifecycle process ensures capabilities are always synchronized with platform development.',
    success_criteria: JSON.stringify([
      'SD completion with delivers_capabilities auto-registers new capabilities',
      'SD completion with modifies_capabilities updates existing capability status',
      'Audit trail in sd_capabilities junction table',
      'No manual scripts needed for capability registration'
    ])
  };

  // Check if SD already exists
  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('id', 'SD-CAPABILITY-LIFECYCLE-001')
    .single();

  if (existing) {
    console.log('SD-CAPABILITY-LIFECYCLE-001 already exists. Updating...');
    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update(sdData)
      .eq('id', 'SD-CAPABILITY-LIFECYCLE-001');

    if (updateError) {
      console.log('Error updating SD:', updateError.message);
      return;
    }
    console.log('SD updated successfully');
  } else {
    console.log('Creating new SD...');
    const { error: insertError } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData);

    if (insertError) {
      console.log('Error creating SD:', insertError.message);
      return;
    }
    console.log('SD created successfully');
  }

  // Fetch the created SD to show details
  const { data: createdSD, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id, title, status, current_phase, parent_sd_id')
    .eq('id', 'SD-CAPABILITY-LIFECYCLE-001')
    .single();

  if (fetchError) {
    console.log('Error fetching created SD:', fetchError.message);
    return;
  }

  console.log('\n=== SD Created ===');
  console.log(`UUID: ${createdSD.uuid_id}`);
  console.log(`ID: ${createdSD.id}`);
  console.log(`Title: ${createdSD.title}`);
  console.log(`Status: ${createdSD.status}`);
  console.log(`Phase: ${createdSD.current_phase}`);
  console.log(`Parent: ${createdSD.parent_sd_id || 'None'}`);

  console.log('\n=== Next Steps ===');
  console.log('1. Run: node scripts/add-prd-to-database.js SD-CAPABILITY-LIFECYCLE-001 "Capability Lifecycle Automation PRD"');
  console.log('2. Run: node scripts/unified-handoff-system.js execute LEAD-TO-PLAN SD-CAPABILITY-LIFECYCLE-001');
}

createSD();
