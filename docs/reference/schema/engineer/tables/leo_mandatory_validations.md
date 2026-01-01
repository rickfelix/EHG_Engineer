# leo_mandatory_validations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-01T22:50:58.156Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | YES | - | - |
| prd_id | `text` | YES | - | - |
| phase | `text` | YES | - | - |
| sub_agent_code | `text` | YES | - | - |
| status | `text` | YES | - | - |
| results | `jsonb` | YES | - | - |
| created_at | `timestamp without time zone` | YES | `now()` | - |
| updated_at | `timestamp without time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_mandatory_validations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_mandatory_validations_sub_agent_code_fkey`: sub_agent_code → leo_sub_agents(code)

### Check Constraints
- `leo_mandatory_validations_phase_check`: CHECK ((phase = ANY (ARRAY['LEAD_TO_PLAN'::text, 'PLAN_TO_EXEC'::text, 'EXEC_TO_VERIFICATION'::text, 'FINAL_APPROVAL'::text])))
- `leo_mandatory_validations_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text, 'skipped'::text])))

## Indexes

- `idx_mandatory_validations_phase`
  ```sql
  CREATE INDEX idx_mandatory_validations_phase ON public.leo_mandatory_validations USING btree (phase)
  ```
- `idx_mandatory_validations_status`
  ```sql
  CREATE INDEX idx_mandatory_validations_status ON public.leo_mandatory_validations USING btree (status)
  ```
- `leo_mandatory_validations_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_mandatory_validations_pkey ON public.leo_mandatory_validations USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_mandatory_validations (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_mandatory_validations (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
