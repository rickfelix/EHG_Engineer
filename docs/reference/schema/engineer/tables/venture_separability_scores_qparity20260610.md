# venture_separability_scores_qparity20260610 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| overall_score | `numeric(5,2)` | YES | - | - |
| infrastructure_independence | `numeric(5,2)` | YES | - | - |
| data_portability | `numeric(5,2)` | YES | - | - |
| ip_clarity | `numeric(5,2)` | YES | - | - |
| team_dependency | `numeric(5,2)` | YES | - | - |
| operational_autonomy | `numeric(5,2)` | YES | - | - |
| dimension_weights | `jsonb` | YES | - | - |
| metadata | `jsonb` | YES | - | - |
| scored_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
