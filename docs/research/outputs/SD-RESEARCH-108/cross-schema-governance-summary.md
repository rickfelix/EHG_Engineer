# Research Summary: Cross-Schema Governance Architecture

**SD Reference**: SD-RESEARCH-108 (Security, Compliance & AI Auditability)
**Document**: Cross-Schema Governance Architecture for EHG.pdf
**Pages**: 22
**Relevance**: Supporting
**Reviewed**: 2025-11-29

## Executive Summary

Defines a three-schema PostgreSQL architecture separating governance, portfolio, and runtime concerns with strict access boundaries enforced via RLS and database roles.

## Key Findings

### Three-Schema Architecture

| Schema | Purpose | Access Pattern |
|--------|---------|----------------|
| `governance_schema` | SDs, PRDs, policies, approvals | Write by LEAD/PLAN, read by all |
| `portfolio_schema` | Ventures, resources, allocations | Write by Chairman, read by operators |
| `runtime_schema` | Stage progress, metrics, events | Write by EXEC/EVA, read by all |

### Schema Isolation Benefits

1. **Security**: Different permission models per domain
2. **Auditability**: Clear ownership of data changes
3. **Performance**: Schema-specific indexes and caching
4. **Evolution**: Independent schema versioning

### Cross-Schema Access Patterns

```sql
-- Views for cross-schema queries
CREATE VIEW portfolio_schema.venture_health AS
SELECT
  v.id,
  v.name,
  g.current_phase,
  r.stage_progress,
  r.risk_score
FROM portfolio_schema.ventures v
LEFT JOIN governance_schema.venture_governance g ON v.id = g.venture_id
LEFT JOIN runtime_schema.venture_metrics r ON v.id = r.venture_id;
```

### Database Role Hierarchy

```
superuser (deploy only, never runtime)
  └── ehg_admin (schema management)
        ├── governance_writer (LEAD/PLAN agents)
        ├── portfolio_writer (Chairman dashboard)
        ├── runtime_writer (EXEC agents, EVA)
        └── authenticated_reader (all authenticated users)
```

### RLS Policy Architecture

Each schema has venture_id-based isolation:
```sql
-- Applied to all tables in runtime_schema
ALTER TABLE runtime_schema.stage_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY venture_rls ON runtime_schema.stage_progress
  FOR ALL
  USING (venture_id = current_setting('app.current_venture')::uuid);
```

## Impact on SD-RESEARCH-108

Provides **database-level security architecture**:

| Security Control | Implementation |
|------------------|----------------|
| Schema separation | Three isolated domains |
| Role-based access | Hierarchical DB roles |
| Row-level isolation | RLS with venture_id |
| Audit boundaries | Per-schema change tracking |

## PRD Generation Notes

- Define schema migration strategy for existing tables
- Implement role hierarchy in Supabase
- Create cross-schema views for dashboards
- Document permission matrix per role

## Cross-References

- **Document 6** (Security Framework): RLS policy patterns
- **Document 4** (Unified Interface): Role-based UI maps to schema access
