# loop_registry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 35
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| loop_key | `text` | **NO** | - | - |
| display_name | `text` | YES | - | - |
| trigger | `text` | YES | - | - |
| closure_edge | `text` | YES | - | - |
| constituent_operators | `jsonb` | **NO** | `'[]'::jsonb` | - |
| predicate_type | `text` | **NO** | - | - |
| closure_predicate | `jsonb` | **NO** | - | - |
| dependency_edges | `jsonb` | **NO** | `'[]'::jsonb` | - |
| vision_ladder_rung_id | `uuid` | YES | - | - |
| roadmap_wave_id | `uuid` | YES | - | - |
| closing_sd_key | `text` | YES | - | - |
| verifier_process_key | `text` | YES | - | - |
| status | `text` | **NO** | `'unknown'::text` | - |
| status_reason | `text` | YES | - | - |
| evaluated_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `loop_registry_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `loop_registry_roadmap_wave_id_fkey`: roadmap_wave_id → roadmap_waves(id)
- `loop_registry_vision_ladder_rung_id_fkey`: vision_ladder_rung_id → vision_ladder_rungs(id)

### Unique Constraints
- `loop_registry_loop_key_key`: UNIQUE (loop_key)

### Check Constraints
- `loop_registry_status_check`: CHECK ((status = ANY (ARRAY['closed'::text, 'open'::text, 'starved'::text, 'unknown'::text])))

## Indexes

- `idx_loop_registry_rung`
  ```sql
  CREATE INDEX idx_loop_registry_rung ON public.loop_registry USING btree (vision_ladder_rung_id)
  ```
- `idx_loop_registry_status`
  ```sql
  CREATE INDEX idx_loop_registry_status ON public.loop_registry USING btree (status)
  ```
- `idx_loop_registry_wave`
  ```sql
  CREATE INDEX idx_loop_registry_wave ON public.loop_registry USING btree (roadmap_wave_id)
  ```
- `loop_registry_loop_key_key`
  ```sql
  CREATE UNIQUE INDEX loop_registry_loop_key_key ON public.loop_registry USING btree (loop_key)
  ```
- `loop_registry_pkey`
  ```sql
  CREATE UNIQUE INDEX loop_registry_pkey ON public.loop_registry USING btree (id)
  ```

## RLS Policies

### 1. loop_registry_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
