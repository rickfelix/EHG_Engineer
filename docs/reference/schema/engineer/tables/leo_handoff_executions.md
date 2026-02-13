# leo_handoff_executions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T20:27:15.571Z
**Rows**: 3,328
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (25 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| handoff_type | `text` | **NO** | - | - |
| from_agent | `text` | **NO** | - | - |
| to_agent | `text` | **NO** | - | - |
| executive_summary | `text` | YES | - | - |
| deliverables_manifest | `jsonb` | YES | `'[]'::jsonb` | - |
| verification_results | `jsonb` | YES | `'{}'::jsonb` | - |
| compliance_status | `jsonb` | YES | `'{}'::jsonb` | - |
| quality_metrics | `jsonb` | YES | `'{}'::jsonb` | - |
| recommendations | `jsonb` | YES | `'[]'::jsonb` | - |
| action_items | `jsonb` | YES | `'[]'::jsonb` | - |
| status | `text` | YES | `'created'::text` | - |
| validation_score | `integer(32)` | YES | - | - |
| rejection_reason | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| accepted_at | `timestamp with time zone` | YES | - | - |
| created_by | `text` | YES | `'SYSTEM'::text` | - |
| file_path | `text` | YES | - | - |
| initiated_at | `timestamp with time zone` | YES | `now()` | Timestamp when handoff execution was initiated (default: NOW()) |
| completed_at | `timestamp with time zone` | YES | - | Timestamp when handoff execution completed (success, failure, or rejection) |
| validation_passed | `boolean` | YES | - | Boolean flag indicating if validation passed (true) or failed (false) |
| validation_details | `jsonb` | YES | - | JSONB field storing structured validation results and verification data |
| prd_id | `text` | YES | - | Reference to PRD ID for PLAN-to-EXEC handoffs |
| template_id | `integer(32)` | YES | - | Foreign key to leo_handoff_templates table (INTEGER) for audit trail |

## Constraints

### Primary Key
- `leo_handoff_executions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `fk_handoff_template`: template_id → leo_handoff_templates(id)
- `leo_handoff_executions_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `leo_handoff_executions_status_check`: CHECK ((status = ANY (ARRAY['created'::text, 'validated'::text, 'accepted'::text, 'rejected'::text, 'superseded'::text])))
- `leo_handoff_executions_validation_score_check`: CHECK (((validation_score >= 0) AND (validation_score <= 100)))
- `leo_validation_details_max_size`: CHECK (((validation_details IS NULL) OR (length((validation_details)::text) <= 102400)))

## Indexes

- `idx_handoff_executions_agents`
  ```sql
  CREATE INDEX idx_handoff_executions_agents ON public.leo_handoff_executions USING btree (from_agent, to_agent)
  ```
- `idx_handoff_executions_initiated_at`
  ```sql
  CREATE INDEX idx_handoff_executions_initiated_at ON public.leo_handoff_executions USING btree (initiated_at DESC)
  ```
- `idx_handoff_executions_sd_id`
  ```sql
  CREATE INDEX idx_handoff_executions_sd_id ON public.leo_handoff_executions USING btree (sd_id)
  ```
- `idx_handoff_executions_status`
  ```sql
  CREATE INDEX idx_handoff_executions_status ON public.leo_handoff_executions USING btree (status)
  ```
- `idx_handoff_executions_template_id`
  ```sql
  CREATE INDEX idx_handoff_executions_template_id ON public.leo_handoff_executions USING btree (template_id)
  ```
- `idx_handoff_executions_type`
  ```sql
  CREATE INDEX idx_handoff_executions_type ON public.leo_handoff_executions USING btree (handoff_type)
  ```
- `leo_handoff_executions_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_handoff_executions_pkey ON public.leo_handoff_executions USING btree (id)
  ```

## RLS Policies

### 1. Anon users can read handoff_executions (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_read_leo_handoff_executions (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_all_leo_handoff_executions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
