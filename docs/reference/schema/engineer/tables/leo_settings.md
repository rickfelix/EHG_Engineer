# leo_settings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T02:26:09.277Z
**Rows**: 1
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `1` | Always 1 (singleton constraint) |
| auto_proceed | `boolean` | **NO** | `true` | Global default for AUTO-PROCEED mode. When true, phase transitions execute automatically. |
| chain_orchestrators | `boolean` | **NO** | `false` | Global default for orchestrator chaining. When true, auto-continues to next orchestrator after completion. |
| updated_at | `timestamp with time zone` | YES | `now()` | Timestamp of last update |
| updated_by | `text` | YES | - | Identifier of who/what made the last update (session_id, user, etc.) |

## Constraints

### Primary Key
- `leo_settings_pkey`: PRIMARY KEY (id)

### Check Constraints
- `leo_settings_singleton`: CHECK ((id = 1))

## Indexes

- `leo_settings_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_settings_pkey ON public.leo_settings USING btree (id)
  ```

## RLS Policies

### 1. leo_settings_anon_read (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. leo_settings_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. leo_settings_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`

## Triggers

### leo_settings_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_leo_settings_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
