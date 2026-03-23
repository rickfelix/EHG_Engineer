# roadmap_wave_items Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-23T20:56:03.959Z
**Rows**: 461
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| wave_id | `uuid` | **NO** | - | - |
| source_type | `text` | **NO** | - | Intake source: todoist or youtube. Check constraint enforced. |
| source_id | `uuid` | **NO** | - | - |
| title | `text` | YES | - | - |
| promoted_to_sd_key | `text` | YES | - | SD key (e.g., SD-LEO-FEAT-001) if this item was promoted to a strategic directive. |
| priority_rank | `integer(32)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| item_disposition | `text` | YES | `'pending'::text` | Flow state: pending->selected->brainstormed->promoted (or deferred/dropped at any point) |
| brainstorm_session_id | `uuid` | YES | - | FK to brainstorm_sessions when item has been brainstormed. Null = not yet brainstormed. |

## Constraints

### Primary Key
- `roadmap_wave_items_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `roadmap_wave_items_brainstorm_session_id_fkey`: brainstorm_session_id → brainstorm_sessions(id)
- `roadmap_wave_items_wave_id_fkey`: wave_id → roadmap_waves(id)

### Unique Constraints
- `roadmap_wave_items_wave_id_source_type_source_id_key`: UNIQUE (wave_id, source_type, source_id)

### Check Constraints
- `roadmap_wave_items_item_disposition_check`: CHECK ((item_disposition = ANY (ARRAY['pending'::text, 'selected'::text, 'deferred'::text, 'brainstormed'::text, 'promoted'::text, 'dropped'::text])))
- `roadmap_wave_items_source_type_check`: CHECK ((source_type = ANY (ARRAY['todoist'::text, 'youtube'::text, 'brainstorm'::text])))

## Indexes

- `idx_wave_items_promoted`
  ```sql
  CREATE INDEX idx_wave_items_promoted ON public.roadmap_wave_items USING btree (promoted_to_sd_key) WHERE (promoted_to_sd_key IS NOT NULL)
  ```
- `idx_wave_items_source`
  ```sql
  CREATE INDEX idx_wave_items_source ON public.roadmap_wave_items USING btree (source_type, source_id)
  ```
- `idx_wave_items_wave`
  ```sql
  CREATE INDEX idx_wave_items_wave ON public.roadmap_wave_items USING btree (wave_id)
  ```
- `roadmap_wave_items_pkey`
  ```sql
  CREATE UNIQUE INDEX roadmap_wave_items_pkey ON public.roadmap_wave_items USING btree (id)
  ```
- `roadmap_wave_items_wave_id_source_type_source_id_key`
  ```sql
  CREATE UNIQUE INDEX roadmap_wave_items_wave_id_source_type_source_id_key ON public.roadmap_wave_items USING btree (wave_id, source_type, source_id)
  ```

## RLS Policies

### 1. roadmap_wave_items_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. roadmap_wave_items_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_roadmap_wave_items_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_roadmap_wave_items_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
