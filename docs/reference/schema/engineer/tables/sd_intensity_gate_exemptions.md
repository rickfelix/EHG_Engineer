# sd_intensity_gate_exemptions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-31T17:23:48.219Z
**Rows**: 21
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('sd_intensity_gate_exemptions_id_seq'::regclass)` | - |
| sd_type | `character varying(50)` | **NO** | - | - |
| intensity_level | `character varying(20)` | **NO** | - | - |
| gate_name | `character varying(100)` | **NO** | - | - |
| exemption_type | `character varying(20)` | **NO** | - | - |
| reason | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_intensity_gate_exemptions_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sd_intensity_gate_exemptions_sd_type_intensity_level_gate_n_key`: UNIQUE (sd_type, intensity_level, gate_name)

### Check Constraints
- `sd_intensity_gate_exemptions_exemption_type_check`: CHECK (((exemption_type)::text = ANY ((ARRAY['SKIP'::character varying, 'OPTIONAL'::character varying, 'REQUIRED'::character varying])::text[])))
- `sd_intensity_gate_exemptions_intensity_level_check`: CHECK (((intensity_level)::text = ANY ((ARRAY['cosmetic'::character varying, 'structural'::character varying, 'architectural'::character varying])::text[])))

## Indexes

- `sd_intensity_gate_exemptions_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_intensity_gate_exemptions_pkey ON public.sd_intensity_gate_exemptions USING btree (id)
  ```
- `sd_intensity_gate_exemptions_sd_type_intensity_level_gate_n_key`
  ```sql
  CREATE UNIQUE INDEX sd_intensity_gate_exemptions_sd_type_intensity_level_gate_n_key ON public.sd_intensity_gate_exemptions USING btree (sd_type, intensity_level, gate_name)
  ```

## RLS Policies

### 1. Allow select for anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_select_sd_intensity_gate_exemptions (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_all_sd_intensity_gate_exemptions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
