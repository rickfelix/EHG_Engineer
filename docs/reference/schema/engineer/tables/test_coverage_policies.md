# test_coverage_policies Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T23:29:30.049Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| tier_name | `character varying(50)` | **NO** | - | Human-readable tier name (e.g., "Tier 1: Minimal Files") |
| loc_min | `integer(32)` | **NO** | - | Minimum lines of code (inclusive) for this tier |
| loc_max | `integer(32)` | **NO** | - | Maximum lines of code (inclusive) for this tier |
| requirement_level | `character varying(20)` | **NO** | - | OPTIONAL = tests nice-to-have, RECOMMENDED = tests encouraged, REQUIRED = tests mandatory |
| description | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `test_coverage_policies_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `test_coverage_policies_tier_name_key`: UNIQUE (tier_name)

### Check Constraints
- `test_coverage_policies_requirement_level_check`: CHECK (((requirement_level)::text = ANY ((ARRAY['OPTIONAL'::character varying, 'RECOMMENDED'::character varying, 'REQUIRED'::character varying])::text[])))

## Indexes

- `idx_test_coverage_loc_range`
  ```sql
  CREATE INDEX idx_test_coverage_loc_range ON public.test_coverage_policies USING btree (loc_min, loc_max)
  ```
- `test_coverage_policies_pkey`
  ```sql
  CREATE UNIQUE INDEX test_coverage_policies_pkey ON public.test_coverage_policies USING btree (id)
  ```
- `test_coverage_policies_tier_name_key`
  ```sql
  CREATE UNIQUE INDEX test_coverage_policies_tier_name_key ON public.test_coverage_policies USING btree (tier_name)
  ```

## RLS Policies

### 1. authenticated_read_test_coverage_policies (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_test_coverage_policies (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
