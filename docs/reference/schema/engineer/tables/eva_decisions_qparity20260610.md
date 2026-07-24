# eva_decisions_qparity20260610 Table

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

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| eva_venture_id | `uuid` | YES | - | - |
| decision_class | `text` | YES | - | - |
| title | `text` | YES | - | - |
| description | `text` | YES | - | - |
| stake_level | `text` | YES | - | - |
| options | `jsonb` | YES | - | - |
| recommended_option | `text` | YES | - | - |
| status | `text` | YES | - | - |
| decision_made | `text` | YES | - | - |
| decided_by | `text` | YES | - | - |
| decided_at | `timestamp with time zone` | YES | - | - |
| auto_decidable | `boolean` | YES | - | - |
| auto_decision_rule | `text` | YES | - | - |
| due_date | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
