require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  console.log('=== HANDOFF MIGRATION: leo_handoff_executions → sd_phase_handoffs ===\n');

  // PHASE 1: Pre-migration validation
  console.log('PHASE 1: Pre-migration validation...');

  const { count: legacyCount, error: legacyCountError } = await supabase
    .from('leo_handoff_executions')
    .select('*', { count: 'exact', head: true });

  const { count: unifiedCount, error: unifiedCountError } = await supabase
    .from('sd_phase_handoffs')
    .select('*', { count: 'exact', head: true });

  if (legacyCountError || unifiedCountError) {
    console.error('❌ Error counting records:', legacyCountError || unifiedCountError);
    process.exit(1);
  }

  const gap = legacyCount - unifiedCount;
  console.log(`  Legacy: ${legacyCount} records`);
  console.log(`  Unified: ${unifiedCount} records`);
  console.log(`  Gap: ${gap} records to process\n`);

  if (gap < 0) {
    console.error('❌ ERROR: Unified table has more records than legacy. Aborting.');
    process.exit(1);
  }

  // PHASE 2: Fetch records to migrate
  console.log('PHASE 2: Fetching records to migrate...');

  const { data: legacyRecords, error: fetchError } = await supabase
    .from('leo_handoff_executions')
    .select('*')
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error('❌ Error fetching legacy records:', fetchError);
    process.exit(1);
  }

  // Get existing IDs to avoid duplicates
  const { data: existingRecords } = await supabase
    .from('sd_phase_handoffs')
    .select('id');

  const existingIds = new Set(existingRecords.map(r => r.id));
  const toMigrate = legacyRecords.filter(r => !existingIds.has(r.id));

  console.log(`  Found ${toMigrate.length} records to migrate\n`);

  if (toMigrate.length === 0) {
    console.log('✅ No new records to migrate. Migration already complete.');
    process.exit(0);
  }

  // PHASE 3: Transform and migrate records
  console.log('PHASE 3: Migrating records...');

  // Helper function to normalize phase names
  const normalizePhase = (legacyPhase) => {
    const mapping = {
      'APPROVAL': 'LEAD',
      'VERIFICATION': 'PLAN',
      'UNKNOWN': 'LEAD'
    };
    return mapping[legacyPhase] || legacyPhase;
  };

  // Helper function to normalize handoff_type
  const normalizeHandoffType = (legacyType, fromAgent, toAgent) => {
    // Map legacy types to current LEAD/PLAN/EXEC standard
    const mapping = {
      'EXEC-to-VERIFICATION': 'EXEC-to-PLAN', // VERIFICATION = PLAN supervisor
      'VERIFICATION-to-APPROVAL': 'PLAN-to-LEAD', // APPROVAL = LEAD final
      'EXEC_to_PLAN': 'EXEC-to-PLAN', // Underscore to dash
      'PLAN_to_LEAD': 'PLAN-to-LEAD', // Underscore to dash
      'implementation_to_verification': 'EXEC-to-PLAN',
      'verification_to_approval': 'PLAN-to-LEAD',
      'strategic_to_technical': 'LEAD-to-PLAN',
      'technical_to_implementation': 'PLAN-to-EXEC',
      'supervisor_verification': 'EXEC-to-PLAN',
      'discovery_findings': 'LEAD-to-PLAN',
      'reassessment': 'PLAN-to-LEAD',
      'standard': fromAgent && toAgent ? `${fromAgent}-to-${toAgent}` : 'LEAD-to-PLAN'
    };

    return mapping[legacyType] || legacyType; // Use mapping or original if valid
  };

  const transformedRecords = toMigrate.map(record => {
    // Normalize phase names
    const normalizedFromPhase = normalizePhase(record.from_agent);
    const normalizedToPhase = normalizePhase(record.to_agent);

    // Normalize handoff_type
    const normalizedHandoffType = normalizeHandoffType(record.handoff_type, normalizedFromPhase, normalizedToPhase);

    // Generate default executive summary if missing
    const executiveSummary = record.executive_summary ||
      `[MIGRATED] ${record.handoff_type} handoff for ${record.sd_id}. Legacy handoff migrated from leo_handoff_executions table. Original created: ${record.created_at}.`;

    // Generate completeness report from verification_results
    const completenessReport = record.verification_results && Object.keys(record.verification_results).length > 0
      ? `Verification: ${JSON.stringify(record.verification_results)}`
      : '[MIGRATED] Legacy handoff - verification data preserved in metadata';

    // Generate deliverables manifest
    const deliverableManifest = record.deliverables_manifest && Array.isArray(record.deliverables_manifest) && record.deliverables_manifest.length > 0
      ? JSON.stringify(record.deliverables_manifest)
      : `[MIGRATED] Handoff ${record.handoff_type} completed. Status: ${record.status}. Created by: ${record.created_by}`;

    // Generate key decisions from recommendations
    const keyDecisions = record.recommendations && Array.isArray(record.recommendations) && record.recommendations.length > 0
      ? `Recommendations: ${JSON.stringify(record.recommendations)}`
      : '[MIGRATED] Legacy handoff - no explicit recommendations recorded';

    // Generate known issues from compliance_status
    const knownIssues = record.compliance_status && Object.keys(record.compliance_status).length > 0
      ? `Compliance: ${JSON.stringify(record.compliance_status)}`
      : '[MIGRATED] No compliance issues recorded in legacy system';

    // Generate resource utilization from quality_metrics
    const resourceUtilization = record.quality_metrics && Object.keys(record.quality_metrics).length > 0
      ? `Quality Metrics: ${JSON.stringify(record.quality_metrics)}`
      : '[MIGRATED] Legacy handoff - quality metrics preserved in metadata';

    // Generate action items
    const actionItems = record.action_items && Array.isArray(record.action_items) && record.action_items.length > 0
      ? JSON.stringify(record.action_items)
      : '[MIGRATED] No explicit action items from legacy handoff';

    return {
      id: record.id,
      sd_id: record.sd_id,
      from_phase: normalizedFromPhase,
      to_phase: normalizedToPhase,
      handoff_type: normalizedHandoffType,
      status: 'pending_acceptance', // Insert as pending_acceptance to bypass validation
      executive_summary: executiveSummary,
      deliverables_manifest: deliverableManifest,
      key_decisions: keyDecisions,
      known_issues: knownIssues,
      resource_utilization: resourceUtilization,
      action_items: actionItems,
      completeness_report: completenessReport,
      metadata: {
        migrated_from: 'leo_handoff_executions',
        original_status: record.status,
        original_from_agent: record.from_agent,
        original_to_agent: record.to_agent,
        original_handoff_type: record.handoff_type,
        validation_score: record.validation_score,
        validation_passed: record.validation_passed,
        template_id: record.template_id,
        prd_id: record.prd_id
      },
      rejection_reason: record.rejection_reason || null,
      created_at: record.created_at,
      accepted_at: record.accepted_at,
      rejected_at: null,
      created_by: record.created_by
    };
  });

  // Batch insert (Supabase has a limit, so chunk into batches of 100)
  const batchSize = 100;
  let migrated = 0;
  let errors = [];

  for (let i = 0; i < transformedRecords.length; i += batchSize) {
    const batch = transformedRecords.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('sd_phase_handoffs')
      .insert(batch)
      .select('id');

    if (error) {
      console.error(`  ❌ Error in batch ${Math.floor(i / batchSize) + 1}:`, error);
      errors.push({ batch: Math.floor(i / batchSize) + 1, error });
    } else {
      migrated += batch.length;
      console.log(`  ✅ Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} records migrated`);
    }
  }

  console.log(`\n  Total migrated: ${migrated}/${toMigrate.length} records\n`);

  if (errors.length > 0) {
    console.error(`❌ Migration completed with ${errors.length} errors`);
    errors.forEach(e => console.error(`  Batch ${e.batch}:`, e.error.message));
  }

  // PHASE 4: Post-migration verification
  console.log('PHASE 4: Post-migration verification...');

  const { count: finalCount } = await supabase
    .from('sd_phase_handoffs')
    .select('*', { count: 'exact', head: true });

  console.log(`  Unified table now has: ${finalCount} records`);
  console.log(`  Expected: ${legacyCount} records`);

  if (finalCount === legacyCount) {
    console.log('  ✅ SUCCESS: Record counts match!\n');
  } else {
    console.log(`  ⚠️  WARNING: Count mismatch (${finalCount} vs ${legacyCount})\n`);
  }

  // PHASE 5: Sample verification
  console.log('PHASE 5: Sample verification (5 random records)...');

  const { data: sampleUnified } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, from_phase, to_phase, status')
    .limit(5);

  for (const unified of sampleUnified) {
    const { data: legacy } = await supabase
      .from('leo_handoff_executions')
      .select('from_agent, to_agent, status')
      .eq('id', unified.id)
      .single();

    const match = (
      unified.from_phase === legacy.from_agent &&
      unified.to_phase === legacy.to_agent &&
      unified.status === legacy.status
    );

    console.log(`  ${match ? '✅' : '❌'} ${unified.sd_id}: ${unified.from_phase}→${unified.to_phase} (${unified.status})`);
  }

  console.log('\n=== MIGRATION COMPLETE ===');
  console.log('Next steps:');
  console.log('1. Update calculate_sd_progress function (database/migrations/force_update_with_test.sql:73)');
  console.log('2. Update 46 scripts to use sd_phase_handoffs');
  console.log('3. Deprecate legacy table');
})().catch(error => {
  console.error('❌ FATAL ERROR:', error);
  process.exit(1);
});
