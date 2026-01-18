#!/usr/bin/env node
/**
 * Run the compliance gate function migration
 * This script runs the SQL that updates fn_advance_venture_stage
 * with the Stage 20 compliance gate check
 */

import dotenv from 'dotenv';
import pkg from 'pg';
const { Client } = pkg;

dotenv.config();

const functionSQL = `
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
  SELECT current_lifecycle_stage, name INTO v_current_stage, v_venture_name
  FROM ventures WHERE id = p_venture_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venture not found', 'venture_id', p_venture_id);
  END IF;

  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stage mismatch', 'venture_id', p_venture_id, 'current_stage', v_current_stage, 'from_stage', p_from_stage);
  END IF;

  IF p_to_stage < 1 OR p_to_stage > 25 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid to_stage', 'to_stage', p_to_stage);
  END IF;

  -- SD-LIFECYCLE-GAP-002: COMPLIANCE GATE CHECK AT STAGE 20
  IF p_from_stage = 20 AND p_to_stage = 21 THEN
    v_user_id := (p_handoff_data->>'user_id')::UUID;
    v_gate_result := evaluate_stage20_compliance_gate(p_venture_id, v_user_id);

    IF NOT (v_gate_result->>'success')::BOOLEAN THEN
      RETURN jsonb_build_object('success', false, 'error', 'Compliance gate evaluation failed: ' || (v_gate_result->>'error'), 'venture_id', p_venture_id, 'gate_result', v_gate_result);
    END IF;

    IF (v_gate_result->>'outcome') = 'FAIL' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Compliance gate blocked: ' || ((v_gate_result->>'required_total')::INT - (v_gate_result->>'required_complete')::INT) || ' required item(s) incomplete',
        'venture_id', p_venture_id,
        'gate_status', 'BLOCKED',
        'required_total', v_gate_result->>'required_total',
        'required_complete', v_gate_result->>'required_complete',
        'missing_required_items', v_gate_result->'missing_required_items',
        'archetype', v_gate_result->>'archetype'
      );
    END IF;

    PERFORM record_compliance_gate_passed(p_venture_id, v_user_id);
  END IF;

  UPDATE ventures SET current_lifecycle_stage = p_to_stage, updated_at = NOW() WHERE id = p_venture_id;

  UPDATE venture_stage_work SET stage_status = 'completed', health_score = 100, completed_at = NOW()
  WHERE venture_id = p_venture_id AND stage_id = p_from_stage;

  INSERT INTO venture_stage_transitions (venture_id, from_stage, to_stage, transition_type, approved_by, approved_at, handoff_data, created_at)
  VALUES (p_venture_id, p_from_stage, p_to_stage, 'normal', COALESCE(p_handoff_data->>'ceo_agent_id', 'system'), NOW(), p_handoff_data, NOW())
  ON CONFLICT DO NOTHING;

  v_result := jsonb_build_object('success', true, 'venture_id', p_venture_id, 'venture_name', v_venture_name, 'from_stage', p_from_stage, 'to_stage', p_to_stage, 'transitioned_at', NOW());

  IF p_from_stage = 20 AND p_to_stage = 21 THEN
    v_result := v_result || jsonb_build_object('gate_status', 'PASSED', 'compliance_gate', v_gate_result);
  END IF;

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'venture_id', p_venture_id, 'from_stage', p_from_stage, 'to_stage', p_to_stage);
END;
$fn$;
`;

const commentSQL = `
COMMENT ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB) IS
'Advances a venture from one stage to the next.
Updated for SD-LIFECYCLE-GAP-002: Enforces compliance gate at Stage 20.
Stage 20→21 transitions will be BLOCKED if compliance gate fails.';
`;

async function runMigration() {
  // Check for DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.log('❌ DATABASE_URL not found in environment');
    console.log('');
    console.log('To run this migration, you need to:');
    console.log('1. Go to Supabase Dashboard → Project Settings → Database');
    console.log('2. Copy the Connection String (URI)');
    console.log('3. Add to .env: DATABASE_URL=postgresql://...');
    console.log('');
    console.log('Or run this SQL directly in Supabase SQL Editor:');
    console.log('='.repeat(60));
    console.log(functionSQL);
    console.log(commentSQL);
    console.log('='.repeat(60));
    return;
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected');

    console.log('📝 Creating function fn_advance_venture_stage...');
    await client.query(functionSQL);
    console.log('✅ Function created');

    console.log('📝 Adding comment...');
    await client.query(commentSQL);
    console.log('✅ Comment added');

    console.log('');
    console.log('✅ Migration complete!');
    console.log('   fn_advance_venture_stage now enforces compliance gate at Stage 20');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
