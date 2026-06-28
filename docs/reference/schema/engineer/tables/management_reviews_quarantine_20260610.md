# management_reviews_quarantine_20260610 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-28T19:50:05.906Z
**Rows**: 45,015
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (23 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| review_date | `date` | YES | - | - |
| review_type | `text` | YES | - | - |
| baseline_version_from | `integer(32)` | YES | - | - |
| baseline_version_to | `integer(32)` | YES | - | - |
| planned_capabilities | `integer(32)` | YES | - | - |
| actual_capabilities | `integer(32)` | YES | - | - |
| planned_ventures | `integer(32)` | YES | - | - |
| actual_ventures | `integer(32)` | YES | - | - |
| planned_sds | `integer(32)` | YES | - | - |
| actual_sds | `integer(32)` | YES | - | - |
| okr_snapshot | `jsonb` | YES | - | - |
| risk_snapshot | `jsonb` | YES | - | - |
| strategy_health | `jsonb` | YES | - | - |
| decisions | `jsonb` | YES | - | - |
| actions | `jsonb` | YES | - | - |
| pipeline_snapshot | `jsonb` | YES | - | - |
| eva_narrative | `text` | YES | - | - |
| eva_proposals | `jsonb` | YES | - | - |
| chairman_notes | `text` | YES | - | - |
| chairman_approved_proposals | `jsonb` | YES | - | - |
| overall_score | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
