# execution_sequences_v2 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-15T00:39:41.914Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (27 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `character varying(50)` | **NO** | - | - |
| directive_id | `character varying(50)` | YES | - | - |
| title | `character varying(500)` | **NO** | - | - |
| description | `text` | YES | - | - |
| sequence_number | `integer(32)` | **NO** | - | - |
| status | `character varying(50)` | **NO** | - | - |
| phase | `character varying(100)` | YES | - | - |
| phase_description | `text` | YES | - | - |
| planned_start | `timestamp without time zone` | YES | - | - |
| planned_end | `timestamp without time zone` | YES | - | - |
| actual_start | `timestamp without time zone` | YES | - | - |
| actual_end | `timestamp without time zone` | YES | - | - |
| timeline_notes | `text` | YES | - | - |
| progress | `integer(32)` | YES | `0` | - |
| deliverables | `jsonb` | YES | - | - |
| deliverable_details | `text` | YES | - | - |
| assigned_to | `jsonb` | YES | `'[]'::jsonb` | - |
| resource_notes | `text` | YES | - | - |
| dependencies | `jsonb` | YES | `'[]'::jsonb` | - |
| dependency_rationale | `text` | YES | - | - |
| blockers | `jsonb` | YES | `'[]'::jsonb` | - |
| blocker_context | `text` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| updated_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| created_by | `character varying(100)` | YES | - | - |
| updated_by | `character varying(100)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `execution_sequences_v2_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `execution_sequences_v2_directive_id_fkey`: directive_id → strategic_directives_v2(id)

### Unique Constraints
- `execution_sequences_v2_directive_id_sequence_number_key`: UNIQUE (directive_id, sequence_number)

### Check Constraints
- `execution_sequences_v2_progress_check`: CHECK (((progress >= 0) AND (progress <= 100)))
- `execution_sequences_v2_status_check`: CHECK (((status)::text = ANY ((ARRAY['planned'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'blocked'::character varying, 'cancelled'::character varying])::text[])))

## Indexes

- `execution_sequences_v2_directive_id_sequence_number_key`
  ```sql
  CREATE UNIQUE INDEX execution_sequences_v2_directive_id_sequence_number_key ON public.execution_sequences_v2 USING btree (directive_id, sequence_number)
  ```
- `execution_sequences_v2_pkey`
  ```sql
  CREATE UNIQUE INDEX execution_sequences_v2_pkey ON public.execution_sequences_v2 USING btree (id)
  ```
- `idx_execution_sequences_v2_directive`
  ```sql
  CREATE INDEX idx_execution_sequences_v2_directive ON public.execution_sequences_v2 USING btree (directive_id)
  ```
- `idx_execution_sequences_v2_order`
  ```sql
  CREATE INDEX idx_execution_sequences_v2_order ON public.execution_sequences_v2 USING btree (directive_id, sequence_number)
  ```
- `idx_execution_sequences_v2_status`
  ```sql
  CREATE INDEX idx_execution_sequences_v2_status ON public.execution_sequences_v2 USING btree (status)
  ```

## RLS Policies

### 1. authenticated_read_execution_sequences_v2 (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_execution_sequences_v2 (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_execution_sequences_v2_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
