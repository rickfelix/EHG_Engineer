# persona_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T15:06:05.923Z
**Rows**: 3
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| target_application | `text` | **NO** | - | - |
| mandatory_personas | `ARRAY` | **NO** | `'{}'::text[]` | - |
| allowed_personas | `ARRAY` | YES | - | - |
| forbidden_personas | `ARRAY` | YES | - | - |
| optional_triggers | `jsonb` | YES | `'{}'::jsonb` | - |
| sd_type_overrides | `jsonb` | YES | `'{}'::jsonb` | - |
| is_active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `persona_config_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `persona_config_target_application_key`: UNIQUE (target_application)

## Indexes

- `idx_persona_config_active`
  ```sql
  CREATE INDEX idx_persona_config_active ON public.persona_config USING btree (target_application) WHERE (is_active = true)
  ```
- `persona_config_pkey`
  ```sql
  CREATE UNIQUE INDEX persona_config_pkey ON public.persona_config USING btree (id)
  ```
- `persona_config_target_application_key`
  ```sql
  CREATE UNIQUE INDEX persona_config_target_application_key ON public.persona_config USING btree (target_application)
  ```

## RLS Policies

### 1. service_role_full_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
