# research_intelligence_reference Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| entry_type | `text` | **NO** | - | - |
| subject | `text` | **NO** | - | - |
| payload | `jsonb` | **NO** | `'{}'::jsonb` | - |
| source_refs | `jsonb` | **NO** | `'[]'::jsonb` | - |
| confidence | `text` | **NO** | `'unverified'::text` | - |
| version | `integer(32)` | **NO** | `1` | - |
| is_current | `boolean` | **NO** | `true` | - |
| superseded_by | `uuid` | YES | - | - |
| created_by | `text` | **NO** | `'RESEARCH_INTELLIGENCE_OPERATOR'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `research_intelligence_reference_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `research_intelligence_reference_superseded_by_fkey`: superseded_by → research_intelligence_reference(id)

### Check Constraints
- `research_intelligence_reference_confidence_check`: CHECK ((confidence = ANY (ARRAY['unverified'::text, 'low'::text, 'medium'::text, 'high'::text])))
- `research_intelligence_reference_entry_type_check`: CHECK ((entry_type = ANY (ARRAY['tech_landscape'::text, 'model_landscape'::text, 'market_size'::text, 'unit_economics'::text, 'comparables'::text])))

## Indexes

- `idx_research_intel_ref_type_current`
  ```sql
  CREATE INDEX idx_research_intel_ref_type_current ON public.research_intelligence_reference USING btree (entry_type) WHERE is_current
  ```
- `research_intelligence_reference_pkey`
  ```sql
  CREATE UNIQUE INDEX research_intelligence_reference_pkey ON public.research_intelligence_reference USING btree (id)
  ```
- `uq_research_intel_ref_current`
  ```sql
  CREATE UNIQUE INDEX uq_research_intel_ref_current ON public.research_intelligence_reference USING btree (entry_type, subject) WHERE is_current
  ```

## RLS Policies

### 1. research_intel_ref_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. research_intel_ref_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
