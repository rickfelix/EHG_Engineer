# venture_artifacts_qparity20260610 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 24
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (28 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| lifecycle_stage | `integer(32)` | YES | - | - |
| artifact_type | `character varying(50)` | YES | - | - |
| title | `character varying(255)` | YES | - | - |
| content | `text` | YES | - | - |
| file_url | `text` | YES | - | - |
| version | `integer(32)` | YES | - | - |
| is_current | `boolean` | YES | - | - |
| metadata | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| created_by | `uuid` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |
| quality_score | `integer(32)` | YES | - | - |
| validation_status | `character varying(20)` | YES | - | - |
| validated_at | `timestamp with time zone` | YES | - | - |
| validated_by | `character varying(100)` | YES | - | - |
| epistemic_classification | `text` | YES | - | - |
| epistemic_evidence | `jsonb` | YES | - | - |
| artifact_embedding | `USER-DEFINED` | YES | - | - |
| embedding_model | `text` | YES | - | - |
| embedding_updated_at | `timestamp with time zone` | YES | - | - |
| indexing_status | `text` | YES | - | - |
| source | `character varying(100)` | YES | - | - |
| artifact_data | `jsonb` | YES | - | - |
| supports_vision_key | `character varying(100)` | YES | - | - |
| supports_plan_key | `character varying(100)` | YES | - | - |
| platform | `text` | YES | - | - |

---

[← Back to Schema Overview](../database-schema-overview.md)
