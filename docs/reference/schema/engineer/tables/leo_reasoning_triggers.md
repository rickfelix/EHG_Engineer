# leo_reasoning_triggers Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-18T21:49:49.245Z
**Rows**: 7
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| trigger_name | `character varying(100)` | **NO** | - | - |
| trigger_type | `character varying(50)` | **NO** | - | - |
| trigger_config | `jsonb` | **NO** | - | - |
| resulting_depth | `character varying(20)` | **NO** | - | - |
| priority | `integer(32)` | YES | `50` | - |
| active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `leo_reasoning_triggers_pkey`: PRIMARY KEY (id)

### Check Constraints
- `leo_reasoning_triggers_resulting_depth_check`: CHECK (((resulting_depth)::text = ANY ((ARRAY['quick'::character varying, 'standard'::character varying, 'deep'::character varying, 'ultra'::character varying])::text[])))

## Indexes

- `leo_reasoning_triggers_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_reasoning_triggers_pkey ON public.leo_reasoning_triggers USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_reasoning_triggers (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_reasoning_triggers (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
