# venture_drafts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T23:52:12.478Z
**Rows**: 704
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| user_id | `uuid` | YES | - | - |
| name | `character varying(255)` | YES | - | - |
| description | `text` | YES | - | - |
| draft_data | `jsonb` | YES | `'{}'::jsonb` | - |
| research_results | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| venture_id | `uuid` | YES | - | - |
| current_step | `integer(32)` | YES | - | - |
| form_data | `jsonb` | YES | - | - |
| research_status | `jsonb` | YES | - | - |
| deleted_at | `text` | YES | - | - |
| competitor_analysis | `jsonb` | YES | - | - |
| market_analysis | `jsonb` | YES | - | - |
| ai_processing_status | `text` | YES | - | - |
| ai_confidence_score | `text` | YES | - | - |
| last_ai_update | `text` | YES | - | - |

## Constraints

### Primary Key
- `venture_drafts_pkey`: PRIMARY KEY (id)

## Indexes

- `venture_drafts_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_drafts_pkey ON public.venture_drafts USING btree (id)
  ```

## RLS Policies

### 1. Users own venture drafts (ALL)

- **Roles**: {public}
- **Using**: `(user_id = auth.uid())`

---

[← Back to Schema Overview](../database-schema-overview.md)
