# roadmap_waves Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-13T19:33:25.298Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| roadmap_id | `uuid` | **NO** | - | - |
| sequence_rank | `integer(32)` | **NO** | - | Execution order within the roadmap. UNIQUE per roadmap ensures no duplicate ranks. |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| status | `character varying(20)` | **NO** | `'proposed'::character varying` | - |
| depends_on_wave_ids | `ARRAY` | YES | `'{}'::uuid[]` | Soft array of wave UUIDs this wave depends on. No FK constraint for flexibility. |
| okr_objective_ids | `ARRAY` | YES | `'{}'::uuid[]` | - |
| proposed_okrs | `jsonb` | YES | `'[]'::jsonb` | JSONB array of proposed OKR structures. Format: [{"objective":"...", "key_results":["..."]}] |
| confidence_score | `numeric(3,2)` | YES | `0.00` | - |
| progress_pct | `numeric(5,2)` | YES | `0.00` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | - | - |
| time_horizon | `text` | YES | - | - |

## Constraints

### Primary Key
- `roadmap_waves_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `roadmap_waves_roadmap_id_fkey`: roadmap_id → strategic_roadmaps(id)

### Unique Constraints
- `roadmap_waves_roadmap_id_sequence_rank_key`: UNIQUE (roadmap_id, sequence_rank)

### Check Constraints
- `roadmap_waves_status_check`: CHECK (((status)::text = ANY ((ARRAY['proposed'::character varying, 'approved'::character varying, 'active'::character varying, 'completed'::character varying, 'archived'::character varying])::text[])))
- `roadmap_waves_time_horizon_check`: CHECK ((time_horizon = ANY (ARRAY['now'::text, 'next'::text, 'later'::text, 'eventually'::text])))

## Indexes

- `idx_waves_roadmap_rank`
  ```sql
  CREATE INDEX idx_waves_roadmap_rank ON public.roadmap_waves USING btree (roadmap_id, sequence_rank)
  ```
- `idx_waves_status`
  ```sql
  CREATE INDEX idx_waves_status ON public.roadmap_waves USING btree (status)
  ```
- `roadmap_waves_pkey`
  ```sql
  CREATE UNIQUE INDEX roadmap_waves_pkey ON public.roadmap_waves USING btree (id)
  ```
- `roadmap_waves_roadmap_id_sequence_rank_key`
  ```sql
  CREATE UNIQUE INDEX roadmap_waves_roadmap_id_sequence_rank_key ON public.roadmap_waves USING btree (roadmap_id, sequence_rank)
  ```

## RLS Policies

### 1. roadmap_waves_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. roadmap_waves_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_roadmap_waves_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_roadmap_waves_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
