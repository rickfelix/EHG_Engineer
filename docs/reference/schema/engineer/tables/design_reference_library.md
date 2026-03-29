# design_reference_library Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-29T22:45:56.772Z
**Rows**: 137
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| url | `text` | **NO** | - | - |
| site_name | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| score_design | `numeric(3,1)` | YES | - | - |
| score_usability | `numeric(3,1)` | YES | - | - |
| score_creativity | `numeric(3,1)` | YES | - | - |
| score_content | `numeric(3,1)` | YES | - | - |
| score_combined | `numeric(4,1)` | YES | - | - |
| tech_stack | `ARRAY` | YES | - | - |
| agency_name | `text` | YES | - | - |
| country | `text` | YES | - | - |
| date_awarded | `date` | YES | - | - |
| archetype_category | `text` | **NO** | - | - |
| awwwards_page_url | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `design_reference_library_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `design_reference_library_url_key`: UNIQUE (url)

### Check Constraints
- `design_reference_library_archetype_category_check`: CHECK ((archetype_category = ANY (ARRAY['saas'::text, 'marketplace'::text, 'ai_product'::text, 'e_commerce'::text, 'fintech'::text, 'healthtech'::text, 'edtech'::text, 'media'::text, 'creator_tools'::text, 'services'::text, 'deeptech'::text, 'real_estate'::text, 'corporate'::text, 'portfolio'::text, 'e-commerce'::text])))

## Indexes

- `design_reference_library_pkey`
  ```sql
  CREATE UNIQUE INDEX design_reference_library_pkey ON public.design_reference_library USING btree (id)
  ```
- `design_reference_library_url_key`
  ```sql
  CREATE UNIQUE INDEX design_reference_library_url_key ON public.design_reference_library USING btree (url)
  ```
- `idx_design_ref_archetype`
  ```sql
  CREATE INDEX idx_design_ref_archetype ON public.design_reference_library USING btree (archetype_category)
  ```
- `idx_design_ref_score`
  ```sql
  CREATE INDEX idx_design_ref_score ON public.design_reference_library USING btree (score_combined DESC)
  ```

## Triggers

### trg_design_ref_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_design_ref_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
