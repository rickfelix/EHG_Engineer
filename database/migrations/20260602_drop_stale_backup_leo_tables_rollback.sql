-- @approved-by: rickfelix@example.com
-- ============================================================================
-- ROLLBACK for 20260602_drop_stale_backup_leo_tables.sql
-- Migration: 20260602_drop_stale_backup_leo_tables_rollback.sql
-- ============================================================================
-- Recreates the 4 dropped backup_leo_* tables (STRUCTURE + DATA) exactly as
-- captured from the LIVE database on 2026-06-02 immediately before the drop.
-- Column types and defaults are reproduced faithfully (none of these tables
-- had column defaults or primary keys at capture time).
--
-- NOTE: RLS policies are intentionally NOT restored here. RLS was applied to
-- these stale backup tables earlier today only as an interim "secure rather
-- than drop" measure; restoring it is unnecessary for a rollback of the drop.
-- If RLS is ever needed again, re-run the relevant PART C of
-- 20260602_fix_security_definer_views_and_rls_recurrence.sql.
-- ============================================================================

BEGIN;

-- ----- backup_leo_subagent_handoffs (1 row) -----
CREATE TABLE IF NOT EXISTS public."backup_leo_subagent_handoffs" (
  "id" uuid,
  "from_agent" text,
  "to_agent" text,
  "sd_id" text,
  "prd_id" text,
  "phase" text,
  "summary" jsonb,
  "critical_flags" text[],
  "warnings" text[],
  "recommendations" text[],
  "confidence_score" double precision,
  "execution_time_ms" integer,
  "created_at" timestamp without time zone,
  "expires_at" timestamp without time zone
);

INSERT INTO public."backup_leo_subagent_handoffs" ("id", "from_agent", "to_agent", "sd_id", "prd_id", "phase", "summary", "critical_flags", "warnings", "recommendations", "confidence_score", "execution_time_ms", "created_at", "expires_at") VALUES ('26a54af0-56b2-4126-8f9d-bd053203d6cd'::uuid, 'DESIGN'::text, 'ENGINEER'::text, '52038e49-7612-4e98-bb9f-c8b5b97a9266'::text, NULL, 'PLAN'::text, '{"agent": "DESIGN", "status": "approved_with_recommendations", "key_findings": {"files_status": {"note": "Files mentioned in SD do not exist yet in expected paths", "files_to_create_or_locate": ["src/pages/api/v2/chairman/briefing.ts", "src/hooks/useChairmanDashboardData.ts", "src/services/evaTokenBudget.ts"]}, "component_sizing": {"status": "optimal", "assessment": "All changes are data layer modifications within existing files. No new components created.", "within_optimal_range": true, "estimated_total_changes": "~60 lines across 2 files"}, "query_performance": {"risk": "medium", "status": "needs_validation", "concern": "Aggregation queries on token ledger may impact dashboard load time"}, "accessibility_impact": {"reason": "No UI changes - data layer only", "status": "none"}, "api_contract_compatibility": {"status": "verified", "requirement": "TokenSummary and FinancialOverview types must remain unchanged"}}, "execution_summary": "Pre-implementation design review for SD-VISION-V2-010: Token Ledger & Budget Enforcement", "design_patterns_applied": ["Component sizing: Optimal (<100 lines total changes)", "No UI changes = No accessibility regression", "Data layer changes only"]}'::jsonb, '{}'::text[], '{"Query performance: Add database indexes on token_ledger before implementing aggregations","Files not found: Verify correct paths for briefing.ts, useChairmanDashboardData.ts, evaTokenBudget.ts","TYPE CONTRACT: Ensure TokenSummary and FinancialOverview types remain unchanged"}'::text[], '{"Add database indexes: token_ledger.timestamp, token_ledger.sd_id","Consider materialized view for token aggregations if query >500ms","Implement caching strategy for frequently accessed metrics","Add error handling for token ledger data unavailability","Document TOKEN_PRICE_USD constant source and update frequency","Add unit tests for aggregation logic","Apply PAT-004 (dev server restart) after implementation","Monitor query execution time (target <500ms)"}'::text[], '0.85'::double precision, '0'::integer, '2025-12-16 16:13:02.738243'::timestamp without time zone, NULL);

-- ----- backup_leo_sub_agent_handoffs (1 row) -----
CREATE TABLE IF NOT EXISTS public."backup_leo_sub_agent_handoffs" (
  "id" integer,
  "sub_agent_id" character varying(50),
  "handoff_template" jsonb,
  "validation_rules" jsonb,
  "required_outputs" jsonb,
  "success_criteria" jsonb,
  "version" integer,
  "active" boolean,
  "created_at" timestamp without time zone
);

INSERT INTO public."backup_leo_sub_agent_handoffs" ("id", "sub_agent_id", "handoff_template", "validation_rules", "required_outputs", "success_criteria", "version", "active", "created_at") VALUES ('1'::integer, 'a1b2c3d4-9999-4999-8999-999999999999'::character varying(50), '{"sections": ["baseline_capture", "change_analysis", "comparison_results", "verdict"], "template_type": "regression_validation", "comparison_format": {"api_compatible": "Boolean - no breaking API changes", "tests_unchanged": "Boolean - all tests pass same as before", "imports_resolved": "Boolean - all imports still resolve", "coverage_maintained": "Boolean - coverage not decreased"}, "baseline_capture_format": {"import_graph": "Object with file -> [imported_files]", "test_results": "Object with test suite name -> {passed, failed, skipped}", "api_signatures": "Array of {file, exports: [{name, type, parameters}]}", "coverage_metrics": "Object with {lines, branches, functions, statements}"}}'::jsonb, '["baseline_captured_before_changes", "comparison_run_after_changes", "all_tests_passing", "no_breaking_api_changes", "imports_resolve_correctly"]'::jsonb, '["regression_analysis", "baseline_snapshot", "comparison_report"]'::jsonb, '{"FAIL": "Tests fail OR undocumented API changes OR broken imports", "PASS": "All tests pass, no API changes, all imports resolve", "CONDITIONAL_PASS": "Tests pass, minor documented API changes with migration path"}'::jsonb, '1'::integer, 'true'::boolean, '2025-12-27 22:28:23.779136'::timestamp without time zone);

-- ----- backup_leo_feature_flag_audit (12 rows) -----
CREATE TABLE IF NOT EXISTS public."backup_leo_feature_flag_audit" (
  "id" uuid,
  "flag_key" text,
  "action_type" text,
  "actor_id" text,
  "actor_type" text,
  "before_state" jsonb,
  "after_state" jsonb,
  "reason" text,
  "correlation_id" uuid,
  "created_at" timestamp with time zone
);

INSERT INTO public."backup_leo_feature_flag_audit" ("id", "flag_key", "action_type", "actor_id", "actor_type", "before_state", "after_state", "reason", "correlation_id", "created_at") VALUES ('02eae69e-b2c0-4235-b36d-e42fa779ae11'::uuid, 'quality_layer_sanitization'::text, 'update'::text, NULL, 'system'::text, '{"id": "0adfaecf-accf-4683-9901-156aee0a56dc", "flag_key": "quality_layer_sanitization", "owner_id": null, "expiry_at": null, "risk_tier": "high", "created_at": "2026-02-01T13:32:48.840825+00:00", "is_enabled": true, "owner_type": null, "updated_at": "2026-02-01T20:15:01.241912+00:00", "description": "Controls PII redaction and prompt injection detection in feedback processing", "row_version": 2, "display_name": "Quality Layer: Sanitization", "is_temporary": false, "lifecycle_state": "enabled"}'::jsonb, '{"id": "0adfaecf-accf-4683-9901-156aee0a56dc", "flag_key": "quality_layer_sanitization", "owner_id": null, "expiry_at": null, "risk_tier": "medium", "created_at": "2026-02-01T13:32:48.840825+00:00", "is_enabled": true, "owner_type": null, "updated_at": "2026-02-01T20:15:01.394052+00:00", "description": "Controls PII redaction and prompt injection detection in feedback processing", "row_version": 3, "display_name": "Quality Layer: Sanitization", "is_temporary": false, "lifecycle_state": "enabled"}'::jsonb, NULL, NULL, '2026-02-01 20:15:01.394052+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit" ("id", "flag_key", "action_type", "actor_id", "actor_type", "before_state", "after_state", "reason", "correlation_id", "created_at") VALUES ('07874e32-d6d1-4106-8f91-8d123f2b0882'::uuid, 'test_lifecycle_1769977094389'::text, 'transition'::text, NULL, 'system'::text, '{"is_enabled": true, "updated_at": "2026-02-01T20:18:15.305049+00:00", "lifecycle_state": "enabled"}'::jsonb, '{"is_enabled": false, "updated_at": "2026-02-01T20:18:15.497213+00:00", "lifecycle_state": "expired"}'::jsonb, NULL, NULL, '2026-02-01 20:18:15.497213+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit" ("id", "flag_key", "action_type", "actor_id", "actor_type", "before_state", "after_state", "reason", "correlation_id", "created_at") VALUES ('2247f1dc-cdff-4de9-8330-fd4739bd9305'::uuid, 'quality_layer_sanitization'::text, 'update'::text, NULL, 'system'::text, '{"id": "0adfaecf-accf-4683-9901-156aee0a56dc", "flag_key": "quality_layer_sanitization", "owner_id": null, "expiry_at": null, "risk_tier": "medium", "created_at": "2026-02-01T13:32:48.840825+00:00", "is_enabled": true, "owner_type": null, "updated_at": "2026-02-01T13:32:48.840825+00:00", "description": "Controls PII redaction and prompt injection detection in feedback processing", "row_version": 1, "display_name": "Quality Layer: Sanitization", "is_temporary": false, "lifecycle_state": "enabled"}'::jsonb, '{"id": "0adfaecf-accf-4683-9901-156aee0a56dc", "flag_key": "quality_layer_sanitization", "owner_id": null, "expiry_at": null, "risk_tier": "high", "created_at": "2026-02-01T13:32:48.840825+00:00", "is_enabled": true, "owner_type": null, "updated_at": "2026-02-01T20:15:01.241912+00:00", "description": "Controls PII redaction and prompt injection detection in feedback processing", "row_version": 2, "display_name": "Quality Layer: Sanitization", "is_temporary": false, "lifecycle_state": "enabled"}'::jsonb, NULL, NULL, '2026-02-01 20:15:01.241912+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit" ("id", "flag_key", "action_type", "actor_id", "actor_type", "before_state", "after_state", "reason", "correlation_id", "created_at") VALUES ('2ba762c0-159b-4859-894e-cee20d450e1b'::uuid, 'test_lifecycle_1769977077598'::text, 'transition'::text, NULL, 'system'::text, '{"is_enabled": true, "updated_at": "2026-02-01T20:17:57.93127+00:00", "lifecycle_state": "enabled"}'::jsonb, '{"is_enabled": false, "updated_at": "2026-02-01T20:17:58.128096+00:00", "lifecycle_state": "disabled"}'::jsonb, NULL, NULL, '2026-02-01 20:17:58.128096+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit" ("id", "flag_key", "action_type", "actor_id", "actor_type", "before_state", "after_state", "reason", "correlation_id", "created_at") VALUES ('300d0c4e-952b-473a-b9ad-ca22e85d5812'::uuid, 'test_lifecycle_1769977094389'::text, 'transition'::text, NULL, 'system'::text, '{"is_enabled": false, "updated_at": "2026-02-01T20:18:14.957354+00:00", "lifecycle_state": "disabled"}'::jsonb, '{"is_enabled": true, "updated_at": "2026-02-01T20:18:15.159294+00:00", "lifecycle_state": "enabled"}'::jsonb, NULL, NULL, '2026-02-01 20:18:15.159294+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit" ("id", "flag_key", "action_type", "actor_id", "actor_type", "before_state", "after_state", "reason", "correlation_id", "created_at") VALUES ('470be621-404d-4f62-98b3-0f3f61e680c1'::uuid, 'test_lifecycle_1769977094389'::text, 'update'::text, NULL, 'system'::text, '{"id": "cbd84695-f6be-4ca3-a3ef-2f8ae5c9e229", "flag_key": "test_lifecycle_1769977094389", "owner_id": null, "expiry_at": null, "risk_tier": "low", "created_at": "2026-02-01T20:18:14.722151+00:00", "is_enabled": true, "owner_type": null, "updated_at": "2026-02-01T20:18:15.159294+00:00", "description": "Testing lifecycle state transitions", "row_version": 4, "display_name": "Test Lifecycle Flag", "is_temporary": false, "lifecycle_state": "enabled"}'::jsonb, '{"id": "cbd84695-f6be-4ca3-a3ef-2f8ae5c9e229", "flag_key": "test_lifecycle_1769977094389", "owner_id": null, "expiry_at": "2026-02-01T20:17:15.043+00:00", "risk_tier": "low", "created_at": "2026-02-01T20:18:14.722151+00:00", "is_enabled": true, "owner_type": null, "updated_at": "2026-02-01T20:18:15.305049+00:00", "description": "Testing lifecycle state transitions", "row_version": 5, "display_name": "Test Lifecycle Flag", "is_temporary": true, "lifecycle_state": "enabled"}'::jsonb, NULL, NULL, '2026-02-01 20:18:15.305049+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit" ("id", "flag_key", "action_type", "actor_id", "actor_type", "before_state", "after_state", "reason", "correlation_id", "created_at") VALUES ('94b81649-dfd9-4453-a52e-b33024e50cd9'::uuid, 'test_lifecycle_1769977094389'::text, 'transition'::text, NULL, 'system'::text, '{"is_enabled": false, "updated_at": "2026-02-01T20:18:15.497213+00:00", "lifecycle_state": "expired"}'::jsonb, '{"is_enabled": false, "updated_at": "2026-02-01T20:18:15.695324+00:00", "lifecycle_state": "archived"}'::jsonb, NULL, NULL, '2026-02-01 20:18:15.695324+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit" ("id", "flag_key", "action_type", "actor_id", "actor_type", "before_state", "after_state", "reason", "correlation_id", "created_at") VALUES ('a7cfcbe2-4bec-4747-b6a0-790bdd961e2d'::uuid, 'test_lifecycle_1769977094389'::text, 'update'::text, NULL, 'system'::text, '{"id": "cbd84695-f6be-4ca3-a3ef-2f8ae5c9e229", "flag_key": "test_lifecycle_1769977094389", "owner_id": null, "expiry_at": null, "risk_tier": "medium", "created_at": "2026-02-01T20:18:14.722151+00:00", "is_enabled": true, "owner_type": null, "updated_at": "2026-02-01T20:18:14.722151+00:00", "description": "Testing lifecycle state transitions", "row_version": 1, "display_name": "Test Lifecycle Flag", "is_temporary": false, "lifecycle_state": "enabled"}'::jsonb, '{"id": "cbd84695-f6be-4ca3-a3ef-2f8ae5c9e229", "flag_key": "test_lifecycle_1769977094389", "owner_id": null, "expiry_at": null, "risk_tier": "low", "created_at": "2026-02-01T20:18:14.722151+00:00", "is_enabled": true, "owner_type": null, "updated_at": "2026-02-01T20:18:14.861499+00:00", "description": "Testing lifecycle state transitions", "row_version": 2, "display_name": "Test Lifecycle Flag", "is_temporary": false, "lifecycle_state": "enabled"}'::jsonb, NULL, NULL, '2026-02-01 20:18:14.861499+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit" ("id", "flag_key", "action_type", "actor_id", "actor_type", "before_state", "after_state", "reason", "correlation_id", "created_at") VALUES ('c4d0923d-ba48-4a73-aff5-c417d3cc0165'::uuid, 'test_lifecycle_1769977094389'::text, 'create'::text, NULL, 'system'::text, NULL, '{"id": "cbd84695-f6be-4ca3-a3ef-2f8ae5c9e229", "flag_key": "test_lifecycle_1769977094389", "owner_id": null, "expiry_at": null, "risk_tier": "medium", "created_at": "2026-02-01T20:18:14.722151+00:00", "is_enabled": true, "owner_type": null, "updated_at": "2026-02-01T20:18:14.722151+00:00", "description": "Testing lifecycle state transitions", "row_version": 1, "display_name": "Test Lifecycle Flag", "is_temporary": false, "lifecycle_state": "enabled"}'::jsonb, NULL, NULL, '2026-02-01 20:18:14.722151+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit" ("id", "flag_key", "action_type", "actor_id", "actor_type", "before_state", "after_state", "reason", "correlation_id", "created_at") VALUES ('ce0118e4-2c71-43f1-bfef-c312bdaf85af'::uuid, 'test_lifecycle_1769977094389'::text, 'transition'::text, NULL, 'system'::text, '{"is_enabled": true, "updated_at": "2026-02-01T20:18:14.861499+00:00", "lifecycle_state": "enabled"}'::jsonb, '{"is_enabled": false, "updated_at": "2026-02-01T20:18:14.957354+00:00", "lifecycle_state": "disabled"}'::jsonb, NULL, NULL, '2026-02-01 20:18:14.957354+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit" ("id", "flag_key", "action_type", "actor_id", "actor_type", "before_state", "after_state", "reason", "correlation_id", "created_at") VALUES ('e6c8d348-176e-4b45-97d9-65a79e0e689e'::uuid, 'test_valid_governance_1769977238084'::text, 'create'::text, NULL, 'system'::text, NULL, '{"id": "955444de-aec3-424d-8702-86b4e8d282ac", "flag_key": "test_valid_governance_1769977238084", "owner_id": "engineering", "expiry_at": "2026-02-02T20:20:38.084+00:00", "risk_tier": "low", "created_at": "2026-02-01T20:20:38.418673+00:00", "is_enabled": false, "owner_type": "team", "updated_at": "2026-02-01T20:20:38.418673+00:00", "description": "Testing governance compliance", "row_version": 1, "display_name": "Test Valid", "is_temporary": true, "lifecycle_state": "draft"}'::jsonb, NULL, NULL, '2026-02-01 20:20:38.418673+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit" ("id", "flag_key", "action_type", "actor_id", "actor_type", "before_state", "after_state", "reason", "correlation_id", "created_at") VALUES ('fd42b64d-890f-4438-8565-7a6b687ab675'::uuid, 'test_lifecycle_1769977077598'::text, 'create'::text, NULL, 'system'::text, NULL, '{"id": "25d03db2-3669-43b8-a1f2-ec118e0b62c5", "flag_key": "test_lifecycle_1769977077598", "owner_id": null, "expiry_at": null, "risk_tier": "medium", "created_at": "2026-02-01T20:17:57.93127+00:00", "is_enabled": true, "owner_type": null, "updated_at": "2026-02-01T20:17:57.93127+00:00", "description": "Testing lifecycle state transitions", "row_version": 1, "display_name": "Test Lifecycle Flag", "is_temporary": false, "lifecycle_state": "enabled"}'::jsonb, NULL, NULL, '2026-02-01 20:17:57.93127+00'::timestamp with time zone);

-- ----- backup_leo_feature_flag_audit_log (6 rows) -----
CREATE TABLE IF NOT EXISTS public."backup_leo_feature_flag_audit_log" (
  "id" uuid,
  "flag_key" text,
  "action" text,
  "previous_state" jsonb,
  "new_state" jsonb,
  "changed_by" text,
  "environment" text,
  "created_at" timestamp with time zone
);

INSERT INTO public."backup_leo_feature_flag_audit_log" ("id", "flag_key", "action", "previous_state", "new_state", "changed_by", "environment", "created_at") VALUES ('06c37939-e9c2-43ed-a932-99d4691673de'::uuid, 'test_valid_governance_1769977238084'::text, 'deleted'::text, '{"id": "955444de-aec3-424d-8702-86b4e8d282ac", "flag_key": "test_valid_governance_1769977238084", "owner_id": "engineering", "expiry_at": "2026-02-02T20:20:38.084+00:00", "risk_tier": "low", "created_at": "2026-02-01T20:20:38.418673+00:00", "is_enabled": false, "owner_type": "team", "updated_at": "2026-02-01T20:20:38.418673+00:00", "description": "Testing governance compliance", "row_version": 1, "display_name": "Test Valid", "is_temporary": true, "lifecycle_state": "draft", "leo_feature_flag_policies": []}'::jsonb, NULL, 'test-script'::text, NULL, '2026-02-01 20:20:38.633683+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit_log" ("id", "flag_key", "action", "previous_state", "new_state", "changed_by", "environment", "created_at") VALUES ('595941bc-5d13-4983-b29d-a6a8d01adaf9'::uuid, 'test_lifecycle_1769977094389'::text, 'created'::text, NULL, '{"id": "cbd84695-f6be-4ca3-a3ef-2f8ae5c9e229", "flag_key": "test_lifecycle_1769977094389", "owner_id": null, "expiry_at": null, "risk_tier": "medium", "created_at": "2026-02-01T20:18:14.722151+00:00", "is_enabled": true, "owner_type": null, "updated_at": "2026-02-01T20:18:14.722151+00:00", "description": "Testing lifecycle state transitions", "row_version": 1, "display_name": "Test Lifecycle Flag", "is_temporary": false, "lifecycle_state": "enabled"}'::jsonb, 'test-script'::text, NULL, '2026-02-01 20:18:14.78045+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit_log" ("id", "flag_key", "action", "previous_state", "new_state", "changed_by", "environment", "created_at") VALUES ('8405baae-f040-4950-b199-bac9e5bccc9a'::uuid, 'test_lifecycle_1769977077598'::text, 'deleted'::text, '{"id": "25d03db2-3669-43b8-a1f2-ec118e0b62c5", "flag_key": "test_lifecycle_1769977077598", "owner_id": null, "expiry_at": null, "risk_tier": "medium", "created_at": "2026-02-01T20:17:57.93127+00:00", "is_enabled": false, "owner_type": null, "updated_at": "2026-02-01T20:17:58.128096+00:00", "description": "Testing lifecycle state transitions", "row_version": 2, "display_name": "Test Lifecycle Flag", "is_temporary": false, "lifecycle_state": "disabled", "leo_feature_flag_policies": []}'::jsonb, NULL, 'test-script'::text, NULL, '2026-02-01 20:17:58.451519+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit_log" ("id", "flag_key", "action", "previous_state", "new_state", "changed_by", "environment", "created_at") VALUES ('84287811-9cf6-49a7-b538-c777e976ba2b'::uuid, 'test_valid_governance_1769977238084'::text, 'created'::text, NULL, '{"id": "955444de-aec3-424d-8702-86b4e8d282ac", "flag_key": "test_valid_governance_1769977238084", "owner_id": "engineering", "expiry_at": "2026-02-02T20:20:38.084+00:00", "risk_tier": "low", "created_at": "2026-02-01T20:20:38.418673+00:00", "is_enabled": false, "owner_type": "team", "updated_at": "2026-02-01T20:20:38.418673+00:00", "description": "Testing governance compliance", "row_version": 1, "display_name": "Test Valid", "is_temporary": true, "lifecycle_state": "draft"}'::jsonb, 'test-script'::text, NULL, '2026-02-01 20:20:38.471536+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit_log" ("id", "flag_key", "action", "previous_state", "new_state", "changed_by", "environment", "created_at") VALUES ('a0696f12-94db-4888-bb93-1e90dc4ab3e5'::uuid, 'test_lifecycle_1769977094389'::text, 'deleted'::text, '{"id": "cbd84695-f6be-4ca3-a3ef-2f8ae5c9e229", "flag_key": "test_lifecycle_1769977094389", "owner_id": null, "expiry_at": "2026-02-01T20:17:15.043+00:00", "risk_tier": "low", "created_at": "2026-02-01T20:18:14.722151+00:00", "is_enabled": false, "owner_type": null, "updated_at": "2026-02-01T20:18:15.695324+00:00", "description": "Testing lifecycle state transitions", "row_version": 7, "display_name": "Test Lifecycle Flag", "is_temporary": true, "lifecycle_state": "archived", "leo_feature_flag_policies": []}'::jsonb, NULL, 'test-script'::text, NULL, '2026-02-01 20:18:15.999049+00'::timestamp with time zone);
INSERT INTO public."backup_leo_feature_flag_audit_log" ("id", "flag_key", "action", "previous_state", "new_state", "changed_by", "environment", "created_at") VALUES ('f9162d43-647b-4105-bdc6-d04f5e128419'::uuid, 'test_lifecycle_1769977077598'::text, 'created'::text, NULL, '{"id": "25d03db2-3669-43b8-a1f2-ec118e0b62c5", "flag_key": "test_lifecycle_1769977077598", "owner_id": null, "expiry_at": null, "risk_tier": "medium", "created_at": "2026-02-01T20:17:57.93127+00:00", "is_enabled": true, "owner_type": null, "updated_at": "2026-02-01T20:17:57.93127+00:00", "description": "Testing lifecycle state transitions", "row_version": 1, "display_name": "Test Lifecycle Flag", "is_temporary": false, "lifecycle_state": "enabled"}'::jsonb, 'test-script'::text, NULL, '2026-02-01 20:17:57.99003+00'::timestamp with time zone);

-- Verification: assert all 4 tables exist again with the expected row counts.
DO $$
BEGIN
  IF to_regclass('public.backup_leo_subagent_handoffs') IS NULL THEN
    RAISE EXCEPTION 'Rollback verification FAILED - public.backup_leo_subagent_handoffs not recreated';
  END IF;
  IF (SELECT count(*) FROM public."backup_leo_subagent_handoffs") <> 1 THEN
    RAISE EXCEPTION 'Rollback verification FAILED - public.backup_leo_subagent_handoffs expected 1 row(s), got %', (SELECT count(*) FROM public."backup_leo_subagent_handoffs");
  END IF;
  IF to_regclass('public.backup_leo_sub_agent_handoffs') IS NULL THEN
    RAISE EXCEPTION 'Rollback verification FAILED - public.backup_leo_sub_agent_handoffs not recreated';
  END IF;
  IF (SELECT count(*) FROM public."backup_leo_sub_agent_handoffs") <> 1 THEN
    RAISE EXCEPTION 'Rollback verification FAILED - public.backup_leo_sub_agent_handoffs expected 1 row(s), got %', (SELECT count(*) FROM public."backup_leo_sub_agent_handoffs");
  END IF;
  IF to_regclass('public.backup_leo_feature_flag_audit') IS NULL THEN
    RAISE EXCEPTION 'Rollback verification FAILED - public.backup_leo_feature_flag_audit not recreated';
  END IF;
  IF (SELECT count(*) FROM public."backup_leo_feature_flag_audit") <> 12 THEN
    RAISE EXCEPTION 'Rollback verification FAILED - public.backup_leo_feature_flag_audit expected 12 row(s), got %', (SELECT count(*) FROM public."backup_leo_feature_flag_audit");
  END IF;
  IF to_regclass('public.backup_leo_feature_flag_audit_log') IS NULL THEN
    RAISE EXCEPTION 'Rollback verification FAILED - public.backup_leo_feature_flag_audit_log not recreated';
  END IF;
  IF (SELECT count(*) FROM public."backup_leo_feature_flag_audit_log") <> 6 THEN
    RAISE EXCEPTION 'Rollback verification FAILED - public.backup_leo_feature_flag_audit_log expected 6 row(s), got %', (SELECT count(*) FROM public."backup_leo_feature_flag_audit_log");
  END IF;
  RAISE NOTICE 'Rollback verification PASSED: all 4 backup_leo_* tables restored with expected row counts.';
END $$;

COMMIT;
