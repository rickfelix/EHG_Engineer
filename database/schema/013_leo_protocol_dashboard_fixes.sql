-- LEO Protocol Dashboard Schema Fixes
-- Follow-up to PR-1 addressing review feedback
-- Date: 2025-01-16
-- Transaction-wrapped for atomicity

BEGIN;

-- ============================================
-- 1. CREATE ENUM TYPES (Idempotent)
-- ============================================

-- Gate type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gate_type') THEN
    CREATE TYPE gate_type AS ENUM ('2A', '2B', '2C', '2D', '3');
  END IF;
EXCEPTION WHEN duplicate_object THEN 
  NULL;
END $$;

-- Execution status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'execution_status') THEN
    CREATE TYPE execution_status AS ENUM ('pending', 'running', 'pass', 'fail', 'error', 'timeout');
  END IF;
EXCEPTION WHEN duplicate_object THEN 
  NULL;
END $$;

-- Alert severity enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_severity') THEN
    CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'error', 'critical');
  END IF;
EXCEPTION WHEN duplicate_object THEN 
  NULL;
END $$;

-- Alert type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_type') THEN
    CREATE TYPE alert_type AS ENUM ('filesystem_drift', 'boundary_violation', 'missing_artifact', 'gate_failure', 'timeout');
  END IF;
EXCEPTION WHEN duplicate_object THEN 
  NULL;
END $$;

-- ============================================
-- 2. ALTER COLUMNS TO USE ENUMS (Safe)
-- ============================================

-- Convert gate column to enum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'leo_gate_reviews' 
             AND column_name = 'gate' 
             AND data_type = 'text') THEN
    ALTER TABLE leo_gate_reviews 
      ALTER COLUMN gate TYPE gate_type USING gate::gate_type;
  END IF;
END $$;

-- Convert status column to enum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'sub_agent_executions' 
             AND column_name = 'status' 
             AND data_type = 'text') THEN
    ALTER TABLE sub_agent_executions 
      ALTER COLUMN status TYPE execution_status USING status::execution_status;
  END IF;
END $$;

-- Convert alert columns to enums
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'compliance_alerts' 
             AND column_name = 'severity' 
             AND data_type = 'text') THEN
    ALTER TABLE compliance_alerts 
      ALTER COLUMN severity TYPE alert_severity USING severity::alert_severity,
      ALTER COLUMN alert_type TYPE alert_type USING alert_type::alert_type;
  END IF;
END $$;

-- ============================================
-- 3. ADD FOREIGN KEY CONSTRAINTS (Idempotent)
-- ============================================

-- Check if prds table exists before adding FKs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'prds') THEN
    -- leo_gate_reviews FK
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'fk_gate_reviews_prd') THEN
      ALTER TABLE leo_gate_reviews 
        ADD CONSTRAINT fk_gate_reviews_prd 
        FOREIGN KEY (prd_id) REFERENCES prds(id) ON DELETE RESTRICT;
    END IF;

    -- leo_adrs FK
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'fk_adrs_prd') THEN
      ALTER TABLE leo_adrs 
        ADD CONSTRAINT fk_adrs_prd 
        FOREIGN KEY (prd_id) REFERENCES prds(id) ON DELETE RESTRICT;
    END IF;

    -- leo_interfaces FK
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'fk_interfaces_prd') THEN
      ALTER TABLE leo_interfaces 
        ADD CONSTRAINT fk_interfaces_prd 
        FOREIGN KEY (prd_id) REFERENCES prds(id) ON DELETE RESTRICT;
    END IF;

    -- leo_test_plans FK
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'fk_test_plans_prd') THEN
      ALTER TABLE leo_test_plans 
        ADD CONSTRAINT fk_test_plans_prd 
        FOREIGN KEY (prd_id) REFERENCES prds(id) ON DELETE RESTRICT;
    END IF;

    -- leo_nfr_requirements FK
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'fk_nfr_prd') THEN
      ALTER TABLE leo_nfr_requirements 
        ADD CONSTRAINT fk_nfr_prd 
        FOREIGN KEY (prd_id) REFERENCES prds(id) ON DELETE RESTRICT;
    END IF;

    -- leo_risk_spikes FK
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'fk_risk_spikes_prd') THEN
      ALTER TABLE leo_risk_spikes 
        ADD CONSTRAINT fk_risk_spikes_prd 
        FOREIGN KEY (prd_id) REFERENCES prds(id) ON DELETE RESTRICT;
    END IF;

    -- sub_agent_executions FK
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'fk_sub_agent_exec_prd') THEN
      ALTER TABLE sub_agent_executions 
        ADD CONSTRAINT fk_sub_agent_exec_prd 
        FOREIGN KEY (prd_id) REFERENCES prds(id) ON DELETE RESTRICT;
    END IF;

    -- leo_artifacts FK
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'fk_artifacts_prd') THEN
      ALTER TABLE leo_artifacts 
        ADD CONSTRAINT fk_artifacts_prd 
        FOREIGN KEY (prd_id) REFERENCES prds(id) ON DELETE RESTRICT;
    END IF;
  ELSE
    RAISE NOTICE 'PRDs table does not exist - skipping FK constraints';
  END IF;
END $$;

-- ============================================
-- 4. ENHANCED RLS POLICIES (Role-based)
-- ============================================

-- Note: These policies use Supabase auth helpers
-- auth.role() returns the JWT role claim
-- auth.uid() returns the authenticated user ID
-- For non-Supabase deployments, replace with appropriate auth functions

-- Drop all generic "Enable read access for all users" policies
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE policyname = 'Enable read access for all users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- leo_gate_reviews policies
DROP POLICY IF EXISTS "Read access for authenticated" ON leo_gate_reviews;
DROP POLICY IF EXISTS "Write access for CI only" ON leo_gate_reviews;
DROP POLICY IF EXISTS "Update access for CI only" ON leo_gate_reviews;

CREATE POLICY "leo_gate_reviews_select" ON leo_gate_reviews
  FOR SELECT 
  USING (true);  -- Public read for dashboard

CREATE POLICY "leo_gate_reviews_insert" ON leo_gate_reviews
  FOR INSERT 
  WITH CHECK (
    auth.role() = 'service_role' OR 
    auth.jwt() ->> 'role' = 'ci_automation' OR
    current_setting('app.context', true) = 'gate_validator'
  );

CREATE POLICY "leo_gate_reviews_update" ON leo_gate_reviews
  FOR UPDATE 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- sub_agent_executions policies
DROP POLICY IF EXISTS "sub_agent_exec_select" ON sub_agent_executions;
DROP POLICY IF EXISTS "sub_agent_exec_insert" ON sub_agent_executions;
DROP POLICY IF EXISTS "sub_agent_exec_update" ON sub_agent_executions;

CREATE POLICY "sub_agent_exec_select" ON sub_agent_executions
  FOR SELECT 
  USING (true);  -- Public read

CREATE POLICY "sub_agent_exec_insert" ON sub_agent_executions
  FOR INSERT 
  WITH CHECK (
    auth.role() = 'service_role' OR 
    auth.jwt() ->> 'role' = 'ci_automation' OR
    current_setting('app.context', true) = 'sub_agent_scanner'
  );

CREATE POLICY "sub_agent_exec_update" ON sub_agent_executions
  FOR UPDATE 
  USING (
    auth.role() = 'service_role' OR
    current_setting('app.context', true) = 'sub_agent_scanner'
  )
  WITH CHECK (
    auth.role() = 'service_role' OR
    current_setting('app.context', true) = 'sub_agent_scanner'
  );

-- compliance_alerts policies
DROP POLICY IF EXISTS "compliance_alerts_select" ON compliance_alerts;
DROP POLICY IF EXISTS "compliance_alerts_insert" ON compliance_alerts;
DROP POLICY IF EXISTS "compliance_alerts_update" ON compliance_alerts;

CREATE POLICY "compliance_alerts_select" ON compliance_alerts
  FOR SELECT 
  USING (true);  -- Public read

CREATE POLICY "compliance_alerts_insert" ON compliance_alerts
  FOR INSERT 
  WITH CHECK (
    auth.role() = 'service_role' OR 
    current_setting('app.context', true) = 'drift_checker'
  );

CREATE POLICY "compliance_alerts_update" ON compliance_alerts
  FOR UPDATE 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Mirror policies for PLAN+ artifact tables
-- leo_adrs
CREATE POLICY "leo_adrs_select" ON leo_adrs
  FOR SELECT USING (true);

CREATE POLICY "leo_adrs_insert" ON leo_adrs
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role' OR 
    auth.jwt() ->> 'role' = 'ci_automation'
  );

CREATE POLICY "leo_adrs_update" ON leo_adrs
  FOR UPDATE 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- leo_interfaces
CREATE POLICY "leo_interfaces_select" ON leo_interfaces
  FOR SELECT USING (true);

CREATE POLICY "leo_interfaces_insert" ON leo_interfaces
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role' OR 
    auth.jwt() ->> 'role' = 'ci_automation'
  );

CREATE POLICY "leo_interfaces_update" ON leo_interfaces
  FOR UPDATE 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- leo_test_plans
CREATE POLICY "leo_test_plans_select" ON leo_test_plans
  FOR SELECT USING (true);

CREATE POLICY "leo_test_plans_insert" ON leo_test_plans
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role' OR 
    auth.jwt() ->> 'role' = 'ci_automation'
  );

CREATE POLICY "leo_test_plans_update" ON leo_test_plans
  FOR UPDATE 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- leo_nfr_requirements
CREATE POLICY "leo_nfr_requirements_select" ON leo_nfr_requirements
  FOR SELECT USING (true);

CREATE POLICY "leo_nfr_requirements_insert" ON leo_nfr_requirements
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role' OR 
    auth.jwt() ->> 'role' = 'ci_automation'
  );

CREATE POLICY "leo_nfr_requirements_update" ON leo_nfr_requirements
  FOR UPDATE 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- 5. PERFORMANCE INDEXES (Additional)
-- ============================================

-- Indexes for dashboard query patterns
CREATE INDEX IF NOT EXISTS idx_gate_reviews_latest 
  ON leo_gate_reviews(prd_id, gate, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sub_agent_pending 
  ON sub_agent_executions(status, created_at DESC) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_alerts_critical 
  ON compliance_alerts(created_at DESC) 
  WHERE severity = 'critical' AND resolved = false;

CREATE INDEX IF NOT EXISTS idx_validation_rules_gate 
  ON leo_validation_rules(gate, required DESC, weight DESC) 
  WHERE active = true;

-- ============================================
-- 6. GATE WEIGHT INTEGRITY VIEW & FUNCTION
-- ============================================

CREATE OR REPLACE VIEW v_gate_rule_integrity AS
SELECT 
  gate, 
  COUNT(*) as rule_count,
  ROUND(SUM(weight)::numeric, 3) AS total_weight,
  CASE 
    WHEN ROUND(SUM(weight)::numeric, 3) = 1.000 THEN 'VALID'
    WHEN ROUND(SUM(weight)::numeric, 3) > 1.000 THEN 'OVER (>1.000)'
    WHEN ROUND(SUM(weight)::numeric, 3) < 1.000 THEN 'UNDER (<1.000)'
    ELSE 'ERROR'
  END AS status,
  CASE 
    WHEN ROUND(SUM(weight)::numeric, 3) = 1.000 THEN '✅'
    ELSE '❌'
  END AS icon
FROM leo_validation_rules
WHERE active = true
GROUP BY gate;

-- Function for CI assertions
CREATE OR REPLACE FUNCTION check_gate_weights()
RETURNS TABLE(gate text, status text, total_weight numeric) AS $$
BEGIN
  -- Check if any gate has invalid weights
  IF EXISTS (
    SELECT 1 FROM v_gate_rule_integrity 
    WHERE status != 'VALID'
  ) THEN
    -- Return details of invalid gates
    RETURN QUERY 
    SELECT 
      v.gate::text,
      v.status::text,
      v.total_weight
    FROM v_gate_rule_integrity v
    WHERE v.status != 'VALID';
    
    -- Raise exception to fail CI
    RAISE EXCEPTION 'Gate validation weights invalid: %', 
      (SELECT string_agg(v.gate::text || '=' || v.total_weight, ', ') 
       FROM v_gate_rule_integrity v WHERE v.status != 'VALID');
  END IF;
  
  -- All valid
  RETURN QUERY 
  SELECT 
    v.gate::text,
    v.status::text,
    v.total_weight
  FROM v_gate_rule_integrity v;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. HELPER FUNCTION FOR IDEMPOTENT UPSERTS
-- ============================================

CREATE OR REPLACE FUNCTION upsert_sub_agent_execution(
  p_prd_id TEXT,
  p_sub_agent_id UUID,
  p_status execution_status DEFAULT 'pending'
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO sub_agent_executions (prd_id, sub_agent_id, status)
  VALUES (p_prd_id, p_sub_agent_id, p_status)
  ON CONFLICT (prd_id, sub_agent_id) 
  DO UPDATE SET 
    status = EXCLUDED.status,
    started_at = CASE 
      WHEN sub_agent_executions.status = 'pending' AND EXCLUDED.status = 'running' 
      THEN NOW() 
      ELSE sub_agent_executions.started_at 
    END
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. CREATE DASHBOARD VIEWER ROLE
-- ============================================

-- Create role for dashboard read access (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_viewer') THEN
    CREATE ROLE dashboard_viewer;
  END IF;
END $$;

-- Grant read permissions to dashboard_viewer
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dashboard_viewer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO dashboard_viewer;

-- ============================================
-- 9. RLS PERMISSION TEST FUNCTION
-- ============================================

-- Function to test RLS is properly restrictive
CREATE OR REPLACE FUNCTION test_rls_permissions()
RETURNS TABLE(test_name text, result text) AS $$
BEGIN
  -- Test 1: Anon user cannot insert into leo_gate_reviews
  BEGIN
    SET LOCAL role TO anon;
    INSERT INTO leo_gate_reviews (prd_id, gate, score, evidence) 
    VALUES ('test-prd', '2A', 50, '{}'::jsonb);
    RETURN QUERY SELECT 'anon_insert_gate_reviews'::text, 'FAIL - Insert allowed'::text;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN QUERY SELECT 'anon_insert_gate_reviews'::text, 'PASS - Insert blocked'::text;
  END;
  RESET role;
  
  -- Test 2: Anon user CAN read from leo_gate_reviews
  BEGIN
    SET LOCAL role TO anon;
    PERFORM * FROM leo_gate_reviews LIMIT 1;
    RETURN QUERY SELECT 'anon_select_gate_reviews'::text, 'PASS - Select allowed'::text;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN QUERY SELECT 'anon_select_gate_reviews'::text, 'FAIL - Select blocked'::text;
  END;
  RESET role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 10. FINAL VALIDATION
-- ============================================

-- Check all weights are valid
DO $$
DECLARE
  v_invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_invalid_count
  FROM v_gate_rule_integrity
  WHERE status != 'VALID';
  
  IF v_invalid_count > 0 THEN
    RAISE WARNING 'Found % gates with invalid weight totals', v_invalid_count;
  ELSE
    RAISE NOTICE '✅ All gate weights sum to 1.000';
  END IF;
END $$;

-- ============================================
-- COMMIT TRANSACTION
-- ============================================

COMMIT;

-- ============================================
-- POST-COMMIT SUMMARY
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE 'LEO Protocol Dashboard Fixes Applied:';
  RAISE NOTICE '✅ Enum types created (idempotent)';
  RAISE NOTICE '✅ Foreign keys added with ON DELETE RESTRICT';
  RAISE NOTICE '✅ RLS policies configured (CI/service role write)';
  RAISE NOTICE '✅ Performance indexes added';
  RAISE NOTICE '✅ Gate weight integrity view created';
  RAISE NOTICE '✅ Dashboard viewer role configured';
  RAISE NOTICE '✅ Helper functions for upserts added';
  RAISE NOTICE '════════════════════════════════════════════';
END $$;