# srip_brand_interviews Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-15T00:40:53.132Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| site_dna_id | `uuid` | YES | - | - |
| answers | `jsonb` | **NO** | `'{}'::jsonb` | JSONB containing the 12 brand interview question-answer pairs (e.g., brand personality, target audience, tone of voice). |
| pre_populated_count | `integer(32)` | YES | `0` | Number of interview questions that were automatically filled from site DNA analysis. |
| manual_input_count | `integer(32)` | YES | `0` | Number of interview questions that required manual user input. |
| status | `character varying(20)` | YES | `'draft'::character varying` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `character varying(100)` | YES | - | - |

## Constraints

### Primary Key
- `srip_brand_interviews_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `srip_brand_interviews_site_dna_id_fkey`: site_dna_id → srip_site_dna(id)
- `srip_brand_interviews_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `srip_brand_interviews_status_check`: CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'in_progress'::character varying, 'completed'::character varying])::text[])))

## Indexes

- `idx_srip_brand_interviews_venture_id`
  ```sql
  CREATE INDEX idx_srip_brand_interviews_venture_id ON public.srip_brand_interviews USING btree (venture_id)
  ```
- `srip_brand_interviews_pkey`
  ```sql
  CREATE UNIQUE INDEX srip_brand_interviews_pkey ON public.srip_brand_interviews USING btree (id)
  ```

## RLS Policies

### 1. srip_brand_interviews_delete_policy (DELETE)

- **Roles**: {public}
- **Using**: `true`

### 2. srip_brand_interviews_insert_policy (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 3. srip_brand_interviews_select_policy (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 4. srip_brand_interviews_update_policy (UPDATE)

- **Roles**: {public}
- **Using**: `true`

## Triggers

### update_srip_brand_interviews_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
