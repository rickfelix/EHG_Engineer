# system_settings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T14:25:45.422Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (4 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| key | `text` | **NO** | - | - |
| value_json | `jsonb` | **NO** | - | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_by | `text` | **NO** | `'system'::text` | - |

## Constraints

### Primary Key
- `system_settings_pkey`: PRIMARY KEY (key)

### Check Constraints
- `valid_setting_keys`: CHECK ((key = ANY (ARRAY['AUTO_FREEZE'::text, 'HARD_HALT_STATUS'::text, 'AUTO_RATE_LIMIT'::text])))

## Indexes

- `system_settings_pkey`
  ```sql
  CREATE UNIQUE INDEX system_settings_pkey ON public.system_settings USING btree (key)
  ```

## RLS Policies

### 1. Allow read access to system_settings (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. Service role can modify system_settings (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
