# leo_scoring_rubrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T16:54:28.108Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| rubric_key | `text` | **NO** | - | - |
| version | `integer(32)` | **NO** | - | - |
| status | `text` | **NO** | `'draft'::text` | - |
| dimensions | `jsonb` | **NO** | - | - |
| normalization_rules | `jsonb` | **NO** | - | - |
| stability_rules | `jsonb` | **NO** | - | - |
| dedupe_merge_confidence_rules | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | **NO** | - | - |
| checksum | `text` | **NO** | - | - |
| supersedes_rubric_id | `uuid` | YES | - | - |
| notes | `text` | YES | - | - |

## Constraints

### Primary Key
- `leo_scoring_rubrics_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_scoring_rubrics_supersedes_rubric_id_fkey`: supersedes_rubric_id → leo_scoring_rubrics(id)

### Unique Constraints
- `uq_leo_scoring_rubrics_key_version`: UNIQUE (rubric_key, version)

### Check Constraints
- `leo_scoring_rubrics_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'deprecated'::text])))

## Indexes

- `idx_leo_scoring_rubrics_checksum`
  ```sql
  CREATE INDEX idx_leo_scoring_rubrics_checksum ON public.leo_scoring_rubrics USING btree (checksum)
  ```
- `idx_leo_scoring_rubrics_key_status`
  ```sql
  CREATE INDEX idx_leo_scoring_rubrics_key_status ON public.leo_scoring_rubrics USING btree (rubric_key, status)
  ```
- `leo_scoring_rubrics_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_scoring_rubrics_pkey ON public.leo_scoring_rubrics USING btree (id)
  ```
- `uq_leo_scoring_rubrics_key_version`
  ```sql
  CREATE UNIQUE INDEX uq_leo_scoring_rubrics_key_version ON public.leo_scoring_rubrics USING btree (rubric_key, version)
  ```

## RLS Policies

### 1. Anon can read published scoring rubrics (SELECT)

- **Roles**: {public}
- **Using**: `(status = 'published'::text)`

### 2. Service role full access to leo_scoring_rubrics (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_leo_scoring_rubrics_immutable_delete

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION leo_scoring_rubrics_immutable()`

### trg_leo_scoring_rubrics_immutable_update

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION leo_scoring_rubrics_immutable()`

### trg_leo_scoring_rubrics_validate

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION leo_scoring_rubrics_validate()`

---

[← Back to Schema Overview](../database-schema-overview.md)
