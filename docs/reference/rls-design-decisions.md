# RLS Design Decisions

## Single-Tenant Architecture

EHG operates as a **single-tenant system** where one human (the Chairman) orchestrates AI agents. There is no multi-user access pattern requiring row-level user scoping.

### Why USING(true) Is Acceptable for Core Tables

Core business tables (`strategic_directives_v2`, `product_requirements_v2`, `ventures`, etc.) use `USING(true)` for authenticated users because:

1. **Single user**: Only the Chairman has authenticated access. Row-level filtering by user ID adds complexity with no security benefit.
2. **Service role dominance**: ~95% of database operations use the `service_role` key (LEO scripts, sub-agents, CI). The authenticated role is used only by the frontend dashboard.
3. **Read-heavy dashboard**: The frontend primarily reads data for display. Mutations go through API routes that use `service_role`.

### Three-Tier RLS Model

| Tier | Policy | Use Case | Example Tables |
|------|--------|----------|----------------|
| **OPEN** | `authenticated` can SELECT, INSERT, UPDATE, DELETE | Core business tables actively used by frontend | `strategic_directives_v2`, `ventures`, `feedback` |
| **APPEND-ONLY** | `authenticated` can SELECT + INSERT only | Audit/log tables that must preserve history | `governance_audit_log`, `validation_audit_log` |
| **SERVICE-ONLY** | Only `service_role` has access | Infrastructure tables, empty speculative tables, sensitive config | `claude_sessions`, `leo_protocol_sections`, `uat_credentials` |

### Phase 1 Changes (2026-03-17)

Tightened 38 tables from OPEN to SERVICE-ONLY:
- 35 zero-row infrastructure tables that had no business being accessible to authenticated users
- 3 zero-row audit/log tables converted to SERVICE-ONLY

Fixed critical security gaps:
- 3 tables had `anon ALL` policies (unauthenticated full CRUD) — now SERVICE-ONLY
- 12+ tables had `public ALL` policies — now SERVICE-ONLY

### Phase 1.5 Changes (SD-LEO-INFRA-RLS-POLICY-TIGHTENING-001, 2026-03-17)

Tightened 30 additional tables from OPEN to SERVICE-ONLY:

**Tier 1 (11 high-risk audit/log tables):**
- `model_usage_log` — had `anon ALL` (unauthenticated full CRUD)
- `nursery_evaluation_log` — had `public ALL`
- `runtime_audits` — had `public INSERT/SELECT/UPDATE` + `authenticated DELETE`
- `audit_triangulation_log` — had `public INSERT/SELECT` + `authenticated DELETE/UPDATE`
- `prd_research_audit_log` — had `anon INSERT/SELECT`
- `sd_type_change_audit` — had `anon SELECT`
- `continuous_execution_log` — had `anon SELECT`
- `context_usage_log` — had `anon SELECT`
- `activity_logs` — had `authenticated INSERT/SELECT`
- `raid_log` — had `authenticated SELECT/INSERT/UPDATE`
- `validation_audit_log` — had `authenticated SELECT/INSERT`

**Tier 2 (19 internal infrastructure tables):**
- LEO audit tables: `leo_audit_checklists`, `leo_audit_config`, `leo_error_log`, `leo_feature_flag_audit`, `leo_protocol_file_audit`, `leo_kb_generation_log`
- Governance: `governance_audit_log`, `handoff_audit_log`, `operations_audit_log`
- Enhancement tracking: `enhancement_proposal_audit`, `protocol_improvement_audit_log`
- Internal: `cascade_invalidation_log`, `capability_reuse_log`, `backlog_item_completion`
- Security: `sd_governance_bypass_audit`
- Risk: `risk_escalation_log`, `risk_gate_passage_log`
- Other: `import_audit`, `eva_event_log`

All 30 tables now have only `service_role` policies. No application impact since all EHG_Engineer access uses `SUPABASE_SERVICE_ROLE_KEY`.

### Future Phases

- **Phase 2**: Venture-scoping for venture-owned tables (if multi-venture isolation needed)
- **Phase 3**: Periodic RLS audit automation (detect policy drift)
