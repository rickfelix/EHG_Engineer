# chairman_preferences Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T21:16:41.090Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| chairman_id | `text` | **NO** | - | - |
| venture_id | `text` | YES | - | - |
| preference_key | `text` | **NO** | - | - |
| preference_value | `jsonb` | **NO** | - | - |
| value_type | `text` | **NO** | - | - |
| source | `text` | **NO** | `'chairman_directive'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `chairman_preferences_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_chairman_pref_scope`: UNIQUE (chairman_id, venture_id, preference_key)

### Check Constraints
- `chairman_preferences_value_type_check`: CHECK ((value_type = ANY (ARRAY['number'::text, 'string'::text, 'boolean'::text, 'object'::text, 'array'::text])))

## Indexes

- `chairman_preferences_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_preferences_pkey ON public.chairman_preferences USING btree (id)
  ```
- `idx_chairman_prefs_chairman_key`
  ```sql
  CREATE INDEX idx_chairman_prefs_chairman_key ON public.chairman_preferences USING btree (chairman_id, preference_key)
  ```
- `idx_chairman_prefs_chairman_venture`
  ```sql
  CREATE INDEX idx_chairman_prefs_chairman_venture ON public.chairman_preferences USING btree (chairman_id, venture_id)
  ```
- `uq_chairman_pref_scope`
  ```sql
  CREATE UNIQUE INDEX uq_chairman_pref_scope ON public.chairman_preferences USING btree (chairman_id, venture_id, preference_key)
  ```

## RLS Policies

### 1. chairman_preferences_delete (DELETE)

- **Roles**: {public}
- **Using**: `true`

### 2. chairman_preferences_insert (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 3. chairman_preferences_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 4. chairman_preferences_update (UPDATE)

- **Roles**: {public}
- **Using**: `true`

## Triggers

### trg_chairman_preferences_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_chairman_preferences_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
