# sd_key_result_alignment Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T16:54:28.108Z
**Rows**: 28
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying` | YES | - | - |
| key_result_id | `uuid` | YES | - | - |
| contribution_type | `text` | YES | `'supporting'::text` | direct=moves KR directly, enabling=unblocks work, supporting=helps indirectly |
| contribution_weight | `numeric` | YES | `1.0` | - |
| contribution_note | `text` | YES | - | - |
| aligned_by | `text` | YES | `'manual'::text` | Who/what created this alignment |
| alignment_confidence | `numeric` | YES | - | - |
| created_by | `text` | YES | `'system'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_key_result_alignment_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_key_result_alignment_key_result_id_fkey`: key_result_id → key_results(id)
- `sd_key_result_alignment_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Unique Constraints
- `sd_key_result_alignment_sd_id_key_result_id_key`: UNIQUE (sd_id, key_result_id)

### Check Constraints
- `sd_key_result_alignment_aligned_by_check`: CHECK ((aligned_by = ANY (ARRAY['manual'::text, 'ai_suggested'::text, 'ai_auto'::text])))
- `sd_key_result_alignment_alignment_confidence_check`: CHECK (((alignment_confidence >= (0)::numeric) AND (alignment_confidence <= (1)::numeric)))
- `sd_key_result_alignment_contribution_type_check`: CHECK ((contribution_type = ANY (ARRAY['direct'::text, 'enabling'::text, 'supporting'::text])))
- `sd_key_result_alignment_contribution_weight_check`: CHECK ((contribution_weight > (0)::numeric))

## Indexes

- `idx_sd_kr_alignment_kr_id`
  ```sql
  CREATE INDEX idx_sd_kr_alignment_kr_id ON public.sd_key_result_alignment USING btree (key_result_id)
  ```
- `idx_sd_kr_alignment_sd_id`
  ```sql
  CREATE INDEX idx_sd_kr_alignment_sd_id ON public.sd_key_result_alignment USING btree (sd_id)
  ```
- `sd_key_result_alignment_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_key_result_alignment_pkey ON public.sd_key_result_alignment USING btree (id)
  ```
- `sd_key_result_alignment_sd_id_key_result_id_key`
  ```sql
  CREATE UNIQUE INDEX sd_key_result_alignment_sd_id_key_result_id_key ON public.sd_key_result_alignment USING btree (sd_id, key_result_id)
  ```

## RLS Policies

### 1. Chairman full access on sd_key_result_alignment (ALL)

- **Roles**: {authenticated}
- **Using**: `((auth.jwt() ->> 'email'::text) = 'rick@emeraldholdingsgroup.com'::text)`
- **With Check**: `((auth.jwt() ->> 'email'::text) = 'rick@emeraldholdingsgroup.com'::text)`

### 2. Service role bypass on sd_key_result_alignment (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
