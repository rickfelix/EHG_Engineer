# venture_artifact_summaries_qparity20260610 Table

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

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| artifact_id | `uuid` | YES | - | - |
| artifact_type | `text` | YES | - | - |
| lifecycle_stage | `integer(32)` | YES | - | - |
| summary_text | `text` | YES | - | - |
| tags | `jsonb` | YES | - | - |
| llm_model | `text` | YES | - | - |
| token_count | `integer(32)` | YES | - | - |
| source_updated_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
