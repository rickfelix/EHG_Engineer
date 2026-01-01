# market_segments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-01T13:00:37.176Z
**Rows**: 6
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| target_customer_profile | `jsonb` | YES | - | - |
| scanning_sources | `jsonb` | YES | - | - |
| monitoring_frequency | `character varying(50)` | YES | - | - |
| chairman_approved | `boolean` | YES | `false` | - |
| created_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `market_segments_pkey`: PRIMARY KEY (id)

## Indexes

- `market_segments_pkey`
  ```sql
  CREATE UNIQUE INDEX market_segments_pkey ON public.market_segments USING btree (id)
  ```

## RLS Policies

### 1. Allow service_role to manage market_segments (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. Anon read market_segments (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 3. Authenticated read market_segments (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
