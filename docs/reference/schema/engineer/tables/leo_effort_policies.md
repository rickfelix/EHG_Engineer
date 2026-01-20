# leo_effort_policies Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-20T14:22:16.453Z
**Rows**: 16
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| phase | `character varying(20)` | **NO** | - | LEO Protocol phase: LEAD, PLAN, EXEC, VERIFY |
| complexity_level | `character varying(20)` | **NO** | - | SD complexity: simple, moderate, complex, critical |
| estimated_hours | `numeric(5,2)` | **NO** | - | Expected effort hours for this phase/complexity |
| model_tier | `character varying(20)` | **NO** | `'standard'::character varying` | Model selection tier: basic, standard, advanced, premium |
| metadata | `jsonb` | YES | `'{}'::jsonb` | Additional configuration: max_tokens, temperature, etc. |
| is_active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `leo_effort_policies_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `unique_phase_complexity`: UNIQUE (phase, complexity_level)

### Check Constraints
- `leo_effort_policies_complexity_level_check`: CHECK (((complexity_level)::text = ANY ((ARRAY['simple'::character varying, 'moderate'::character varying, 'complex'::character varying, 'critical'::character varying])::text[])))
- `leo_effort_policies_estimated_hours_check`: CHECK ((estimated_hours > (0)::numeric))
- `leo_effort_policies_model_tier_check`: CHECK (((model_tier)::text = ANY ((ARRAY['basic'::character varying, 'standard'::character varying, 'advanced'::character varying, 'premium'::character varying])::text[])))
- `leo_effort_policies_phase_check`: CHECK (((phase)::text = ANY ((ARRAY['LEAD'::character varying, 'PLAN'::character varying, 'EXEC'::character varying, 'VERIFY'::character varying])::text[])))

## Indexes

- `idx_leo_effort_policies_active`
  ```sql
  CREATE INDEX idx_leo_effort_policies_active ON public.leo_effort_policies USING btree (is_active) WHERE (is_active = true)
  ```
- `idx_leo_effort_policies_complexity`
  ```sql
  CREATE INDEX idx_leo_effort_policies_complexity ON public.leo_effort_policies USING btree (complexity_level)
  ```
- `idx_leo_effort_policies_lookup`
  ```sql
  CREATE INDEX idx_leo_effort_policies_lookup ON public.leo_effort_policies USING btree (phase, complexity_level) WHERE (is_active = true)
  ```
- `idx_leo_effort_policies_phase`
  ```sql
  CREATE INDEX idx_leo_effort_policies_phase ON public.leo_effort_policies USING btree (phase)
  ```
- `leo_effort_policies_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_effort_policies_pkey ON public.leo_effort_policies USING btree (id)
  ```
- `unique_phase_complexity`
  ```sql
  CREATE UNIQUE INDEX unique_phase_complexity ON public.leo_effort_policies USING btree (phase, complexity_level)
  ```

## RLS Policies

### 1. leo_effort_policies_all_service (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. leo_effort_policies_select_anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 3. leo_effort_policies_select_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trigger_leo_effort_policies_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_leo_effort_policies_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
