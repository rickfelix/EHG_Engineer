# anthropic_plugin_registry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-24T22:01:14.539Z
**Rows**: 12
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| plugin_name | `text` | **NO** | - | - |
| source_repo | `text` | **NO** | - | - |
| source_path | `text` | **NO** | - | - |
| source_commit | `text` | YES | - | - |
| ehg_skill_id | `uuid` | YES | - | - |
| fitness_score | `numeric(3,1)` | YES | - | - |
| fitness_evaluation | `jsonb` | YES | - | - |
| status | `text` | **NO** | `'discovered'::text` | - |
| adaptation_date | `timestamp with time zone` | YES | - | - |
| last_scanned_at | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `anthropic_plugin_registry_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `anthropic_plugin_registry_ehg_skill_id_fkey`: ehg_skill_id → agent_skills(id)

### Unique Constraints
- `anthropic_plugin_registry_source_repo_plugin_name_key`: UNIQUE (source_repo, plugin_name)

### Check Constraints
- `anthropic_plugin_registry_status_check`: CHECK ((status = ANY (ARRAY['discovered'::text, 'evaluating'::text, 'adapted'::text, 'rejected'::text, 'outdated'::text])))

## Indexes

- `anthropic_plugin_registry_pkey`
  ```sql
  CREATE UNIQUE INDEX anthropic_plugin_registry_pkey ON public.anthropic_plugin_registry USING btree (id)
  ```
- `anthropic_plugin_registry_source_repo_plugin_name_key`
  ```sql
  CREATE UNIQUE INDEX anthropic_plugin_registry_source_repo_plugin_name_key ON public.anthropic_plugin_registry USING btree (source_repo, plugin_name)
  ```
- `idx_plugin_registry_fitness_score`
  ```sql
  CREATE INDEX idx_plugin_registry_fitness_score ON public.anthropic_plugin_registry USING btree (fitness_score DESC NULLS LAST)
  ```
- `idx_plugin_registry_source_repo`
  ```sql
  CREATE INDEX idx_plugin_registry_source_repo ON public.anthropic_plugin_registry USING btree (source_repo)
  ```
- `idx_plugin_registry_status`
  ```sql
  CREATE INDEX idx_plugin_registry_status ON public.anthropic_plugin_registry USING btree (status)
  ```

## RLS Policies

### 1. service_role_full_access (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### set_updated_at_plugin_registry

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
