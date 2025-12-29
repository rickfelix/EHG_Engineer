# retrospective_triggers Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-29T04:33:05.729Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| trigger_name | `text` | **NO** | - | - |
| trigger_type | `text` | YES | - | - |
| event_conditions | `jsonb` | YES | - | - |
| schedule_cron | `text` | YES | - | - |
| threshold_conditions | `jsonb` | YES | - | - |
| template_id | `uuid` | YES | - | - |
| auto_generate | `boolean` | YES | `false` | - |
| requires_approval | `boolean` | YES | `true` | - |
| is_active | `boolean` | YES | `true` | - |
| last_triggered | `timestamp with time zone` | YES | - | - |
| next_scheduled | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `retrospective_triggers_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `retrospective_triggers_template_id_fkey`: template_id → retrospective_templates(id)

### Unique Constraints
- `retrospective_triggers_trigger_name_key`: UNIQUE (trigger_name)

### Check Constraints
- `retrospective_triggers_trigger_type_check`: CHECK ((trigger_type = ANY (ARRAY['EVENT'::text, 'SCHEDULE'::text, 'THRESHOLD'::text, 'MANUAL'::text])))

## Indexes

- `retrospective_triggers_pkey`
  ```sql
  CREATE UNIQUE INDEX retrospective_triggers_pkey ON public.retrospective_triggers USING btree (id)
  ```
- `retrospective_triggers_trigger_name_key`
  ```sql
  CREATE UNIQUE INDEX retrospective_triggers_trigger_name_key ON public.retrospective_triggers USING btree (trigger_name)
  ```

## RLS Policies

### 1. authenticated_read_retrospective_triggers (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_retrospective_triggers (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
