# issue_patterns Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-26T04:26:11.529Z
**Rows**: 32
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| pattern_id | `character varying(20)` | **NO** | - | - |
| category | `character varying(100)` | **NO** | - | - |
| severity | `character varying(20)` | **NO** | `'medium'::character varying` | - |
| issue_summary | `text` | **NO** | - | - |
| occurrence_count | `integer(32)` | **NO** | `1` | - |
| first_seen_sd_id | `character varying` | YES | - | - |
| last_seen_sd_id | `character varying` | YES | - | - |
| proven_solutions | `jsonb` | YES | `'[]'::jsonb` | - |
| average_resolution_time | `interval` | YES | - | - |
| success_rate | `numeric(5,2)` | YES | - | - |
| prevention_checklist | `jsonb` | YES | `'[]'::jsonb` | - |
| related_sub_agents | `ARRAY` | YES | - | - |
| trend | `character varying(20)` | YES | `'stable'::character varying` | - |
| status | `character varying(20)` | YES | `'active'::character varying` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| resolution_date | `timestamp with time zone` | YES | - | Date when the pattern root cause was resolved |
| resolution_notes | `text` | YES | - | Notes explaining how the root cause was resolved |
| assigned_sd_id | `character varying(50)` | YES | - | SD that will address this pattern. Set by /learn command when user approves. |
| assignment_date | `timestamp with time zone` | YES | - | When pattern was assigned to an SD via /learn. |

## Constraints

### Primary Key
- `issue_patterns_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `issue_patterns_assigned_sd_id_fkey`: assigned_sd_id → strategic_directives_v2(id)
- `issue_patterns_first_seen_sd_id_fkey`: first_seen_sd_id → strategic_directives_v2(id)
- `issue_patterns_last_seen_sd_id_fkey`: last_seen_sd_id → strategic_directives_v2(id)

### Unique Constraints
- `issue_patterns_pattern_id_key`: UNIQUE (pattern_id)

### Check Constraints
- `issue_patterns_status_check`: CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'assigned'::character varying, 'resolved'::character varying, 'obsolete'::character varying])::text[])))

## Indexes

- `idx_issue_patterns_assigned_sd`
  ```sql
  CREATE INDEX idx_issue_patterns_assigned_sd ON public.issue_patterns USING btree (assigned_sd_id) WHERE (assigned_sd_id IS NOT NULL)
  ```
- `idx_issue_patterns_category`
  ```sql
  CREATE INDEX idx_issue_patterns_category ON public.issue_patterns USING btree (category)
  ```
- `idx_issue_patterns_first_seen`
  ```sql
  CREATE INDEX idx_issue_patterns_first_seen ON public.issue_patterns USING btree (first_seen_sd_id)
  ```
- `idx_issue_patterns_last_seen`
  ```sql
  CREATE INDEX idx_issue_patterns_last_seen ON public.issue_patterns USING btree (last_seen_sd_id)
  ```
- `idx_issue_patterns_lifecycle`
  ```sql
  CREATE INDEX idx_issue_patterns_lifecycle ON public.issue_patterns USING btree (updated_at, status) WHERE ((status)::text <> 'resolved'::text)
  ```
- `idx_issue_patterns_resolution`
  ```sql
  CREATE INDEX idx_issue_patterns_resolution ON public.issue_patterns USING btree (resolution_date) WHERE (resolution_date IS NOT NULL)
  ```
- `idx_issue_patterns_severity`
  ```sql
  CREATE INDEX idx_issue_patterns_severity ON public.issue_patterns USING btree (severity)
  ```
- `idx_issue_patterns_solutions`
  ```sql
  CREATE INDEX idx_issue_patterns_solutions ON public.issue_patterns USING gin (proven_solutions)
  ```
- `idx_issue_patterns_status`
  ```sql
  CREATE INDEX idx_issue_patterns_status ON public.issue_patterns USING btree (status)
  ```
- `idx_issue_patterns_status_category`
  ```sql
  CREATE INDEX idx_issue_patterns_status_category ON public.issue_patterns USING btree (status, category)
  ```
- `idx_issue_patterns_summary_trgm`
  ```sql
  CREATE INDEX idx_issue_patterns_summary_trgm ON public.issue_patterns USING gin (issue_summary gin_trgm_ops)
  ```
- `idx_issue_patterns_trend`
  ```sql
  CREATE INDEX idx_issue_patterns_trend ON public.issue_patterns USING btree (trend)
  ```
- `issue_patterns_pattern_id_key`
  ```sql
  CREATE UNIQUE INDEX issue_patterns_pattern_id_key ON public.issue_patterns USING btree (pattern_id)
  ```
- `issue_patterns_pkey`
  ```sql
  CREATE UNIQUE INDEX issue_patterns_pkey ON public.issue_patterns USING btree (id)
  ```

## RLS Policies

### 1. Allow all to insert patterns (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. Allow all to read patterns (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. Allow all to update patterns (UPDATE)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

### 4. Allow authenticated users to delete issue_patterns (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trigger_update_issue_patterns_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_issue_patterns_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
