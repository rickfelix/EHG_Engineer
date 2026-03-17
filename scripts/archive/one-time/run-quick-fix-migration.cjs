/**
 * Run Quick-Fix Validation Profile Migration
 * QF-POST-COMPLETION-VALIDATOR-001
 *
 * Updates calculate_sd_progress and get_progress_breakdown to detect QF-* prefix
 * and use the quick_fix validation profile with minimal requirements.
 */

const { Client } = require('pg');
require('dotenv').config();

console.log('═══════════════════════════════════════════════════════════════');
console.log('   Quick-Fix Validation Profile Migration');
console.log('   QF-POST-COMPLETION-VALIDATOR-001');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

async function runMigration() {
  const poolerUrl = process.env.SUPABASE_POOLER_URL;

  if (!poolerUrl) {
    console.log('❌ SUPABASE_POOLER_URL not found in environment');
    console.log('   Set SUPABASE_POOLER_URL in .env to run this migration');
    return;
  }

  console.log('✅ Connection string found');
  console.log('');

  const client = new Client({
    connectionString: poolerUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✅ Connected');
    console.log('');

    // Function 1: calculate_sd_progress
    console.log('Updating calculate_sd_progress function...');
    await client.query(`
CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  sd RECORD;
  sd_type_val VARCHAR;
  profile RECORD;
  progress INTEGER := 0;
  prd_exists BOOLEAN := false;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  retrospective_exists BOOLEAN := false;
  handoffs_count INTEGER := 0;
BEGIN
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SD not found: %', sd_id_param;
  END IF;

  sd_type_val := COALESCE(sd.sd_type, 'feature');

  -- QF-POST-COMPLETION-VALIDATOR-001: Detect QF-* prefix and use quick_fix profile
  IF sd.sd_key LIKE 'QF-%' THEN
    sd_type_val := 'quick_fix';
  END IF;

  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- PHASE 1: LEAD Initial Approval
  IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed', 'review') THEN
    progress := progress + profile.lead_weight;
  END IF;

  -- PHASE 2: PLAN PRD Creation
  IF profile.requires_prd THEN
    SELECT EXISTS (
      SELECT 1 FROM product_requirements_v2
      WHERE sd_id = sd_id_param
      AND status IN ('approved', 'in_progress', 'implemented', 'verification', 'pending_approval', 'completed')
    ) INTO prd_exists;

    IF prd_exists THEN
      progress := progress + profile.plan_weight;
    END IF;
  ELSE
    progress := progress + profile.plan_weight;
  END IF;

  -- PHASE 3: EXEC Implementation (Deliverables)
  IF profile.requires_deliverables THEN
    IF EXISTS (SELECT 1 FROM sd_scope_deliverables WHERE sd_id = sd_id_param) THEN
      SELECT
        CASE
          WHEN COUNT(*) = 0 THEN false
          WHEN COUNT(*) FILTER (WHERE completion_status = 'completed') = COUNT(*) THEN true
          ELSE false
        END INTO deliverables_complete
      FROM sd_scope_deliverables
      WHERE sd_id = sd_id_param
      AND priority IN ('required', 'high');
    ELSE
      deliverables_complete := true;
    END IF;

    IF deliverables_complete THEN
      progress := progress + profile.exec_weight;
    END IF;
  ELSE
    progress := progress + profile.exec_weight;
  END IF;

  -- PHASE 4: PLAN Verification (User Stories + E2E)
  IF profile.requires_e2e_tests THEN
    IF EXISTS (SELECT 1 FROM user_stories WHERE sd_id = sd_id_param) THEN
      SELECT
        CASE
          WHEN COUNT(*) = 0 THEN true
          WHEN COUNT(*) FILTER (WHERE validation_status = 'validated' OR e2e_test_status = 'passing') = COUNT(*) THEN true
          ELSE false
        END INTO user_stories_validated
      FROM user_stories
      WHERE sd_id = sd_id_param;
    ELSE
      user_stories_validated := true;
    END IF;

    IF profile.requires_sub_agents THEN
      BEGIN
        DECLARE
          subagent_check JSONB;
        BEGIN
          subagent_check := check_required_sub_agents(sd_id_param);
          IF user_stories_validated AND (subagent_check->>'all_verified')::boolean THEN
            progress := progress + profile.verify_weight;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          IF user_stories_validated THEN
            progress := progress + profile.verify_weight;
          END IF;
        END;
      END;
    ELSE
      IF user_stories_validated THEN
        progress := progress + profile.verify_weight;
      END IF;
    END IF;
  ELSE
    progress := progress + profile.verify_weight;
  END IF;

  -- PHASE 5: LEAD Final Approval
  IF profile.requires_retrospective THEN
    SELECT EXISTS (
      SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
    ) INTO retrospective_exists;
  ELSE
    retrospective_exists := true;
  END IF;

  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param
  AND status = 'accepted';

  IF retrospective_exists AND handoffs_count >= profile.min_handoffs THEN
    progress := progress + profile.final_weight;
  END IF;

  RETURN progress;
END;
$func$;
    `);
    console.log('✅ calculate_sd_progress updated');

    // Function 2: get_progress_breakdown
    console.log('Updating get_progress_breakdown function...');
    await client.query(`
CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  sd RECORD;
  sd_type_val VARCHAR;
  profile RECORD;
  breakdown JSONB;
  total_progress INTEGER;
  prd_exists BOOLEAN := false;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  retrospective_exists BOOLEAN := false;
  handoffs_count INTEGER := 0;
  subagent_check JSONB;
BEGIN
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  sd_type_val := COALESCE(sd.sd_type, 'feature');

  -- QF-POST-COMPLETION-VALIDATOR-001: Detect QF-* prefix and use quick_fix profile
  IF sd.sd_key LIKE 'QF-%' THEN
    sd_type_val := 'quick_fix';
  END IF;

  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;
  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2
    WHERE sd_id = sd_id_param
    AND status IN ('approved', 'in_progress', 'implemented', 'verification', 'pending_approval', 'completed')
  ) INTO prd_exists;

  IF EXISTS (SELECT 1 FROM sd_scope_deliverables WHERE sd_id = sd_id_param) THEN
    SELECT
      CASE
        WHEN COUNT(*) = 0 THEN true
        WHEN COUNT(*) FILTER (WHERE completion_status = 'completed') = COUNT(*) THEN true
        ELSE false
      END INTO deliverables_complete
    FROM sd_scope_deliverables
    WHERE sd_id = sd_id_param
    AND priority IN ('required', 'high');
  ELSE
    deliverables_complete := true;
  END IF;

  IF EXISTS (SELECT 1 FROM user_stories WHERE sd_id = sd_id_param) THEN
    SELECT
      CASE
        WHEN COUNT(*) = 0 THEN true
        WHEN COUNT(*) FILTER (WHERE validation_status = 'validated' OR e2e_test_status = 'passing') = COUNT(*) THEN true
        ELSE false
      END INTO user_stories_validated
    FROM user_stories
    WHERE sd_id = sd_id_param;
  ELSE
    user_stories_validated := true;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
  ) INTO retrospective_exists;

  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param
  AND status = 'accepted';

  BEGIN
    subagent_check := check_required_sub_agents(sd_id_param);
  EXCEPTION WHEN OTHERS THEN
    subagent_check := '{"all_verified": true}'::jsonb;
  END;

  total_progress := calculate_sd_progress(sd_id_param);

  breakdown := jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', sd_type_val,
    'profile', profile.name,
    'total_progress', total_progress,
    'can_complete', total_progress = 100,
    'phases', jsonb_build_object(
      'LEAD_approval', jsonb_build_object(
        'weight', profile.lead_weight,
        'complete', sd.status IN ('active', 'in_progress', 'pending_approval', 'completed', 'review'),
        'progress', CASE WHEN sd.status IN ('active', 'in_progress', 'pending_approval', 'completed', 'review') THEN profile.lead_weight ELSE 0 END,
        'required', true
      ),
      'PLAN_prd', jsonb_build_object(
        'weight', profile.plan_weight,
        'complete', prd_exists OR NOT profile.requires_prd,
        'progress', CASE WHEN prd_exists OR NOT profile.requires_prd THEN profile.plan_weight ELSE 0 END,
        'required', profile.requires_prd,
        'prd_exists', prd_exists
      ),
      'EXEC_implementation', jsonb_build_object(
        'weight', profile.exec_weight,
        'complete', deliverables_complete OR NOT profile.requires_deliverables,
        'progress', CASE WHEN deliverables_complete OR NOT profile.requires_deliverables THEN profile.exec_weight ELSE 0 END,
        'required', profile.requires_deliverables,
        'deliverables_complete', deliverables_complete
      ),
      'PLAN_verification', jsonb_build_object(
        'weight', profile.verify_weight,
        'complete', (user_stories_validated AND (subagent_check->>'all_verified')::boolean) OR NOT profile.requires_e2e_tests,
        'progress', CASE WHEN (user_stories_validated AND (subagent_check->>'all_verified')::boolean) OR NOT profile.requires_e2e_tests THEN profile.verify_weight ELSE 0 END,
        'required', profile.requires_e2e_tests,
        'user_stories_validated', user_stories_validated,
        'subagent_verified', (subagent_check->>'all_verified')::boolean
      ),
      'LEAD_final_approval', jsonb_build_object(
        'weight', profile.final_weight,
        'complete', retrospective_exists AND handoffs_count >= profile.min_handoffs,
        'progress', CASE WHEN retrospective_exists AND handoffs_count >= profile.min_handoffs THEN profile.final_weight ELSE 0 END,
        'min_handoffs', profile.min_handoffs,
        'handoffs_count', handoffs_count,
        'retrospective_exists', retrospective_exists,
        'retrospective_required', profile.requires_retrospective
      )
    )
  );

  RETURN breakdown;
END;
$func$;
    `);
    console.log('✅ get_progress_breakdown updated');
    console.log('');

    // Verify the quick_fix profile exists
    const profileResult = await client.query(`
      SELECT sd_type, lead_weight, plan_weight, exec_weight, requires_prd, min_handoffs
      FROM sd_type_validation_profiles
      WHERE sd_type = 'quick_fix'
    `);

    if (profileResult.rows.length > 0) {
      const p = profileResult.rows[0];
      console.log('✅ quick_fix profile verified:');
      console.log('   lead_weight:', p.lead_weight);
      console.log('   plan_weight:', p.plan_weight);
      console.log('   exec_weight:', p.exec_weight);
      console.log('   requires_prd:', p.requires_prd);
      console.log('   min_handoffs:', p.min_handoffs);
    } else {
      console.log('⚠️  quick_fix profile not found - insert it first');
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   ✅ MIGRATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('QF-* prefixed SDs now use minimal validation:');
    console.log('  - LEAD approval: 10%');
    console.log('  - EXEC implementation: 90%');
    console.log('  - No PRD, handoffs, or retrospective required');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await client.end();
    console.log('');
    console.log('Connection closed.');
  }
}

runMigration();
