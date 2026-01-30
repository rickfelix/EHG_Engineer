# stage_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T20:35:58.689Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| stage_number | `integer(32)` | **NO** | - | - |
| venture_id | `uuid` | **NO** | - | - |
| event_type | `text` | **NO** | - | - |
| eva_authority_level | `text` | YES | - | - |
| eva_recommendation | `jsonb` | YES | - | - |
| event_data | `jsonb` | YES | `'{}'::jsonb` | - |
| requires_approval | `boolean` | YES | `false` | - |
| approved_by | `uuid` | YES | - | - |
| approved_at | `timestamp with time zone` | YES | - | - |
| approval_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `stage_events_pkey`: PRIMARY KEY (id)

### Check Constraints
- `stage_events_eva_authority_level_check`: CHECK ((eva_authority_level = ANY (ARRAY['L0'::text, 'L1'::text, 'L2'::text, 'L3'::text, 'L4'::text])))
- `stage_events_event_type_check`: CHECK ((event_type = ANY (ARRAY['STAGE_ENTRY'::text, 'STAGE_COMPLETE'::text, 'STAGE_PAUSED'::text, 'STAGE_RESUMED'::text, 'RECURSION_TRIGGERED'::text, 'EVA_RECOMMENDATION'::text, 'CHAIRMAN_APPROVAL'::text, 'CHAIRMAN_REJECTION'::text])))
- `stage_events_stage_number_check`: CHECK (((stage_number >= 1) AND (stage_number <= 40)))

## Indexes

- `idx_stage_events_created`
  ```sql
  CREATE INDEX idx_stage_events_created ON public.stage_events USING btree (created_at DESC)
  ```
- `idx_stage_events_stage`
  ```sql
  CREATE INDEX idx_stage_events_stage ON public.stage_events USING btree (stage_number)
  ```
- `idx_stage_events_type`
  ```sql
  CREATE INDEX idx_stage_events_type ON public.stage_events USING btree (event_type)
  ```
- `idx_stage_events_venture`
  ```sql
  CREATE INDEX idx_stage_events_venture ON public.stage_events USING btree (venture_id)
  ```
- `idx_stage_events_venture_stage`
  ```sql
  CREATE INDEX idx_stage_events_venture_stage ON public.stage_events USING btree (venture_id, stage_number)
  ```
- `stage_events_pkey`
  ```sql
  CREATE UNIQUE INDEX stage_events_pkey ON public.stage_events USING btree (id)
  ```

## RLS Policies

### 1. Allow update for authenticated (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 2. insert_stage_events_policy (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(auth.uid() IS NOT NULL)`

### 3. select_stage_events_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. stage_events_delete (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
