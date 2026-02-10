# enhancement_proposals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T05:38:09.001Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | **NO** | `'leo'::text` | - |
| title | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| proposed_change | `jsonb` | **NO** | - | Structured JSON describing the proposed change |
| source_type | `character varying(20)` | **NO** | - | Origin type: finding, pattern, retrospective, efficiency, or gap |
| source_id | `uuid` | YES | - | - |
| status | `character varying(20)` | **NO** | `'pending'::character varying` | Lifecycle: pending -> vetted -> approved -> applied |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| vetted_at | `timestamp with time zone` | YES | - | - |
| approved_at | `timestamp with time zone` | YES | - | - |
| applied_at | `timestamp with time zone` | YES | - | - |
| applied_improvement_id | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `enhancement_proposals_pkey`: PRIMARY KEY (id)

### Check Constraints
- `enhancement_proposals_source_type_check`: CHECK (((source_type)::text = ANY ((ARRAY['finding'::character varying, 'pattern'::character varying, 'retrospective'::character varying, 'efficiency'::character varying, 'gap'::character varying])::text[])))
- `enhancement_proposals_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'vetted'::character varying, 'approved'::character varying, 'applied'::character varying])::text[])))

## Indexes

- `enhancement_proposals_pkey`
  ```sql
  CREATE UNIQUE INDEX enhancement_proposals_pkey ON public.enhancement_proposals USING btree (id)
  ```
- `idx_enhancement_proposals_proposed_change`
  ```sql
  CREATE INDEX idx_enhancement_proposals_proposed_change ON public.enhancement_proposals USING gin (proposed_change)
  ```
- `idx_enhancement_proposals_source`
  ```sql
  CREATE INDEX idx_enhancement_proposals_source ON public.enhancement_proposals USING btree (source_type, source_id)
  ```
- `idx_enhancement_proposals_status_created`
  ```sql
  CREATE INDEX idx_enhancement_proposals_status_created ON public.enhancement_proposals USING btree (status, created_at DESC)
  ```

## RLS Policies

### 1. authenticated_select_enhancement_proposals (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_enhancement_proposals (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_enforce_proposal_status_workflow

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_enforce_proposal_status_workflow()`

### trg_enhancement_proposals_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_enhancement_proposals_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
