# sd_intensity_adjustments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T16:26:42.445Z
**Rows**: 3
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('sd_intensity_adjustments_id_seq'::regclass)` | - |
| sd_type | `character varying(50)` | **NO** | - | - |
| intensity_level | `character varying(20)` | **NO** | - | - |
| requires_prd_override | `boolean` | YES | - | - |
| requires_e2e_override | `boolean` | YES | - | - |
| requires_retrospective_override | `boolean` | YES | - | - |
| min_handoffs_override | `integer(32)` | YES | - | - |
| lead_weight_adj | `integer(32)` | YES | `0` | - |
| plan_weight_adj | `integer(32)` | YES | `0` | - |
| exec_weight_adj | `integer(32)` | YES | `0` | - |
| verify_weight_adj | `integer(32)` | YES | `0` | - |
| final_weight_adj | `integer(32)` | YES | `0` | - |
| description | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_intensity_adjustments_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sd_intensity_adjustments_sd_type_intensity_level_key`: UNIQUE (sd_type, intensity_level)

### Check Constraints
- `adjustments_sum_to_zero`: CHECK ((((((lead_weight_adj + plan_weight_adj) + exec_weight_adj) + verify_weight_adj) + final_weight_adj) = 0))
- `sd_intensity_adjustments_exec_weight_adj_check`: CHECK (((exec_weight_adj >= '-20'::integer) AND (exec_weight_adj <= 20)))
- `sd_intensity_adjustments_final_weight_adj_check`: CHECK (((final_weight_adj >= '-20'::integer) AND (final_weight_adj <= 20)))
- `sd_intensity_adjustments_intensity_level_check`: CHECK (((intensity_level)::text = ANY ((ARRAY['cosmetic'::character varying, 'structural'::character varying, 'architectural'::character varying])::text[])))
- `sd_intensity_adjustments_lead_weight_adj_check`: CHECK (((lead_weight_adj >= '-20'::integer) AND (lead_weight_adj <= 20)))
- `sd_intensity_adjustments_min_handoffs_override_check`: CHECK (((min_handoffs_override IS NULL) OR ((min_handoffs_override >= 1) AND (min_handoffs_override <= 5))))
- `sd_intensity_adjustments_plan_weight_adj_check`: CHECK (((plan_weight_adj >= '-20'::integer) AND (plan_weight_adj <= 20)))
- `sd_intensity_adjustments_verify_weight_adj_check`: CHECK (((verify_weight_adj >= '-20'::integer) AND (verify_weight_adj <= 20)))

## Indexes

- `sd_intensity_adjustments_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_intensity_adjustments_pkey ON public.sd_intensity_adjustments USING btree (id)
  ```
- `sd_intensity_adjustments_sd_type_intensity_level_key`
  ```sql
  CREATE UNIQUE INDEX sd_intensity_adjustments_sd_type_intensity_level_key ON public.sd_intensity_adjustments USING btree (sd_type, intensity_level)
  ```

## RLS Policies

### 1. Allow select for anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_select_sd_intensity_adjustments (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_all_sd_intensity_adjustments (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
