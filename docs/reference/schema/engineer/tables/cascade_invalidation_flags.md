# cascade_invalidation_flags Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-02T01:18:17.458Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| invalidation_log_id | `uuid` | **NO** | - | - |
| document_type | `text` | **NO** | - | - |
| document_id | `uuid` | **NO** | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| flagged_at | `timestamp with time zone` | **NO** | `now()` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolved_by | `text` | YES | - | - |
| resolution_notes | `text` | YES | - | - |

## Constraints

### Primary Key
- `cascade_invalidation_flags_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `cascade_invalidation_flags_invalidation_log_id_fkey`: invalidation_log_id → cascade_invalidation_log(id)

### Check Constraints
- `cascade_invalidation_flags_document_type_check`: CHECK ((document_type = ANY (ARRAY['architecture_plan'::text, 'objective'::text, 'key_result'::text, 'strategy'::text])))
- `cascade_invalidation_flags_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'acknowledged'::text, 'resolved'::text, 'dismissed'::text])))

## Indexes

- `cascade_invalidation_flags_pkey`
  ```sql
  CREATE UNIQUE INDEX cascade_invalidation_flags_pkey ON public.cascade_invalidation_flags USING btree (id)
  ```
- `idx_cascade_inv_flags_doc`
  ```sql
  CREATE INDEX idx_cascade_inv_flags_doc ON public.cascade_invalidation_flags USING btree (document_type, document_id)
  ```
- `idx_cascade_inv_flags_status`
  ```sql
  CREATE INDEX idx_cascade_inv_flags_status ON public.cascade_invalidation_flags USING btree (status) WHERE (status = 'pending'::text)
  ```

## RLS Policies

### 1. authenticated_read_cascade_flags (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_cascade_flags (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
