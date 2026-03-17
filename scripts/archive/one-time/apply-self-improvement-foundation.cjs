#!/usr/bin/env node
/**
 * Apply Self-Improvement Foundation Migration (Phase 0)
 * SD: SD-LEO-SELF-IMPROVE-FOUND-001
 *
 * This script creates the database infrastructure for the LEO Self-Improvement Loop
 * using the Supabase client with service role key.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function executeSQL(sql, description) {
  console.log(`  Executing: ${description}...`);
  const { data, error } = await supabase.rpc('fn_execute_sql_admin', {
    sql_text: sql
  });

  if (error) {
    if (error.message.includes('already exists') || error.code === '42P07') {
      console.log(`  ℹ️  Already exists (idempotent)`);
      return true;
    }
    console.log(`  ❌ Error: ${error.message}`);
    return false;
  }
  console.log(`  ✅ Success`);
  return true;
}

async function applyMigration() {
  console.log('='.repeat(70));
  console.log('🚀 Self-Improvement Foundation Migration (Phase 0)');
  console.log('   SD: SD-LEO-SELF-IMPROVE-FOUND-001');
  console.log('='.repeat(70));
  console.log('');

  let hasErrors = false;

  // Step 1: Create protocol_constitution table
  console.log('\n📋 Step 1: Create protocol_constitution table');
  const step1 = await executeSQL(`
    CREATE TABLE IF NOT EXISTS protocol_constitution (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_code VARCHAR(50) UNIQUE NOT NULL,
      rule_text TEXT NOT NULL,
      category VARCHAR(50),
      rationale TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, 'CREATE TABLE protocol_constitution');
  if (!step1) hasErrors = true;

  // Step 2: Create RLS policies
  console.log('\n📋 Step 2: Create RLS policies for constitution immutability');

  await executeSQL('ALTER TABLE protocol_constitution ENABLE ROW LEVEL SECURITY', 'Enable RLS');

  // Drop existing policies first
  await executeSQL('DROP POLICY IF EXISTS no_delete_constitution ON protocol_constitution', 'Drop existing delete policy');
  await executeSQL('DROP POLICY IF EXISTS no_update_constitution ON protocol_constitution', 'Drop existing update policy');
  await executeSQL('DROP POLICY IF EXISTS select_constitution ON protocol_constitution', 'Drop existing select policy');
  await executeSQL('DROP POLICY IF EXISTS insert_constitution ON protocol_constitution', 'Drop existing insert policy');

  // Create policies
  await executeSQL(`
    CREATE POLICY no_delete_constitution ON protocol_constitution
    FOR DELETE USING (false)
  `, 'CREATE delete prevention policy');

  await executeSQL(`
    CREATE POLICY no_update_constitution ON protocol_constitution
    FOR UPDATE USING (false)
  `, 'CREATE update prevention policy');

  await executeSQL(`
    CREATE POLICY select_constitution ON protocol_constitution
    FOR SELECT USING (true)
  `, 'CREATE select policy');

  await executeSQL(`
    CREATE POLICY insert_constitution ON protocol_constitution
    FOR INSERT WITH CHECK (true)
  `, 'CREATE insert policy');

  // Step 3: Add risk_tier column
  console.log('\n📋 Step 3: Add risk_tier column to protocol_improvement_queue');

  // Check if column exists
  const { data: colCheck } = await supabase
    .from('protocol_improvement_queue')
    .select('risk_tier')
    .limit(1);

  if (colCheck === null) {
    await executeSQL(`
      ALTER TABLE protocol_improvement_queue
      ADD COLUMN IF NOT EXISTS risk_tier VARCHAR(20) DEFAULT 'GOVERNED'
        CHECK (risk_tier IN ('IMMUTABLE', 'GOVERNED', 'AUTO'))
    `, 'ADD COLUMN risk_tier');
  } else {
    console.log('  ℹ️  Column risk_tier already exists');
  }

  // Step 4: Create improvement_quality_assessments table
  console.log('\n📋 Step 4: Create improvement_quality_assessments table');
  const step4 = await executeSQL(`
    CREATE TABLE IF NOT EXISTS improvement_quality_assessments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      improvement_id UUID REFERENCES protocol_improvement_queue(id) ON DELETE CASCADE,
      evaluator_model VARCHAR(50) NOT NULL,
      score INTEGER CHECK (score BETWEEN 0 AND 100),
      criteria_scores JSONB,
      recommendation VARCHAR(20),
      reasoning TEXT,
      evaluated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, 'CREATE TABLE improvement_quality_assessments');
  if (!step4) hasErrors = true;

  // Step 5: Add priority column
  console.log('\n📋 Step 5: Add priority column to leo_protocol_sections');

  // Check if column exists
  const { data: prioCheck } = await supabase
    .from('leo_protocol_sections')
    .select('priority')
    .limit(1);

  if (prioCheck === null) {
    await executeSQL(`
      ALTER TABLE leo_protocol_sections
      ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'STANDARD'
        CHECK (priority IN ('CORE', 'STANDARD', 'SITUATIONAL'))
    `, 'ADD COLUMN priority');
  } else {
    console.log('  ℹ️  Column priority already exists');
  }

  // Step 6: Create pattern_resolution_signals table
  console.log('\n📋 Step 6: Create pattern_resolution_signals table');
  const step6 = await executeSQL(`
    CREATE TABLE IF NOT EXISTS pattern_resolution_signals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pattern_id VARCHAR(50) NOT NULL,
      signal_type VARCHAR(50) NOT NULL,
      signal_source TEXT,
      confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
      detected_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, 'CREATE TABLE pattern_resolution_signals');
  if (!step6) hasErrors = true;

  // Step 7: Add effectiveness columns
  console.log('\n📋 Step 7: Add effectiveness tracking columns');

  // Check if columns exist
  const { data: effCheck } = await supabase
    .from('protocol_improvement_queue')
    .select('effectiveness_measured_at')
    .limit(1);

  if (effCheck === null) {
    await executeSQL(`
      ALTER TABLE protocol_improvement_queue
      ADD COLUMN IF NOT EXISTS effectiveness_measured_at TIMESTAMPTZ
    `, 'ADD COLUMN effectiveness_measured_at');

    await executeSQL(`
      ALTER TABLE protocol_improvement_queue
      ADD COLUMN IF NOT EXISTS baseline_metric JSONB
    `, 'ADD COLUMN baseline_metric');

    await executeSQL(`
      ALTER TABLE protocol_improvement_queue
      ADD COLUMN IF NOT EXISTS post_metric JSONB
    `, 'ADD COLUMN post_metric');

    await executeSQL(`
      ALTER TABLE protocol_improvement_queue
      ADD COLUMN IF NOT EXISTS rollback_reason TEXT
    `, 'ADD COLUMN rollback_reason');
  } else {
    console.log('  ℹ️  Effectiveness columns already exist');
  }

  // Step 8: Seed constitution rules
  console.log('\n📋 Step 8: Seed constitution rules');

  const constitutionRules = [
    { code: 'CONST-001', text: 'All GOVERNED tier changes require human approval. AI scores inform but never decide.', category: 'governance', rationale: 'Ensures human oversight of significant protocol changes' },
    { code: 'CONST-002', text: 'The system that proposes improvements cannot approve its own proposals.', category: 'safety', rationale: 'Prevents self-serving modifications and maintains separation of duties' },
    { code: 'CONST-003', text: 'All protocol changes must be logged to audit tables with actor, timestamp, and payload.', category: 'audit', rationale: 'Ensures traceability and accountability for all changes' },
    { code: 'CONST-004', text: 'Every applied change must be reversible within the rollback window.', category: 'safety', rationale: 'Enables recovery from bad changes and maintains system stability' },
    { code: 'CONST-005', text: 'All protocol content lives in database tables. CLAUDE.md is generated, never edited directly.', category: 'governance', rationale: 'Ensures single source of truth and prevents configuration drift' },
    { code: 'CONST-006', text: 'New rules cannot be added if they violate token budget. Something must be removed first (zero-sum).', category: 'governance', rationale: 'Prevents protocol bloat and maintains context window efficiency' },
    { code: 'CONST-007', text: 'Maximum 3 AUTO-tier changes per 24-hour cycle. No exceptions.', category: 'safety', rationale: 'Limits velocity of automated changes to allow human oversight' },
    { code: 'CONST-008', text: 'No rule may be removed unless the original retrospective_id that spawned it is retrieved and reviewed.', category: 'governance', rationale: 'Implements Chesterton\'s Fence - understand why before removing' },
    { code: 'CONST-009', text: 'Human can invoke FREEZE command to halt all AUTO changes immediately.', category: 'safety', rationale: 'Provides emergency stop capability for autonomous system' }
  ];

  for (const rule of constitutionRules) {
    const { error } = await supabase
      .from('protocol_constitution')
      .upsert({
        rule_code: rule.code,
        rule_text: rule.text,
        category: rule.category,
        rationale: rule.rationale
      }, { onConflict: 'rule_code' });

    if (error) {
      console.log(`  ❌ Failed to insert ${rule.code}: ${error.message}`);
      hasErrors = true;
    } else {
      console.log(`  ✅ Inserted/updated ${rule.code}`);
    }
  }

  // Step 9: Add constitution rules to leo_protocol_sections
  console.log('\n📋 Step 9: Add constitution to leo_protocol_sections');

  const sectionRules = [
    { title: 'CONST-001: Human Approval Required', content: 'All GOVERNED tier changes require human approval. AI scores inform but never decide.' },
    { title: 'CONST-002: No Self-Approval', content: 'The system that proposes improvements cannot approve its own proposals.' },
    { title: 'CONST-003: Audit Trail', content: 'All protocol changes must be logged to audit tables with actor, timestamp, and payload.' },
    { title: 'CONST-004: Rollback Capability', content: 'Every applied change must be reversible within the rollback window.' },
    { title: 'CONST-005: Database First', content: 'All protocol content lives in database tables. CLAUDE.md is generated, never edited directly.' },
    { title: 'CONST-006: Complexity Conservation', content: 'New rules cannot be added if they violate token budget. Something must be removed first (zero-sum).' },
    { title: 'CONST-007: Velocity Limit', content: 'Maximum 3 AUTO-tier changes per 24-hour cycle. No exceptions.' },
    { title: 'CONST-008: Chesterton\'s Fence', content: 'No rule may be removed unless the original retrospective_id that spawned it is retrieved and reviewed.' },
    { title: 'CONST-009: Emergency Freeze', content: 'Human can invoke FREEZE command to halt all AUTO changes immediately.' }
  ];

  for (const section of sectionRules) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('leo_protocol_sections')
      .select('id')
      .eq('title', section.title)
      .single();

    if (existing) {
      console.log(`  ℹ️  Section ${section.title.substring(0, 20)}... already exists`);
      continue;
    }

    const { error } = await supabase
      .from('leo_protocol_sections')
      .insert({
        section_type: 'constitution',
        title: section.title,
        content: section.content,
        priority: 'CORE'
      });

    if (error) {
      console.log(`  ⚠️  Failed to insert section: ${error.message}`);
    } else {
      console.log(`  ✅ Inserted section: ${section.title.substring(0, 30)}...`);
    }
  }

  // Step 10: Create indexes
  console.log('\n📋 Step 10: Create indexes');

  await executeSQL(`
    CREATE INDEX IF NOT EXISTS idx_improvement_quality_improvement_id
    ON improvement_quality_assessments(improvement_id)
  `, 'CREATE INDEX improvement_quality_improvement_id');

  await executeSQL(`
    CREATE INDEX IF NOT EXISTS idx_pattern_resolution_pattern_id
    ON pattern_resolution_signals(pattern_id)
  `, 'CREATE INDEX pattern_resolution_pattern_id');

  // Verification
  console.log('\n📋 Verification');
  console.log('='.repeat(70));

  // Count constitution rules
  const { data: constCount } = await supabase
    .from('protocol_constitution')
    .select('id', { count: 'exact', head: true });

  console.log(`  Constitution rules: ${constCount?.length || 0} (expected: 9)`);

  // Check tables exist
  const { data: tables } = await supabase
    .from('protocol_constitution')
    .select('rule_code')
    .limit(1);

  console.log(`  protocol_constitution: ${tables ? '✅ exists' : '❌ missing'}`);

  const { data: assessments } = await supabase
    .from('improvement_quality_assessments')
    .select('id')
    .limit(1);

  console.log(`  improvement_quality_assessments: ${assessments !== null ? '✅ exists' : '❌ missing'}`);

  const { data: signals } = await supabase
    .from('pattern_resolution_signals')
    .select('id')
    .limit(1);

  console.log(`  pattern_resolution_signals: ${signals !== null ? '✅ exists' : '❌ missing'}`);

  console.log('\n' + '='.repeat(70));
  if (hasErrors) {
    console.log('⚠️  Migration completed with some errors');
    console.log('   Check the messages above for details');
    process.exit(1);
  } else {
    console.log('✅ Migration completed successfully!');
    console.log('   All Phase 0 infrastructure is in place');
  }
}

applyMigration().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
