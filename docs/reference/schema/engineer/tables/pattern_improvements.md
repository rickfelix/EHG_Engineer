# pattern_improvements Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-27T11:26:09.324Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source_postmortem_id | `uuid` | YES | - | - |
| target_pattern_id | `character varying(20)` | **NO** | - | - |
| improvement_type | `character varying(30)` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| proposed_changes | `jsonb` | YES | `'{}'::jsonb` | - |
| status | `character varying(20)` | YES | `'proposed'::character varying` | - |
| reviewed_by | `text` | YES | - | - |
| review_notes | `text` | YES | - | - |
| reviewed_at | `timestamp with time zone` | YES | - | - |
| implemented_in_version | `integer(32)` | YES | - | - |
| implementation_date | `timestamp with time zone` | YES | - | - |
| proposed_by | `text` | YES | `'SYSTEM'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `pattern_improvements_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `pattern_improvements_source_postmortem_id_fkey`: source_postmortem_id → venture_postmortems(id)

### Check Constraints
- `pattern_improvements_improvement_type_check`: CHECK (((improvement_type)::text = ANY ((ARRAY['update_signals'::character varying, 'add_prevention'::character varying, 'update_mitigation'::character varying, 'new_pattern'::character varying, 'deprecate'::character varying])::text[])))
- `pattern_improvements_status_check`: CHECK (((status)::text = ANY ((ARRAY['proposed'::character varying, 'under_review'::character varying, 'approved'::character varying, 'implemented'::character varying, 'rejected'::character varying])::text[])))

## Indexes

- `idx_improvements_pattern`
  ```sql
  CREATE INDEX idx_improvements_pattern ON public.pattern_improvements USING btree (target_pattern_id)
  ```
- `idx_improvements_postmortem`
  ```sql
  CREATE INDEX idx_improvements_postmortem ON public.pattern_improvements USING btree (source_postmortem_id)
  ```
- `idx_improvements_status`
  ```sql
  CREATE INDEX idx_improvements_status ON public.pattern_improvements USING btree (status)
  ```
- `pattern_improvements_pkey`
  ```sql
  CREATE UNIQUE INDEX pattern_improvements_pkey ON public.pattern_improvements USING btree (id)
  ```

## RLS Policies

### 1. Authenticated users can propose improvements (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 2. Authenticated users can update their proposals (UPDATE)

- **Roles**: {authenticated}
- **Using**: `((status)::text = 'proposed'::text)`
- **With Check**: `((status)::text = ANY ((ARRAY['proposed'::character varying, 'under_review'::character varying])::text[]))`

### 3. Authenticated users can view improvements (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. Service role can manage improvements (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
