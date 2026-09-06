# venture_exit_profiles Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-06T17:42:38.372Z
**Rows**: 1
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| exit_model | `text` | **NO** | - | - |
| version | `integer(32)` | **NO** | `1` | Incremented each time exit model changes for a venture |
| notes | `text` | YES | - | - |
| target_buyer_type | `text` | YES | - | - |
| is_current | `boolean` | **NO** | `true` | Only one profile per venture should be current |
| created_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| exit_context | `text` | YES | `'planning'::text` | Context in which the exit profile was created: planning (Stage 9) or readiness_assessment (later stages) |
| review_period | `text` | YES | - | Review period label, e.g. Q1-2026, for tracking when the profile was assessed |
| readiness_assessment | `jsonb` | YES | - | Cached separation-rehearsal results. Read by server/routes/eva-exit.js; no write path exists yet (Phase 3 feature, SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C) -- restored by SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-D to stop a confirmed crash on GET /api/eva/exit/portfolio-readiness, not to complete the persist step. |
| updated_at | `timestamp with time zone` | **NO** | `now()` | Standard row-update timestamp, matching sibling table venture_exit_readiness. Auto-maintained by trg_venture_exit_profiles_updated_at. |

## Constraints

### Primary Key
- `venture_exit_profiles_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_exit_profiles_created_by_fkey`: created_by → users(id)
- `venture_exit_profiles_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_exit_profiles_exit_context_check`: CHECK ((exit_context = ANY (ARRAY['planning'::text, 'readiness_assessment'::text])))
- `venture_exit_profiles_exit_model_check`: CHECK ((exit_model = ANY (ARRAY['full_acquisition'::text, 'licensing'::text, 'revenue_share'::text, 'acqui_hire'::text, 'asset_sale'::text, 'merger'::text])))
- `venture_exit_profiles_target_buyer_type_check`: CHECK ((target_buyer_type = ANY (ARRAY['strategic'::text, 'financial'::text, 'competitor'::text, 'partner'::text, 'unknown'::text])))

## Indexes

- `idx_exit_profiles_current_context`
  ```sql
  CREATE UNIQUE INDEX idx_exit_profiles_current_context ON public.venture_exit_profiles USING btree (venture_id, exit_context) WHERE (is_current = true)
  ```
- `idx_exit_profiles_venture_id`
  ```sql
  CREATE INDEX idx_exit_profiles_venture_id ON public.venture_exit_profiles USING btree (venture_id)
  ```
- `venture_exit_profiles_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_exit_profiles_pkey ON public.venture_exit_profiles USING btree (id)
  ```

## RLS Policies

### 1. exit_profiles_insert_owner (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 2. exit_profiles_select_owner (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 3. exit_profiles_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 4. exit_profiles_update_owner (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

## Triggers

### trg_venture_exit_profiles_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION set_venture_exit_profiles_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
