# sd_type_gate_exemptions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-02T03:47:14.868Z
**Rows**: 57
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('sd_type_gate_exemptions_id_seq'::regclass)` | - |
| sd_type | `character varying(50)` | **NO** | - | - |
| gate_name | `character varying(100)` | **NO** | - | - |
| exemption_type | `character varying(20)` | **NO** | - | - |
| reason | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_type_gate_exemptions_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sd_type_gate_exemptions_sd_type_gate_name_key`: UNIQUE (sd_type, gate_name)

### Check Constraints
- `sd_type_gate_exemptions_exemption_type_check`: CHECK (((exemption_type)::text = ANY ((ARRAY['SKIP'::character varying, 'OPTIONAL'::character varying, 'REQUIRED'::character varying])::text[])))

## Indexes

- `sd_type_gate_exemptions_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_type_gate_exemptions_pkey ON public.sd_type_gate_exemptions USING btree (id)
  ```
- `sd_type_gate_exemptions_sd_type_gate_name_key`
  ```sql
  CREATE UNIQUE INDEX sd_type_gate_exemptions_sd_type_gate_name_key ON public.sd_type_gate_exemptions USING btree (sd_type, gate_name)
  ```

## RLS Policies

### 1. Allow all for authenticated (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 2. Allow select for anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
