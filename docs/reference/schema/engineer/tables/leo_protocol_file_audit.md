# leo_protocol_file_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T19:58:57.591Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| agent_type | `text` | **NO** | - | - |
| agent_id | `text` | YES | - | - |
| operation | `text` | **NO** | - | - |
| file_path | `text` | **NO** | - | - |
| leo_phase | `text` | YES | - | - |
| handoff_id | `text` | YES | - | - |
| sd_id | `text` | YES | - | - |
| is_authorized | `boolean` | YES | `false` | - |
| violates_database_first | `boolean` | YES | `false` | - |
| operation_timestamp | `timestamp with time zone` | YES | `now()` | - |
| operation_details | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_protocol_file_audit_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_protocol_file_audit_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `leo_protocol_file_audit_agent_type_check`: CHECK ((agent_type = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text, 'SUB_AGENT'::text])))
- `leo_protocol_file_audit_leo_phase_check`: CHECK ((leo_phase = ANY (ARRAY['PLANNING'::text, 'IMPLEMENTATION'::text, 'VERIFICATION'::text, 'APPROVAL'::text])))
- `leo_protocol_file_audit_operation_check`: CHECK ((operation = ANY (ARRAY['CREATE'::text, 'MODIFY'::text, 'DELETE'::text, 'MOVE'::text, 'ARCHIVE'::text])))

## Indexes

- `idx_audit_agent`
  ```sql
  CREATE INDEX idx_audit_agent ON public.leo_protocol_file_audit USING btree (agent_type)
  ```
- `idx_audit_violations`
  ```sql
  CREATE INDEX idx_audit_violations ON public.leo_protocol_file_audit USING btree (violates_database_first)
  ```
- `leo_protocol_file_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_protocol_file_audit_pkey ON public.leo_protocol_file_audit USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_protocol_file_audit (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_protocol_file_audit (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
