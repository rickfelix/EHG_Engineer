# leo_handoff_rejections Table

**Generated**: 2025-10-28T12:15:30.153Z
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| execution_id | `uuid` | YES | - | - |
| rejected_at | `timestamp with time zone` | YES | `now()` | - |
| rejected_by | `text` | YES | - | - |
| rejection_reason | `text` | **NO** | - | Human-readable explanation of why handoff was rejected |
| required_improvements | `jsonb` | **NO** | `'[]'::jsonb` | - |
| blocking_validations | `jsonb` | YES | `'[]'::jsonb` | - |
| recommended_actions | `jsonb` | YES | `'[]'::jsonb` | - |
| return_to_agent | `text` | **NO** | - | - |
| retry_instructions | `text` | YES | - | - |
| estimated_fix_time | `text` | YES | - | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolution_notes | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `leo_handoff_rejections_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_handoff_rejections_execution_id_fkey`: execution_id → leo_handoff_executions(id)

## Indexes

- `idx_handoff_rejections_agent`
  ```sql
  CREATE INDEX idx_handoff_rejections_agent ON public.leo_handoff_rejections USING btree (return_to_agent)
  ```
- `idx_handoff_rejections_execution`
  ```sql
  CREATE INDEX idx_handoff_rejections_execution ON public.leo_handoff_rejections USING btree (execution_id)
  ```
- `idx_handoff_rejections_resolved`
  ```sql
  CREATE INDEX idx_handoff_rejections_resolved ON public.leo_handoff_rejections USING btree (resolved_at)
  ```
- `leo_handoff_rejections_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_handoff_rejections_pkey ON public.leo_handoff_rejections USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_handoff_rejections (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_handoff_rejections (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
