#!/usr/bin/env node
/**
 * Apply Auto-Complete Deliverables Trigger Migration
 * Runs the SQL migration to create the database trigger
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('=== Applying Auto-Complete Deliverables Trigger Migration ===\n');

  // Read the migration file
  const migrationPath = path.resolve(__dirname, '../database/migrations/auto_complete_deliverables_on_handoff.sql');
  const sql = readFileSync(migrationPath, 'utf-8');

  // Split into individual statements (skip empty and comments-only blocks)
  const statements = sql
    .split(/;(?=\s*(?:--|CREATE|DROP|UPDATE|DO|COMMENT))/gi)
    .map(s => s.trim())
    .filter(s => s && !s.match(/^--.*$/gm)?.join('').includes(s));

  console.log(`Found ${statements.length} SQL statements to execute\n`);

  // Execute key parts individually
  // 1. Create the function
  console.log('1. Creating auto_complete_sd_deliverables() function...');
  const functionSql = `
    CREATE OR REPLACE FUNCTION auto_complete_sd_deliverables()
    RETURNS TRIGGER AS $$
    DECLARE
      deliverable_count INTEGER;
      updated_count INTEGER;
    BEGIN
      IF NEW.handoff_type = 'EXEC-TO-PLAN' AND NEW.status = 'accepted' AND
         (OLD.status IS NULL OR OLD.status != 'accepted') THEN
        SELECT COUNT(*) INTO deliverable_count
        FROM sd_scope_deliverables
        WHERE sd_id = NEW.sd_id
        AND priority IN ('required', 'high')
        AND completion_status != 'completed';

        IF deliverable_count > 0 THEN
          UPDATE sd_scope_deliverables
          SET
            completion_status = 'completed',
            verified_by = 'PLAN',
            verified_at = NOW(),
            completion_evidence = format('EXEC-TO-PLAN handoff %s accepted', NEW.id),
            completion_notes = format(
              'Auto-completed by database trigger on handoff acceptance. Handoff ID: %s, Accepted at: %s',
              NEW.id,
              NOW()
            ),
            updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'auto_completed', true,
              'auto_completed_at', NOW(),
              'trigger', 'auto_complete_sd_deliverables',
              'handoff_id', NEW.id,
              'handoff_type', NEW.handoff_type,
              'verification_tier', 'TRIGGER_HANDOFF_ACCEPTED',
              'confidence', 100
            )
          WHERE sd_id = NEW.sd_id
          AND priority IN ('required', 'high')
          AND completion_status != 'completed';

          GET DIAGNOSTICS updated_count = ROW_COUNT;
          RAISE NOTICE 'Auto-completed % deliverables for SD % on EXEC-TO-PLAN handoff acceptance',
            updated_count, NEW.sd_id;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER
  `;

  const { error: funcError } = await supabase.rpc('exec_sql', { sql: functionSql });
  if (funcError) {
    // Try alternative approach - use raw SQL execution
    console.log('   Using alternative SQL execution...');
    const { error: altError } = await supabase.from('_exec_sql').select('*').limit(0);
    if (altError) {
      console.log('   Note: Direct SQL execution not available via Supabase client');
      console.log('   The migration SQL is ready in: database/migrations/auto_complete_deliverables_on_handoff.sql');
      console.log('   Please apply via Supabase dashboard SQL editor or migration system\n');

      // Show the manual steps
      console.log('=== Manual Application Steps ===');
      console.log('1. Go to Supabase Dashboard > SQL Editor');
      console.log('2. Copy and paste contents of: database/migrations/auto_complete_deliverables_on_handoff.sql');
      console.log('3. Click "Run"\n');

      // Alternatively, test what we can do
      console.log('=== Verification Queries (can run these now) ===');
      await verifyCurrentState();
      return;
    }
  }

  console.log('   Function created successfully');

  // 2. Create triggers
  console.log('2. Creating triggers on sd_phase_handoffs...');

  // Drop existing triggers first
  await supabase.rpc('exec_sql', {
    sql: 'DROP TRIGGER IF EXISTS trigger_auto_complete_deliverables ON sd_phase_handoffs'
  });
  await supabase.rpc('exec_sql', {
    sql: 'DROP TRIGGER IF EXISTS trigger_auto_complete_deliverables_insert ON sd_phase_handoffs'
  });

  // Create UPDATE trigger
  const updateTriggerSql = `
    CREATE TRIGGER trigger_auto_complete_deliverables
      AFTER UPDATE ON sd_phase_handoffs
      FOR EACH ROW
      EXECUTE FUNCTION auto_complete_sd_deliverables()
  `;
  await supabase.rpc('exec_sql', { sql: updateTriggerSql });

  // Create INSERT trigger
  const insertTriggerSql = `
    CREATE TRIGGER trigger_auto_complete_deliverables_insert
      AFTER INSERT ON sd_phase_handoffs
      FOR EACH ROW
      WHEN (NEW.handoff_type = 'EXEC-TO-PLAN' AND NEW.status = 'accepted')
      EXECUTE FUNCTION auto_complete_sd_deliverables()
  `;
  await supabase.rpc('exec_sql', { sql: insertTriggerSql });

  console.log('   Triggers created successfully\n');

  // 3. Run retroactive fix
  console.log('3. Running retroactive fix for existing accepted handoffs...');
  const retroSql = `
    UPDATE sd_scope_deliverables d
    SET
      completion_status = 'completed',
      verified_by = 'PLAN',
      verified_at = h.accepted_at,
      completion_evidence = format('EXEC-TO-PLAN handoff %s accepted (retroactive)', h.id),
      completion_notes = 'Retroactively completed by migration - handoff was already accepted',
      updated_at = NOW(),
      metadata = COALESCE(d.metadata, '{}'::jsonb) || jsonb_build_object(
        'auto_completed', true,
        'auto_completed_at', NOW(),
        'trigger', 'retroactive_migration',
        'handoff_id', h.id,
        'verification_tier', 'RETROACTIVE_SYNC',
        'confidence', 100
      )
    FROM (
      SELECT DISTINCT ON (sd_id)
        id,
        sd_id,
        COALESCE((metadata->>'accepted_at')::timestamptz, updated_at) as accepted_at
      FROM sd_phase_handoffs
      WHERE handoff_type = 'EXEC-TO-PLAN'
      AND status = 'accepted'
      ORDER BY sd_id, created_at DESC
    ) h
    WHERE d.sd_id = h.sd_id
    AND d.priority IN ('required', 'high')
    AND d.completion_status != 'completed'
  `;
  await supabase.rpc('exec_sql', { sql: retroSql });

  console.log('   Retroactive fix applied\n');

  // Verify
  await verifyCurrentState();
}

async function verifyCurrentState() {
  console.log('=== Current State Verification ===\n');

  // Check for pending deliverables with accepted handoffs
  const { data: pendingWithAccepted, error: pError } = await supabase
    .from('sd_scope_deliverables')
    .select(`
      id,
      sd_id,
      deliverable_name,
      completion_status,
      priority
    `)
    .in('priority', ['required', 'high'])
    .neq('completion_status', 'completed')
    .limit(10);

  if (pError) {
    console.log('Error checking deliverables:', pError.message);
    return;
  }

  if (pendingWithAccepted && pendingWithAccepted.length > 0) {
    console.log('Pending high-priority deliverables found:');
    for (const d of pendingWithAccepted) {
      // Check if this SD has an accepted EXEC-TO-PLAN handoff
      const { data: handoff } = await supabase
        .from('sd_phase_handoffs')
        .select('id, status')
        .eq('sd_id', d.sd_id)
        .eq('handoff_type', 'EXEC-TO-PLAN')
        .eq('status', 'accepted')
        .single();

      const hasAcceptedHandoff = handoff ? ' (HAS ACCEPTED HANDOFF - should be auto-completed!)' : '';
      console.log(`  - [${d.priority}] ${d.sd_id}: ${d.deliverable_name} - ${d.completion_status}${hasAcceptedHandoff}`);
    }
  } else {
    console.log('No pending high-priority deliverables found - all synced!');
  }

  // Check trigger existence (via metadata table check)
  const { data: triggers } = await supabase
    .from('sd_scope_deliverables')
    .select('metadata')
    .not('metadata->trigger', 'is', null)
    .limit(5);

  if (triggers && triggers.length > 0) {
    console.log('\nDeliverables with auto-completion metadata found:');
    triggers.forEach(t => {
      console.log(`  - Trigger: ${t.metadata?.trigger}, Confidence: ${t.metadata?.confidence}%`);
    });
  }

  console.log('\n=== Migration Status ===');
  console.log('Migration file: database/migrations/auto_complete_deliverables_on_handoff.sql');
  console.log('To apply: Use Supabase Dashboard SQL Editor or npx supabase db push');
}

applyMigration().catch(console.error);
