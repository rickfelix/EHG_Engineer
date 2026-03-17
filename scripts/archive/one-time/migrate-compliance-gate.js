#!/usr/bin/env node
/**
 * SD-LIFECYCLE-GAP-002: Compliance Gate Migration
 *
 * Updates fn_advance_venture_stage() to enforce compliance gate at Stage 20→21 transition
 *
 * Prerequisites:
 * - evaluate_stage20_compliance_gate(UUID, UUID)
 * - record_compliance_gate_passed(UUID, UUID)
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

const MIGRATION_SQL_FUNCTION = `
CREATE OR REPLACE FUNCTION fn_advance_venture_stage(
  p_venture_id UUID,
  p_from_stage INTEGER,
  p_to_stage INTEGER,
  p_handoff_data JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  v_result JSONB;
  v_gate_result JSONB;
  v_user_id UUID;
BEGIN
  -- Validate venture exists and get current stage
  SELECT current_lifecycle_stage, name INTO v_current_stage, v_venture_name
  FROM ventures
  WHERE id = p_venture_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Venture not found',
      'venture_id', p_venture_id
    );
  END IF;

  -- Validate from_stage matches current
  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stage mismatch - current stage does not match from_stage',
      'venture_id', p_venture_id,
      'current_stage', v_current_stage,
      'from_stage', p_from_stage
    );
  END IF;

  -- Validate to_stage is valid (1-25 range, must be from_stage + 1 for normal advancement)
  IF p_to_stage < 1 OR p_to_stage > 25 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid to_stage - must be between 1 and 25',
      'to_stage', p_to_stage
    );
  END IF;

  -- ============================================================================
  -- SD-LIFECYCLE-GAP-002: COMPLIANCE GATE CHECK AT STAGE 20
  -- ============================================================================
  IF p_from_stage = 20 AND p_to_stage = 21 THEN
    -- Get user_id from handoff_data if available
    v_user_id := (p_handoff_data->>'user_id')::UUID;

    -- Evaluate the compliance gate
    v_gate_result := evaluate_stage20_compliance_gate(p_venture_id, v_user_id);

    -- Check if gate evaluation succeeded
    IF NOT (v_gate_result->>'success')::BOOLEAN THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Compliance gate evaluation failed: ' || (v_gate_result->>'error'),
        'venture_id', p_venture_id,
        'from_stage', p_from_stage,
        'to_stage', p_to_stage,
        'gate_result', v_gate_result
      );
    END IF;

    -- Check if gate passed
    IF (v_gate_result->>'outcome') = 'FAIL' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Compliance gate blocked: ' ||
                 (v_gate_result->>'required_total')::INT - (v_gate_result->>'required_complete')::INT ||
                 ' required item(s) incomplete',
        'venture_id', p_venture_id,
        'from_stage', p_from_stage,
        'to_stage', p_to_stage,
        'gate_status', 'BLOCKED',
        'required_total', v_gate_result->>'required_total',
        'required_complete', v_gate_result->>'required_complete',
        'required_percentage', v_gate_result->>'required_percentage',
        'missing_required_items', v_gate_result->'missing_required_items',
        'archetype', v_gate_result->>'archetype',
        'checklist_version', v_gate_result->>'checklist_version'
      );
    END IF;

    -- Gate passed - record the event
    PERFORM record_compliance_gate_passed(p_venture_id, v_user_id);
  END IF;
  -- ============================================================================

  -- Update ventures table
  UPDATE ventures
  SET current_lifecycle_stage = p_to_stage,
      updated_at = NOW()
  WHERE id = p_venture_id;

  -- Mark the from_stage work as completed (if venture_stage_work table exists)
  UPDATE venture_stage_work
  SET stage_status = 'completed',
      health_score = 100,
      completed_at = NOW()
  WHERE venture_id = p_venture_id
    AND stage_id = p_from_stage;

  -- Log the transition (if venture_stage_transitions table exists)
  INSERT INTO venture_stage_transitions (
    venture_id,
    from_stage,
    to_stage,
    transition_type,
    approved_by,
    approved_at,
    handoff_data,
    created_at
  )
  VALUES (
    p_venture_id,
    p_from_stage,
    p_to_stage,
    'normal',
    COALESCE(p_handoff_data->>'ceo_agent_id', 'system'),
    NOW(),
    p_handoff_data,
    NOW()
  )
  ON CONFLICT DO NOTHING;

  -- Build success result
  v_result := jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture_name,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage,
    'transitioned_at', NOW()
  );

  -- Add gate info if Stage 20 transition
  IF p_from_stage = 20 AND p_to_stage = 21 THEN
    v_result := v_result || jsonb_build_object(
      'gate_status', 'PASSED',
      'compliance_gate', v_gate_result
    );
  END IF;

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'venture_id', p_venture_id,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage
  );
END;
$fn$;
`;

const MIGRATION_SQL_COMMENT = `
COMMENT ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB) IS
'Advances a venture from one stage to the next.
Updated for SD-LIFECYCLE-GAP-002: Enforces compliance gate at Stage 20.

Parameters:
- p_venture_id: UUID of the venture
- p_from_stage: Current stage (must match ventures.current_lifecycle_stage)
- p_to_stage: Target stage
- p_handoff_data: Optional JSONB with approval details (can include user_id for gate logging)

Returns JSONB with success status and transition details.
Stage 20→21 transitions will be BLOCKED if compliance gate fails.';
`;

async function main() {
  let client;

  try {
    console.log('🗄️  SD-LIFECYCLE-GAP-002: Compliance Gate Migration\n');

    // Connect to database
    console.log('📡 Connecting to database...');
    client = await createDatabaseClient('engineer', {
      verify: true,
      verbose: true
    });

    // Step 1: Verify prerequisite functions exist
    console.log('\n🔍 Verifying prerequisite functions...');
    const prereqCheck = await client.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_name IN ('evaluate_stage20_compliance_gate', 'record_compliance_gate_passed')
      ORDER BY routine_name;
    `);

    const foundFunctions = prereqCheck.rows.map(r => r.routine_name);
    console.log(`   Found ${foundFunctions.length}/2 prerequisite functions:`);
    foundFunctions.forEach(fn => console.log(`   ✅ ${fn}`));

    const missingFunctions = ['evaluate_stage20_compliance_gate', 'record_compliance_gate_passed']
      .filter(fn => !foundFunctions.includes(fn));

    if (missingFunctions.length > 0) {
      console.error('\n❌ ERROR: Missing prerequisite functions:');
      missingFunctions.forEach(fn => console.error(`   ❌ ${fn}`));
      console.error('\nPlease run the prerequisite migrations first.');
      process.exit(1);
    }

    // Step 2: Check if fn_advance_venture_stage exists
    console.log('\n🔍 Checking current function state...');
    const currentCheck = await client.query(`
      SELECT routine_name,
             pg_get_functiondef(p.oid) AS definition
      FROM information_schema.routines r
      JOIN pg_proc p ON p.proname = r.routine_name
      WHERE routine_schema = 'public'
        AND routine_name = 'fn_advance_venture_stage'
      LIMIT 1;
    `);

    if (currentCheck.rows.length > 0) {
      const currentDef = currentCheck.rows[0].definition;
      if (currentDef.includes('SD-LIFECYCLE-GAP-002')) {
        console.log('   ℹ️  Function already contains SD-LIFECYCLE-GAP-002 logic');
        console.log('   ⚠️  Proceeding with CREATE OR REPLACE to update...');
      } else {
        console.log('   ✅ Function exists without compliance gate logic');
        console.log('   📝 Will update to add Stage 20 compliance gate enforcement');
      }
    } else {
      console.log('   ℹ️  Function does not exist, will create new');
    }

    // Step 3: Execute migration - function creation
    console.log('\n🚀 Executing migration (1/2): Creating function...');
    await client.query(MIGRATION_SQL_FUNCTION);
    console.log('   ✅ Function created/updated');

    // Step 4: Execute migration - comment
    console.log('\n🚀 Executing migration (2/2): Adding comment...');
    await client.query(MIGRATION_SQL_COMMENT);
    console.log('   ✅ Comment added');

    // Step 5: Verify the migration
    console.log('\n✅ Verifying migration...');
    const verifyResult = await client.query(`
      SELECT routine_name,
             pg_get_functiondef(p.oid) AS definition
      FROM information_schema.routines r
      JOIN pg_proc p ON p.proname = r.routine_name
      WHERE routine_schema = 'public'
        AND routine_name = 'fn_advance_venture_stage'
      LIMIT 1;
    `);

    if (verifyResult.rows.length === 0) {
      throw new Error('Function not found after migration!');
    }

    const newDef = verifyResult.rows[0].definition;

    // Check for key compliance gate logic
    const checks = [
      { pattern: 'SD-LIFECYCLE-GAP-002', label: 'SD reference' },
      { pattern: 'evaluate_stage20_compliance_gate', label: 'Gate evaluation call' },
      { pattern: 'record_compliance_gate_passed', label: 'Gate recording call' },
      { pattern: 'p_from_stage = 20 AND p_to_stage = 21', label: 'Stage 20→21 check' },
      { pattern: 'Compliance gate blocked', label: 'Blocked message' }
    ];

    let allChecksPass = true;
    for (const check of checks) {
      const found = newDef.includes(check.pattern);
      console.log(`   ${found ? '✅' : '❌'} ${check.label}`);
      if (!found) allChecksPass = false;
    }

    if (!allChecksPass) {
      throw new Error('Migration verification failed - function missing expected logic');
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   • fn_advance_venture_stage() updated');
    console.log('   • Stage 20→21 transitions now enforce compliance gate');
    console.log('   • Blocked transitions return detailed failure info');
    console.log('   • Successful transitions record gate passage');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

main();
