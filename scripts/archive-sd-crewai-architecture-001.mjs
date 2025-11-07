import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const client = await createSupabaseServiceClient('engineer', { verbose: false });

console.log('\n🗄️  Archiving SD-CREWAI-ARCHITECTURE-001...\n');

// Step 1: Get current metadata to preserve it
const { data: currentSD } = await client
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('id', 'SD-CREWAI-ARCHITECTURE-001')
  .single();

const existingMetadata = currentSD?.metadata || {};

// Step 2: Update SD metadata with archival information (keep status as 'completed')
const { data: sd, error: updateError } = await client
  .from('strategic_directives_v2')
  .update({
    current_phase: 'COMPLETE',
    metadata: {
      ...existingMetadata,
      archival_status: 'archived',
      governance_annotation: 'Directive completed successfully; transitioned to Child SD Pattern model for future multi-phase directives.',
      archived_date: new Date().toISOString(),
      archived_by: 'Chairman',
      archival_reason: 'Successful completion with Child SD Pattern enhancement. Preserved as historical learning artifact.',
      successor_pattern: 'Child SD Pattern (parent_sd_id architecture)',
      closure_summary_path: '/docs/strategic-directives/archive/SD-CREWAI-ARCHITECTURE-001/closure_summary.md'
    }
  })
  .eq('id', 'SD-CREWAI-ARCHITECTURE-001')
  .select()
  .single();

if (updateError) {
  console.error('❌ Error updating SD:', updateError.message);
  process.exit(1);
}

console.log('✅ SD metadata updated with archival information');
console.log('   Status:', sd.status);
console.log('   Archival Status (metadata):', sd.metadata.archival_status);
console.log('   Phase:', sd.current_phase);
console.log('   Progress:', sd.progress + '%');
console.log('   Governance Annotation:', sd.metadata.governance_annotation);

// Step 3: Query governance audit log to check for automatic logging
const { data: auditLogs, error: auditError } = await client
  .from('governance_audit_log')
  .select('*')
  .eq('sd_id', 'SD-CREWAI-ARCHITECTURE-001')
  .order('created_at', { ascending: false })
  .limit(5);

if (auditError) {
  console.warn('\n⚠️  Could not query governance_audit_log:', auditError.message);
} else {
  console.log('\n📋 Recent governance audit log entries:', auditLogs?.length || 0);
  if (auditLogs && auditLogs.length > 0) {
    console.log('   Most recent action:', auditLogs[0].action_type || 'N/A');
  }
}

// Step 4: Check if leo_audit_summary table exists and update it
const { data: auditSummary, error: summaryError } = await client
  .from('leo_audit_summary')
  .upsert({
    sd_key: 'SD-CREWAI-ARCHITECTURE-001',
    closure_status: 'Archived – Child SD Pattern successor',
    closure_verified_by: 'Chairman',
    closure_date: new Date().toISOString(),
    final_progress: 100,
    retrospective_quality: 90,
    user_stories_completed: 25,
    total_story_points: 64,
    strategic_impact: 'Exceptional - Led to Child SD Pattern protocol enhancement',
    metadata: {
      archival_date: new Date().toISOString(),
      closure_summary_path: '/docs/strategic-directives/archive/SD-CREWAI-ARCHITECTURE-001/closure_summary.md',
      audit_log_path: '/docs/governance/audit/SD-CREWAI-ARCHITECTURE-001_final_audit_log.md'
    }
  }, {
    onConflict: 'sd_key'
  })
  .select();

if (summaryError) {
  console.warn('\n⚠️  Could not update leo_audit_summary:', summaryError.message);
  console.log('   (Table may not exist yet - this is optional)');
} else {
  console.log('\n✅ leo_audit_summary updated');
  console.log('   Closure Status:', auditSummary?.[0]?.closure_status || 'Updated');
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('   SD-CREWAI-ARCHITECTURE-001 ARCHIVED');
console.log('═══════════════════════════════════════════════════════════════');
console.log('   Status: completed');
console.log('   Archival Status: archived (metadata)');
console.log('   Phase: COMPLETE');
console.log('   Progress: 100%');
console.log('   Verified By: Chairman');
console.log('   Successor: Child SD Pattern');
console.log('═══════════════════════════════════════════════════════════════');

console.log('\n🎉 Archive operation complete!\n');
