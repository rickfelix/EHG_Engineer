# recursion_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T03:50:45.752Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| trigger_code | `text` | **NO** | - | - |
| source_stage | `integer(32)` | **NO** | - | - |
| target_stage | `integer(32)` | **NO** | - | - |
| recursion_count | `integer(32)` | **NO** | `1` | - |
| status | `text` | **NO** | `'pending'::text` | - |
| trigger_data | `jsonb` | **NO** | `'{}'::jsonb` | - |
| resolution_data | `jsonb` | YES | - | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolved_by | `uuid` | YES | - | - |
| escalated_at | `timestamp with time zone` | YES | - | - |
| escalation_reason | `text` | YES | - | - |
| chairman_decision | `text` | YES | - | - |
| chairman_decision_at | `timestamp with time zone` | YES | - | - |
| parent_recursion_id | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `recursion_events_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `recursion_events_parent_recursion_id_fkey`: parent_recursion_id → recursion_events(id)

### Check Constraints
- `recursion_events_recursion_count_check`: CHECK (((recursion_count >= 1) AND (recursion_count <= 3)))
- `recursion_events_source_stage_check`: CHECK (((source_stage >= 1) AND (source_stage <= 40)))
- `recursion_events_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'resolved'::text, 'escalated'::text, 'cancelled'::text])))
- `recursion_events_target_stage_check`: CHECK (((target_stage >= 1) AND (target_stage <= 40)))
- `recursion_events_trigger_code_check`: CHECK ((trigger_code = ANY (ARRAY['RESOURCE-001'::text, 'TIMELINE-001'::text, 'TECH-001'::text, 'VALIDATION-001'::text, 'MARKET-001'::text, 'RISK-001'::text])))

## Indexes

- `idx_recursion_events_pending`
  ```sql
  CREATE INDEX idx_recursion_events_pending ON public.recursion_events USING btree (status) WHERE (status = 'pending'::text)
  ```
- `idx_recursion_events_source`
  ```sql
  CREATE INDEX idx_recursion_events_source ON public.recursion_events USING btree (source_stage)
  ```
- `idx_recursion_events_status`
  ```sql
  CREATE INDEX idx_recursion_events_status ON public.recursion_events USING btree (status)
  ```
- `idx_recursion_events_trigger`
  ```sql
  CREATE INDEX idx_recursion_events_trigger ON public.recursion_events USING btree (trigger_code)
  ```
- `idx_recursion_events_venture`
  ```sql
  CREATE INDEX idx_recursion_events_venture ON public.recursion_events USING btree (venture_id)
  ```
- `recursion_events_pkey`
  ```sql
  CREATE UNIQUE INDEX recursion_events_pkey ON public.recursion_events USING btree (id)
  ```

## RLS Policies

### 1. insert_recursion_events_policy (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(auth.uid() IS NOT NULL)`

### 2. recursion_events_delete (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. select_recursion_events_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. update_recursion_events_policy (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### update_recursion_events_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
