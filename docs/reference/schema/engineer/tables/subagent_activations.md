# subagent_activations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-02T13:50:10.062Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| activating_agent | `text` | **NO** | - | - |
| phase | `text` | **NO** | - | - |
| subagent_code | `text` | **NO** | - | - |
| subagent_name | `text` | **NO** | - | - |
| activation_trigger | `text` | **NO** | - | - |
| activation_context | `jsonb` | YES | `'{}'::jsonb` | - |
| status | `text` | **NO** | `'requested'::text` | - |
| execution_notes | `text` | YES | - | - |
| execution_results | `jsonb` | YES | - | - |
| activated_at | `timestamp with time zone` | YES | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `subagent_activations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `subagent_activations_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `subagent_activations_activating_agent_check`: CHECK ((activating_agent = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text])))
- `subagent_activations_phase_check`: CHECK ((phase = ANY (ARRAY['planning'::text, 'implementation'::text, 'verification'::text])))
- `subagent_activations_status_check`: CHECK ((status = ANY (ARRAY['requested'::text, 'activated'::text, 'completed'::text, 'failed'::text, 'skipped'::text])))

## Indexes

- `idx_subagent_activations_agent_phase`
  ```sql
  CREATE INDEX idx_subagent_activations_agent_phase ON public.subagent_activations USING btree (activating_agent, phase)
  ```
- `idx_subagent_activations_sd_id`
  ```sql
  CREATE INDEX idx_subagent_activations_sd_id ON public.subagent_activations USING btree (sd_id)
  ```
- `idx_subagent_activations_status`
  ```sql
  CREATE INDEX idx_subagent_activations_status ON public.subagent_activations USING btree (status)
  ```
- `idx_subagent_activations_subagent`
  ```sql
  CREATE INDEX idx_subagent_activations_subagent ON public.subagent_activations USING btree (subagent_code)
  ```
- `subagent_activations_pkey`
  ```sql
  CREATE UNIQUE INDEX subagent_activations_pkey ON public.subagent_activations USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_subagent_activations (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_subagent_activations (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### tr_update_subagent_requirements

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION update_subagent_requirements_trigger()`

### tr_update_subagent_requirements

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION update_subagent_requirements_trigger()`

---

[← Back to Schema Overview](../database-schema-overview.md)
