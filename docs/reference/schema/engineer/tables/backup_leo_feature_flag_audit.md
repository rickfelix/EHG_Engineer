# backup_leo_feature_flag_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-26T21:16:02.093Z
**Rows**: 12
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| flag_key | `text` | YES | - | - |
| action_type | `text` | YES | - | - |
| actor_id | `text` | YES | - | - |
| actor_type | `text` | YES | - | - |
| before_state | `jsonb` | YES | - | - |
| after_state | `jsonb` | YES | - | - |
| reason | `text` | YES | - | - |
| correlation_id | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
