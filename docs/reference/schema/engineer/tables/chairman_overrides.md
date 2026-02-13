# chairman_overrides Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T01:18:31.427Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| component | `text` | **NO** | - | - |
| system_score | `numeric(6,2)` | **NO** | - | - |
| override_score | `numeric(6,2)` | **NO** | - | - |
| reason | `text` | YES | - | - |
| outcome | `text` | YES | - | - |
| outcome_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `chairman_overrides_pkey`: PRIMARY KEY (id)

### Check Constraints
- `chairman_overrides_outcome_check`: CHECK (((outcome IS NULL) OR (outcome = ANY (ARRAY['positive'::text, 'negative'::text, 'neutral'::text, 'pending'::text]))))

## Indexes

- `chairman_overrides_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_overrides_pkey ON public.chairman_overrides USING btree (id)
  ```
- `idx_chairman_overrides_component`
  ```sql
  CREATE INDEX idx_chairman_overrides_component ON public.chairman_overrides USING btree (component)
  ```
- `idx_chairman_overrides_created`
  ```sql
  CREATE INDEX idx_chairman_overrides_created ON public.chairman_overrides USING btree (created_at DESC)
  ```
- `idx_chairman_overrides_venture`
  ```sql
  CREATE INDEX idx_chairman_overrides_venture ON public.chairman_overrides USING btree (venture_id)
  ```

## RLS Policies

### 1. service_role_full_access_chairman_overrides (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_update_chairman_overrides_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_chairman_overrides_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
