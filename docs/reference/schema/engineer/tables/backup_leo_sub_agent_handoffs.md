# backup_leo_sub_agent_handoffs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-29T20:40:29.893Z
**Rows**: 1
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | YES | - | - |
| sub_agent_id | `character varying(50)` | YES | - | - |
| handoff_template | `jsonb` | YES | - | - |
| validation_rules | `jsonb` | YES | - | - |
| required_outputs | `jsonb` | YES | - | - |
| success_criteria | `jsonb` | YES | - | - |
| version | `integer(32)` | YES | - | - |
| active | `boolean` | YES | - | - |
| created_at | `timestamp without time zone` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
