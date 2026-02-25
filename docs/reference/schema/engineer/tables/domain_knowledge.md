# domain_knowledge Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-25T20:22:28.434Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| industry | `text` | **NO** | - | - |
| segment | `text` | YES | - | - |
| problem_area | `text` | YES | - | - |
| knowledge_type | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| content | `text` | **NO** | - | - |
| confidence | `numeric(3,2)` | YES | `0.5` | - |
| extraction_count | `integer(32)` | YES | `1` | - |
| last_verified_at | `timestamp with time zone` | YES | `now()` | - |
| source_session_id | `uuid` | YES | - | - |
| source_venture_id | `uuid` | YES | - | - |
| tags | `ARRAY` | YES | `'{}'::text[]` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `domain_knowledge_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `domain_knowledge_source_session_id_fkey`: source_session_id → brainstorm_sessions(id)

### Check Constraints
- `domain_knowledge_confidence_check`: CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
- `domain_knowledge_knowledge_type_check`: CHECK ((knowledge_type = ANY (ARRAY['market_data'::text, 'competitor'::text, 'pain_point'::text, 'trend'::text, 'regulation'::text, 'technology'::text])))

## Indexes

- `domain_knowledge_pkey`
  ```sql
  CREATE UNIQUE INDEX domain_knowledge_pkey ON public.domain_knowledge USING btree (id)
  ```
- `idx_domain_knowledge_dedup`
  ```sql
  CREATE UNIQUE INDEX idx_domain_knowledge_dedup ON public.domain_knowledge USING btree (industry, knowledge_type, title)
  ```
- `idx_domain_knowledge_industry`
  ```sql
  CREATE INDEX idx_domain_knowledge_industry ON public.domain_knowledge USING btree (industry)
  ```
- `idx_domain_knowledge_industry_segment`
  ```sql
  CREATE INDEX idx_domain_knowledge_industry_segment ON public.domain_knowledge USING btree (industry, segment)
  ```
- `idx_domain_knowledge_tags`
  ```sql
  CREATE INDEX idx_domain_knowledge_tags ON public.domain_knowledge USING gin (tags)
  ```
- `idx_domain_knowledge_type`
  ```sql
  CREATE INDEX idx_domain_knowledge_type ON public.domain_knowledge USING btree (knowledge_type)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### domain_knowledge_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_domain_knowledge_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
