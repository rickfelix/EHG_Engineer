# adherence_rubrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| rubric_key | `text` | **NO** | - | - |
| version | `integer(32)` | **NO** | - | - |
| status | `text` | **NO** | `'draft'::text` | - |
| dimensions | `jsonb` | **NO** | - | jsonb map of dimension_name -> {scale, description, evidence_required, behavioral_anchors}. No DB-level restriction on dimension names (unlike leo_scoring_rubrics). |
| dimension_floor | `numeric` | **NO** | - | Per-dimension minimum passing score (chairman-ratified: 3, on a 1-5 scale). |
| mean_floor | `numeric` | **NO** | - | Minimum mean score across all dimensions (chairman-ratified: 4, on a 1-5 scale). |
| zero_unscored_fails | `boolean` | **NO** | `true` | If true, any unscored (no-evidence) dimension fails the rubric regardless of other scores (chairman-ratified: true). |
| supersedes_rubric_id | `uuid` | YES | - | - |
| checksum | `text` | **NO** | - | - |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | **NO** | `'00000000-0000-0000-0000-000000000000'::uuid` | - |
| published_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `adherence_rubrics_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `adherence_rubrics_supersedes_rubric_id_fkey`: supersedes_rubric_id → adherence_rubrics(id)

### Unique Constraints
- `uq_adherence_rubrics_key_version`: UNIQUE (rubric_key, version)

### Check Constraints
- `adherence_rubrics_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'deprecated'::text])))
- `chk_adherence_rubrics_published_has_date`: CHECK ((((status = 'published'::text) AND (published_at IS NOT NULL)) OR (status <> 'published'::text)))

## Indexes

- `adherence_rubrics_pkey`
  ```sql
  CREATE UNIQUE INDEX adherence_rubrics_pkey ON public.adherence_rubrics USING btree (id)
  ```
- `uq_adherence_rubrics_key_version`
  ```sql
  CREATE UNIQUE INDEX uq_adherence_rubrics_key_version ON public.adherence_rubrics USING btree (rubric_key, version)
  ```

## RLS Policies

### 1. Anon can read published adherence rubrics (SELECT)

- **Roles**: {public}
- **Using**: `(status = 'published'::text)`

### 2. Service role full access to adherence_rubrics (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_adherence_rubrics_immutable_delete

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION adherence_rubrics_immutable()`

### trg_adherence_rubrics_immutable_update

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION adherence_rubrics_immutable()`

---

[← Back to Schema Overview](../database-schema-overview.md)
