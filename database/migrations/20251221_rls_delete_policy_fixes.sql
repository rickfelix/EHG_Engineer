-- Migration: RLS DELETE Policy Gaps Fix
-- Purpose: Add missing DELETE policies to 20 tables with partial RLS coverage
-- Created: 2025-12-21
--
-- Context: GitHub agent audit identified tables with RLS enabled but missing DELETE policies
-- This creates security gaps where users might be blocked from deleting records they should be able to manage
--
-- Pattern: Match existing UPDATE/INSERT policy logic for DELETE policies
-- Tables Affected: 20 tables with INSERT/SELECT/UPDATE but no DELETE coverage

-- =============================================================================
-- ADVISORY & CHECKPOINTS
-- =============================================================================

-- advisory_checkpoints: Simple authenticated DELETE (matches UPDATE pattern)
CREATE POLICY advisory_checkpoints_delete ON advisory_checkpoints
FOR DELETE TO authenticated
USING (true);

COMMENT ON POLICY advisory_checkpoints_delete ON advisory_checkpoints IS
'Allow authenticated users to delete advisory checkpoints (matches UPDATE policy pattern)';

-- =============================================================================
-- VENTURE-SCOPED TABLES (venture_id based access)
-- =============================================================================

-- assumption_sets: Venture-scoped DELETE (matches UPDATE/INSERT pattern)
CREATE POLICY "Users can delete assumption sets for accessible ventures" ON assumption_sets
FOR DELETE TO public
USING (
  venture_id IN (
    SELECT ventures.id
    FROM ventures
    WHERE ventures.company_id IN (
      SELECT ventures.company_id
      FROM profiles
      WHERE profiles.id = auth.uid()
    )
  )
);

-- lifecycle_phases: Configuration table DELETE (authenticated access)
CREATE POLICY lifecycle_phases_delete ON lifecycle_phases
FOR DELETE TO authenticated
USING (true);

COMMENT ON POLICY lifecycle_phases_delete ON lifecycle_phases IS
'RLS-DELETE-FIX-20251221: Allow authenticated users to delete lifecycle phases.
Matches existing INSERT/UPDATE pattern (authenticated access with true condition).';

-- =============================================================================
-- COMPANY-SCOPED TABLES (company_id based access)
-- =============================================================================

-- eva_actions: Company-scoped DELETE with role check (matches UPDATE pattern)
CREATE POLICY eva_actions_company_delete ON eva_actions
FOR DELETE TO public
USING (
  company_id IN (
    SELECT user_company_access.company_id
    FROM user_company_access
    WHERE user_company_access.user_id = auth.uid()
      AND user_company_access.is_active = true
      AND user_company_access.role IN ('owner', 'admin', 'editor')
  )
);

-- eva_orchestration_sessions: Company-scoped DELETE
CREATE POLICY eva_orchestration_sessions_company_delete ON eva_orchestration_sessions
FOR DELETE TO public
USING (
  company_id IN (
    SELECT user_company_access.company_id
    FROM user_company_access
    WHERE user_company_access.user_id = auth.uid()
      AND user_company_access.is_active = true
      AND user_company_access.role IN ('owner', 'admin', 'editor')
  )
);

-- =============================================================================
-- SD-SCOPED TABLES (Strategic Directive governance)
-- =============================================================================

-- sd_contract_exceptions: SD governance DELETE
CREATE POLICY sd_contract_exceptions_delete ON sd_contract_exceptions
FOR DELETE TO authenticated
USING (true);

-- sd_contract_violations: SD governance DELETE
CREATE POLICY sd_contract_violations_delete ON sd_contract_violations
FOR DELETE TO authenticated
USING (true);

-- sd_data_contracts: SD governance DELETE
CREATE POLICY sd_data_contracts_delete ON sd_data_contracts
FOR DELETE TO authenticated
USING (true);

-- sd_type_validation_profiles: SD governance DELETE
CREATE POLICY sd_type_validation_profiles_delete ON sd_type_validation_profiles
FOR DELETE TO authenticated
USING (true);

-- sd_ux_contracts: SD governance DELETE
CREATE POLICY sd_ux_contracts_delete ON sd_ux_contracts
FOR DELETE TO authenticated
USING (true);

-- =============================================================================
-- INTELLIGENCE & ANALYSIS TABLES
-- =============================================================================

-- intelligence_analysis: Simple SELECT-only table, allow authenticated DELETE
CREATE POLICY intelligence_analysis_delete ON intelligence_analysis
FOR DELETE TO authenticated
USING (true);

-- =============================================================================
-- SYSTEM/AUDIT TABLES (Read-only or append-only patterns)
-- =============================================================================

-- schema_migrations: System table - restrict DELETE to service_role only
CREATE POLICY schema_migrations_delete ON schema_migrations
FOR DELETE TO service_role
USING (true);

COMMENT ON POLICY schema_migrations_delete ON schema_migrations IS
'Only service_role can delete schema migration records (system integrity)';

-- recursion_events: System monitoring - authenticated DELETE
CREATE POLICY recursion_events_delete ON recursion_events
FOR DELETE TO authenticated
USING (true);

-- stage_events: System events - authenticated DELETE
CREATE POLICY stage_events_delete ON stage_events
FOR DELETE TO authenticated
USING (true);

-- venture_token_ledger: Financial audit trail - restrict to service_role
CREATE POLICY venture_token_ledger_delete ON venture_token_ledger
FOR DELETE TO service_role
USING (true);

COMMENT ON POLICY venture_token_ledger_delete ON venture_token_ledger IS
'Only service_role can delete token ledger entries (financial audit trail)';

-- =============================================================================
-- CONFIGURATION TABLES (Read-mostly)
-- =============================================================================

-- lifecycle_stage_config: Configuration - authenticated DELETE
CREATE POLICY lifecycle_stage_config_delete ON lifecycle_stage_config
FOR DELETE TO authenticated
USING (true);

-- cultural_design_styles: Read-only config - restrict DELETE to service_role
CREATE POLICY cultural_design_styles_delete ON cultural_design_styles
FOR DELETE TO service_role
USING (true);

-- venture_archetypes: Read-only config - restrict DELETE to service_role
CREATE POLICY venture_archetypes_delete ON venture_archetypes
FOR DELETE TO service_role
USING (true);

-- =============================================================================
-- EVA AGENT COMMUNICATION (Special case)
-- =============================================================================

-- eva_agent_communications: Agent-to-agent messaging - authenticated DELETE
CREATE POLICY eva_agent_communications_delete ON eva_agent_communications
FOR DELETE TO authenticated
USING (true);

-- =============================================================================
-- ORCHESTRATION METRICS (Monitoring)
-- =============================================================================

-- orchestration_metrics: Metrics table - authenticated DELETE
CREATE POLICY orchestration_metrics_delete ON orchestration_metrics
FOR DELETE TO authenticated
USING (true);

-- =============================================================================
-- VERIFICATION & LOGGING
-- =============================================================================

DO $$
DECLARE
  v_policy_count INTEGER;
BEGIN
  -- Verify all 20 tables now have DELETE policies
  SELECT COUNT(DISTINCT tablename)
  INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND cmd = 'DELETE'
    AND tablename IN (
      'advisory_checkpoints', 'assumption_sets', 'cultural_design_styles',
      'eva_actions', 'eva_agent_communications', 'eva_orchestration_sessions',
      'intelligence_analysis', 'lifecycle_phases', 'lifecycle_stage_config',
      'orchestration_metrics', 'recursion_events', 'schema_migrations',
      'sd_contract_exceptions', 'sd_contract_violations', 'sd_data_contracts',
      'sd_type_validation_profiles', 'sd_ux_contracts', 'stage_events',
      'venture_archetypes', 'venture_token_ledger'
    );

  RAISE NOTICE 'RLS DELETE Policy Fix Complete';
  RAISE NOTICE 'Added DELETE policies to % tables', v_policy_count;

  IF v_policy_count < 20 THEN
    RAISE WARNING 'Expected 20 DELETE policies, found %', v_policy_count;
  END IF;
END $$;

-- =============================================================================
-- POLICY DESIGN RATIONALE
-- =============================================================================

COMMENT ON POLICY sd_contract_exceptions_delete ON sd_contract_exceptions IS
'RLS-DELETE-FIX-20251221: Allow authenticated users to delete SD contract exceptions.
Pattern matches existing INSERT/UPDATE policies (authenticated access).';

COMMENT ON POLICY venture_token_ledger_delete ON venture_token_ledger IS
'RLS-DELETE-FIX-20251221: Restrict DELETE to service_role for audit trail integrity.
Financial records should not be deleted by regular users.';

COMMENT ON POLICY schema_migrations_delete ON schema_migrations IS
'RLS-DELETE-FIX-20251221: Restrict DELETE to service_role for system integrity.
Migration records should only be managed by system processes.';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
