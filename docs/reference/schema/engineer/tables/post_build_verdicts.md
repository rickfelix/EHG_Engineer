# post_build_verdicts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 276
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| artifact_type | `text` | **NO** | - | - |
| claim_ref | `text` | **NO** | - | Stable identifier for the specific claim within the artifact (e.g. a user-story key). For artifact-level dispositions with no sub-claim breakdown, use the artifact_type value itself. |
| disposition | `text` | **NO** | - | - |
| evidence_refs | `jsonb` | **NO** | `'[]'::jsonb` | Array of {path, line} references into the target venture's OWN repo. Never raw file content. |
| deviation_artifact_id | `uuid` | YES | - | venture_artifacts.id of the Child-A deviation record, when disposition is DEVIATED_WITH_DOCUMENTED_REASON. |
| claim_description | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `post_build_verdicts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `fk_post_build_verdicts_deviation_artifact`: deviation_artifact_id → venture_artifacts(id)
- `post_build_verdicts_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `uq_post_build_verdicts_item`: UNIQUE (venture_id, artifact_type, claim_ref)

### Check Constraints
- `post_build_verdicts_disposition_check`: CHECK ((disposition = ANY (ARRAY['BUILT'::text, 'PARTIAL'::text, 'MISSING'::text, 'DEVIATED_WITH_DOCUMENTED_REASON'::text, 'DEVIATED_UNDOCUMENTED'::text])))

## Indexes

- `idx_post_build_verdicts_disposition`
  ```sql
  CREATE INDEX idx_post_build_verdicts_disposition ON public.post_build_verdicts USING btree (disposition)
  ```
- `idx_post_build_verdicts_venture`
  ```sql
  CREATE INDEX idx_post_build_verdicts_venture ON public.post_build_verdicts USING btree (venture_id)
  ```
- `post_build_verdicts_pkey`
  ```sql
  CREATE UNIQUE INDEX post_build_verdicts_pkey ON public.post_build_verdicts USING btree (id)
  ```
- `uq_post_build_verdicts_item`
  ```sql
  CREATE UNIQUE INDEX uq_post_build_verdicts_item ON public.post_build_verdicts USING btree (venture_id, artifact_type, claim_ref)
  ```

## RLS Policies

### 1. Authenticated can read post_build_verdicts (SELECT)

- **Roles**: {public}
- **Using**: `(auth.role() = 'authenticated'::text)`

### 2. Service role full access to post_build_verdicts (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
