# genesis_tier_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-16T01:07:03.421Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| tier_code | `text` | **NO** | - | - |
| tier_name | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| features | `jsonb` | **NO** | `'[]'::jsonb` | JSONB array of features enabled for this tier |
| default_ttl_days | `integer(32)` | **NO** | `7` | - |
| requires_approval | `boolean` | **NO** | `false` | Whether this tier requires approval before starting (e.g., for resource-intensive B tier) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `genesis_tier_config_pkey`: PRIMARY KEY (tier_code)

### Check Constraints
- `genesis_tier_config_tier_code_check`: CHECK ((tier_code = ANY (ARRAY['A'::text, 'B'::text])))

## Indexes

- `genesis_tier_config_pkey`
  ```sql
  CREATE UNIQUE INDEX genesis_tier_config_pkey ON public.genesis_tier_config USING btree (tier_code)
  ```

## RLS Policies

### 1. genesis_tier_config_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. genesis_tier_config_service (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
