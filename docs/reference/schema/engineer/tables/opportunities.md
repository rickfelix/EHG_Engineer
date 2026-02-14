# opportunities Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T13:05:36.627Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (28 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| title | `character varying(500)` | **NO** | - | - |
| description | `text` | YES | - | - |
| company_name | `character varying(255)` | YES | - | - |
| contact_name | `character varying(255)` | YES | - | - |
| contact_email | `character varying(255)` | YES | - | - |
| contact_phone | `character varying(50)` | YES | - | - |
| source_id | `uuid` | YES | - | - |
| source_reference | `character varying(500)` | YES | - | - |
| opportunity_type | `character varying(100)` | YES | - | - |
| status | `character varying(50)` | YES | `'new'::character varying` | - |
| estimated_value | `numeric(15,2)` | YES | - | - |
| currency | `character varying(3)` | YES | `'USD'::character varying` | - |
| probability_percent | `integer(32)` | YES | - | - |
| weighted_value | `numeric(15,2)` | YES | - | - |
| identified_date | `date` | YES | `CURRENT_DATE` | - |
| expected_close_date | `date` | YES | - | - |
| actual_close_date | `date` | YES | - | - |
| assigned_to | `character varying(255)` | YES | - | - |
| tags | `ARRAY` | YES | - | - |
| duplicate_check_hash | `character varying(64)` | YES | - | - |
| is_duplicate | `boolean` | YES | `false` | - |
| master_opportunity_id | `uuid` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| updated_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| created_by | `character varying(255)` | YES | - | - |
| updated_by | `character varying(255)` | YES | - | - |

## Constraints

### Primary Key
- `opportunities_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `opportunities_master_opportunity_id_fkey`: master_opportunity_id → opportunities(id)
- `opportunities_source_id_fkey`: source_id → opportunity_sources(id)

### Check Constraints
- `opportunities_opportunity_type_check`: CHECK (((opportunity_type)::text = ANY ((ARRAY['new_business'::character varying, 'expansion'::character varying, 'renewal'::character varying, 'partnership'::character varying, 'investment'::character varying, 'other'::character varying])::text[])))
- `opportunities_probability_percent_check`: CHECK (((probability_percent >= 0) AND (probability_percent <= 100)))
- `opportunities_status_check`: CHECK (((status)::text = ANY ((ARRAY['new'::character varying, 'qualified'::character varying, 'in_progress'::character varying, 'proposal_sent'::character varying, 'negotiation'::character varying, 'won'::character varying, 'lost'::character varying, 'on_hold'::character varying])::text[])))
- `valid_dates`: CHECK (((actual_close_date IS NULL) OR (actual_close_date >= identified_date)))
- `valid_probability`: CHECK (((probability_percent IS NULL) OR ((probability_percent >= 0) AND (probability_percent <= 100))))

## Indexes

- `idx_opportunities_assigned`
  ```sql
  CREATE INDEX idx_opportunities_assigned ON public.opportunities USING btree (assigned_to)
  ```
- `idx_opportunities_company`
  ```sql
  CREATE INDEX idx_opportunities_company ON public.opportunities USING btree (company_name)
  ```
- `idx_opportunities_dates`
  ```sql
  CREATE INDEX idx_opportunities_dates ON public.opportunities USING btree (identified_date, expected_close_date)
  ```
- `idx_opportunities_duplicate`
  ```sql
  CREATE INDEX idx_opportunities_duplicate ON public.opportunities USING btree (duplicate_check_hash)
  ```
- `idx_opportunities_source`
  ```sql
  CREATE INDEX idx_opportunities_source ON public.opportunities USING btree (source_id)
  ```
- `idx_opportunities_status`
  ```sql
  CREATE INDEX idx_opportunities_status ON public.opportunities USING btree (status)
  ```
- `idx_opportunities_tags`
  ```sql
  CREATE INDEX idx_opportunities_tags ON public.opportunities USING gin (tags)
  ```
- `idx_opportunities_weighted_value`
  ```sql
  CREATE INDEX idx_opportunities_weighted_value ON public.opportunities USING btree (weighted_value DESC)
  ```
- `opportunities_pkey`
  ```sql
  CREATE UNIQUE INDEX opportunities_pkey ON public.opportunities USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_opportunities (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. authenticated_write_opportunities (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### check_duplicate_before_insert

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION check_opportunity_duplicate()`

### update_opportunities_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
