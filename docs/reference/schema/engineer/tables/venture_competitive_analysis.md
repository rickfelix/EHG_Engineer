# venture_competitive_analysis Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-12T00:45:56.544Z
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
| competitor_name | `text` | **NO** | - | - |
| market_position | `text` | YES | - | - |
| strengths | `jsonb` | YES | `'[]'::jsonb` | - |
| weaknesses | `jsonb` | YES | `'[]'::jsonb` | - |
| threat_level | `text` | YES | `'medium'::text` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_competitive_analysis_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_competitive_analysis_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_competitive_analysis_threat_level_check`: CHECK ((threat_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))

## Indexes

- `idx_venture_competitive_analysis_threat_level`
  ```sql
  CREATE INDEX idx_venture_competitive_analysis_threat_level ON public.venture_competitive_analysis USING btree (threat_level)
  ```
- `idx_venture_competitive_analysis_venture_id`
  ```sql
  CREATE INDEX idx_venture_competitive_analysis_venture_id ON public.venture_competitive_analysis USING btree (venture_id)
  ```
- `venture_competitive_analysis_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_competitive_analysis_pkey ON public.venture_competitive_analysis USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_venture_competitive_analysis (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
