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

### Future Phases

- **Phase 2**: Convert non-zero-row audit tables to APPEND-ONLY (requires code path audit)
- **Phase 3**: Add venture-scoping to venture-owned tables (if multi-venture isolation needed)
