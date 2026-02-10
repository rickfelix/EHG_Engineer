# distribution_channels Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T06:14:49.681Z
**Rows**: 4
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `character varying(100)` | **NO** | - | - |
| channel_type | `character varying(50)` | **NO** | - | - |
| platform | `character varying(50)` | YES | - | - |
| config | `jsonb` | YES | `'{}'::jsonb` | - |
| utm_defaults | `jsonb` | YES | `'{}'::jsonb` | - |
| is_active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `distribution_channels_pkey`: PRIMARY KEY (id)

### Check Constraints
- `distribution_channels_channel_type_check`: CHECK (((channel_type)::text = ANY ((ARRAY['social'::character varying, 'email'::character varying, 'web'::character varying, 'other'::character varying])::text[])))
- `distribution_channels_platform_check`: CHECK (((platform)::text = ANY ((ARRAY['linkedin'::character varying, 'twitter'::character varying, 'facebook'::character varying, 'instagram'::character varying, 'email'::character varying, 'website'::character varying, 'other'::character varying])::text[])))

## Indexes

- `distribution_channels_pkey`
  ```sql
  CREATE UNIQUE INDEX distribution_channels_pkey ON public.distribution_channels USING btree (id)
  ```

## RLS Policies

### 1. distribution_channels_admin (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. distribution_channels_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
