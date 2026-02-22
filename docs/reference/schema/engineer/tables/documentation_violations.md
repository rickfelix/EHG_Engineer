# documentation_violations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T16:05:57.778Z
**Rows**: 282
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| violation_type | `text` | **NO** | - | - |
| file_path | `text` | YES | - | - |
| folder_path | `text` | YES | - | - |
| responsible_agent | `text` | YES | - | - |
| related_sd_id | `text` | YES | - | - |
| leo_event_type | `text` | YES | - | - |
| leo_event_details | `jsonb` | YES | - | - |
| severity | `text` | YES | `'MEDIUM'::text` | - |
| detected_at | `timestamp with time zone` | YES | `now()` | - |
| resolution_status | `text` | YES | `'PENDING'::text` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolution_notes | `text` | YES | - | - |
| auto_resolved | `boolean` | YES | `false` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `documentation_violations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `documentation_violations_related_sd_id_fkey`: related_sd_id → strategic_directives_v2(id)

### Check Constraints
- `documentation_violations_resolution_status_check`: CHECK ((resolution_status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'RESOLVED'::text, 'IGNORED'::text, 'ESCALATED'::text])))
- `documentation_violations_responsible_agent_check`: CHECK ((responsible_agent = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text, 'UNKNOWN'::text])))
- `documentation_violations_severity_check`: CHECK ((severity = ANY (ARRAY['CRITICAL'::text, 'HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `documentation_violations_violation_type_check`: CHECK ((violation_type = ANY (ARRAY['FILE_INSTEAD_OF_DB'::text, 'MISSING_DOCUMENTATION'::text, 'ORPHANED_FILE'::text, 'WRONG_LOCATION'::text, 'DUPLICATE_CONTENT'::text, 'OUTDATED_CONTENT'::text, 'NO_TEMPLATE_COMPLIANCE'::text, 'UNAUTHORIZED_CREATION'::text])))

## Indexes

- `documentation_violations_pkey`
  ```sql
  CREATE UNIQUE INDEX documentation_violations_pkey ON public.documentation_violations USING btree (id)
  ```
- `idx_violations_agent`
  ```sql
  CREATE INDEX idx_violations_agent ON public.documentation_violations USING btree (responsible_agent)
  ```
- `idx_violations_severity`
  ```sql
  CREATE INDEX idx_violations_severity ON public.documentation_violations USING btree (severity)
  ```
- `idx_violations_status`
  ```sql
  CREATE INDEX idx_violations_status ON public.documentation_violations USING btree (resolution_status)
  ```
- `idx_violations_type`
  ```sql
  CREATE INDEX idx_violations_type ON public.documentation_violations USING btree (violation_type)
  ```

## RLS Policies

### 1. authenticated_read_documentation_violations (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_documentation_violations (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### tr_violations_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_doc_monitor_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
