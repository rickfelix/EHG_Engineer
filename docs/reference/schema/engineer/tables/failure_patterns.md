# failure_patterns Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-08T23:38:51.192Z
**Rows**: 10
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (25 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| pattern_id | `character varying(20)` | **NO** | - | - |
| category | `character varying(100)` | **NO** | - | - |
| severity | `character varying(20)` | YES | `'medium'::character varying` | - |
| pattern_name | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| root_cause_analysis | `jsonb` | YES | `'{}'::jsonb` | - |
| occurrence_count | `integer(32)` | YES | `1` | - |
| first_seen_sd_id | `character varying` | YES | - | - |
| last_seen_sd_id | `character varying` | YES | - | - |
| first_seen_at | `timestamp with time zone` | YES | `now()` | - |
| last_seen_at | `timestamp with time zone` | YES | `now()` | - |
| impact_score | `integer(32)` | YES | `50` | - |
| impact_areas | `jsonb` | YES | `'[]'::jsonb` | - |
| prevention_measures | `jsonb` | YES | `'[]'::jsonb` | - |
| mitigation_strategies | `jsonb` | YES | `'[]'::jsonb` | - |
| detection_signals | `jsonb` | YES | `'[]'::jsonb` | - |
| related_patterns | `ARRAY` | YES | - | - |
| superseded_by | `character varying(20)` | YES | - | - |
| status | `character varying(20)` | YES | `'active'::character varying` | - |
| lifecycle_status | `character varying(20)` | YES | `'active'::character varying` | - |
| created_by | `text` | YES | `'SYSTEM'::text` | - |
| updated_by | `text` | YES | `'SYSTEM'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `failure_patterns_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `failure_patterns_first_seen_sd_id_fkey`: first_seen_sd_id → strategic_directives_v2(id)
- `failure_patterns_last_seen_sd_id_fkey`: last_seen_sd_id → strategic_directives_v2(id)

### Unique Constraints
- `failure_patterns_pattern_id_key`: UNIQUE (pattern_id)

### Check Constraints
- `failure_patterns_category_check`: CHECK (((category)::text = ANY ((ARRAY['technical'::character varying, 'process'::character varying, 'communication'::character varying, 'resource'::character varying, 'market'::character varying, 'financial'::character varying])::text[])))
- `failure_patterns_impact_score_check`: CHECK (((impact_score >= 0) AND (impact_score <= 100)))
- `failure_patterns_lifecycle_status_check`: CHECK (((lifecycle_status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'deprecated'::character varying, 'superseded'::character varying, 'archived'::character varying])::text[])))
- `failure_patterns_severity_check`: CHECK (((severity)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[])))
- `failure_patterns_status_check`: CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'deprecated'::character varying, 'archived'::character varying])::text[])))

## Indexes

- `failure_patterns_pattern_id_key`
  ```sql
  CREATE UNIQUE INDEX failure_patterns_pattern_id_key ON public.failure_patterns USING btree (pattern_id)
  ```
- `failure_patterns_pkey`
  ```sql
  CREATE UNIQUE INDEX failure_patterns_pkey ON public.failure_patterns USING btree (id)
  ```
- `idx_failure_patterns_category`
  ```sql
  CREATE INDEX idx_failure_patterns_category ON public.failure_patterns USING btree (category)
  ```
- `idx_failure_patterns_impact_score`
  ```sql
  CREATE INDEX idx_failure_patterns_impact_score ON public.failure_patterns USING btree (impact_score DESC)
  ```
- `idx_failure_patterns_severity`
  ```sql
  CREATE INDEX idx_failure_patterns_severity ON public.failure_patterns USING btree (severity)
  ```
- `idx_failure_patterns_status`
  ```sql
  CREATE INDEX idx_failure_patterns_status ON public.failure_patterns USING btree (status)
  ```

## RLS Policies

### 1. Authenticated users can view failure patterns (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role can manage failure patterns (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
