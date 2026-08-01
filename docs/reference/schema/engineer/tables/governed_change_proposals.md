# governed_change_proposals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-01T20:27:50.592Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| artifact_class | `text` | **NO** | - | - |
| target_ref | `text` | **NO** | - | - |
| current_hash | `text` | **NO** | - | - |
| proposed_diff | `text` | **NO** | - | - |
| diff_hash | `text` | **NO** | - | - |
| proposer | `text` | **NO** | - | - |
| provenance | `text` | **NO** | - | - |
| rationale | `text` | **NO** | - | - |
| status | `text` | **NO** | `'staged'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `governed_change_proposals_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `governed_change_proposals_idempotent`: UNIQUE (artifact_class, target_ref, current_hash, diff_hash)

### Check Constraints
- `governed_change_proposals_status_check`: CHECK ((status = ANY (ARRAY['staged'::text, 'shadow_run'::text, 'packet_attached'::text, 'withdrawn'::text])))

## Indexes

- `governed_change_proposals_idempotent`
  ```sql
  CREATE UNIQUE INDEX governed_change_proposals_idempotent ON public.governed_change_proposals USING btree (artifact_class, target_ref, current_hash, diff_hash)
  ```
- `governed_change_proposals_pkey`
  ```sql
  CREATE UNIQUE INDEX governed_change_proposals_pkey ON public.governed_change_proposals USING btree (id)
  ```
- `idx_gcp_class_status`
  ```sql
  CREATE INDEX idx_gcp_class_status ON public.governed_change_proposals USING btree (artifact_class, status)
  ```
- `idx_gcp_created`
  ```sql
  CREATE INDEX idx_gcp_created ON public.governed_change_proposals USING btree (created_at DESC)
  ```

## RLS Policies

### 1. gcp_chairman_select (SELECT)

- **Roles**: {public}
- **Using**: `fn_is_chairman()`

---

[← Back to Schema Overview](../database-schema-overview.md)
