const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_ANON_KEY environment variable not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateSDScope() {
  const sdId = 'SD-VIDEO-VARIANT-001';

  console.log('=== Updating SD-VIDEO-VARIANT-001 Scope ===\n');

  // Get current SD
  const { data: sd, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (fetchError) {
    console.error('❌ Error fetching SD:', fetchError.message);
    return;
  }

  console.log('✅ Current SD fetched\n');

  // Parse scope
  let scope = typeof sd.scope === 'string' ? JSON.parse(sd.scope) : sd.scope;

  console.log('--- SCOPE ADJUSTMENTS ---\n');

  // Adjustment #1: Update "3 new database tables" to "4 new database tables"
  const dbTableIndex = scope.in_scope.findIndex(item =>
    item.includes('3 new database tables')
  );

  if (dbTableIndex !== -1) {
    const oldValue = scope.in_scope[dbTableIndex];
    scope.in_scope[dbTableIndex] = '4 new database tables (variant_groups, video_variants, variant_performance, use_case_templates)';
    console.log('✅ Adjustment #1: Database tables');
    console.log(`   Old: ${oldValue}`);
    console.log(`   New: ${scope.in_scope[dbTableIndex]}\n`);
  } else {
    console.log('⚠️  Could not find "3 new database tables" in scope\n');
  }

  // Adjustment #2: Add component sizing if not already present
  const componentSizingExists = scope.in_scope.some(item =>
    item.includes('component sizing') || item.includes('600 LOC')
  );

  if (!componentSizingExists) {
    scope.in_scope.push('Component sizing requirement: All components <600 LOC (enforced in code review)');
    console.log('✅ Adjustment #2: Component sizing added to in_scope\n');
  } else {
    console.log('⚠️  Component sizing already in scope\n');
  }

  // Adjustment #3: Add Week 4 checkpoint if not present
  const week4CheckpointExists = scope.in_scope.some(item =>
    item.includes('Week 4') || item.includes('checkpoint')
  );

  if (!week4CheckpointExists) {
    scope.in_scope.push('Week 4 checkpoint: LEAD review of MVP progress (option to defer Phases 5-8 if MVP sufficient)');
    console.log('✅ Adjustment #3: Week 4 checkpoint added to in_scope\n');
  } else {
    console.log('⚠️  Week 4 checkpoint already in scope\n');
  }

  // Parse success_criteria
  let success_criteria = [];
  try {
    success_criteria = typeof sd.success_criteria === 'string'
      ? JSON.parse(sd.success_criteria)
      : (Array.isArray(sd.success_criteria) ? sd.success_criteria : []);
  } catch (e) {
    console.log('⚠️  Success criteria not parseable, creating new array\n');
    success_criteria = [];
  }

  // Add component sizing to success criteria if not present
  const componentSizingInCriteria = success_criteria.some(item =>
    item.includes('component') && item.includes('600')
  );

  if (!componentSizingInCriteria) {
    success_criteria.push('Component sizing: All components <600 LOC (extract sub-components if needed)');
    console.log('✅ Adjustment #4: Component sizing added to success_criteria\n');
  }

  // Update SD in database
  const { data: updated, error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      scope: JSON.stringify(scope),
      success_criteria: JSON.stringify(success_criteria),
      updated_at: new Date().toISOString()
    })
    .eq('id', sdId)
    .select();

  if (updateError) {
    console.error('❌ Error updating SD:', updateError.message);
    return;
  }

  console.log('✅ SD-VIDEO-VARIANT-001 updated successfully!\n');

  console.log('--- SUMMARY ---');
  console.log(`In-Scope Items: ${scope.in_scope.length}`);
  console.log(`Success Criteria: ${success_criteria.length}`);
  console.log('\nKey Changes:');
  console.log('  • 3 → 4 database tables (added use_case_templates)');
  console.log('  • Component sizing requirement added (<600 LOC)');
  console.log('  • Week 4 checkpoint added (LEAD review)');
}

updateSDScope().catch(console.error);
