# retrospective_action_items Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T10:51:37.586Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| retrospective_id | `uuid` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| category | `text` | YES | - | - |
| assigned_to | `text` | YES | - | - |
| priority | `text` | YES | - | - |
| due_date | `timestamp with time zone` | YES | - | - |
| status | `text` | YES | `'PENDING'::text` | - |
| completed_date | `timestamp with time zone` | YES | - | - |
| completion_notes | `text` | YES | - | - |
| expected_impact | `text` | YES | - | - |
| actual_impact | `text` | YES | - | - |
| success_criteria | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `retrospective_action_items_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `retrospective_action_items_retrospective_id_fkey`: retrospective_id → retrospectives(id)

### Check Constraints
- `retrospective_action_items_category_check`: CHECK ((category = ANY (ARRAY['PROCESS'::text, 'TECHNICAL'::text, 'COMMUNICATION'::text, 'TOOLING'::text, 'DOCUMENTATION'::text, 'TRAINING'::text])))
- `retrospective_action_items_priority_check`: CHECK ((priority = ANY (ARRAY['CRITICAL'::text, 'HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `retrospective_action_items_status_check`: CHECK ((status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'DEFERRED'::text])))

## Indexes

- `idx_action_items_assigned_to`
  ```sql
  CREATE INDEX idx_action_items_assigned_to ON public.retrospective_action_items USING btree (assigned_to)
  ```
- `idx_action_items_retrospective_id`
  ```sql
  CREATE INDEX idx_action_items_retrospective_id ON public.retrospective_action_items USING btree (retrospective_id)
  ```
- `idx_action_items_status`
  ```sql
  CREATE INDEX idx_action_items_status ON public.retrospective_action_items USING btree (status)
  ```
- `retrospective_action_items_pkey`
  ```sql
  CREATE UNIQUE INDEX retrospective_action_items_pkey ON public.retrospective_action_items USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_retrospective_action_items (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_retrospective_action_items (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### tr_action_items_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_retrospective_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
