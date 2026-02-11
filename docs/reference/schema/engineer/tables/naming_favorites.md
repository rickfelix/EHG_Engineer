# naming_favorites Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-11T13:23:36.495Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| user_id | `uuid` | **NO** | - | - |
| naming_suggestion_id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| custom_name | `text` | YES | - | - |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `naming_favorites_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `naming_favorites_naming_suggestion_id_fkey`: naming_suggestion_id → naming_suggestions(id)
- `naming_favorites_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `unique_favorite`: UNIQUE (user_id, naming_suggestion_id)

### Check Constraints
- `name_source`: CHECK (((naming_suggestion_id IS NOT NULL) OR (custom_name IS NOT NULL)))

## Indexes

- `idx_naming_favorites_user`
  ```sql
  CREATE INDEX idx_naming_favorites_user ON public.naming_favorites USING btree (user_id)
  ```
- `idx_naming_favorites_venture`
  ```sql
  CREATE INDEX idx_naming_favorites_venture ON public.naming_favorites USING btree (venture_id)
  ```
- `naming_favorites_pkey`
  ```sql
  CREATE UNIQUE INDEX naming_favorites_pkey ON public.naming_favorites USING btree (id)
  ```
- `unique_favorite`
  ```sql
  CREATE UNIQUE INDEX unique_favorite ON public.naming_favorites USING btree (user_id, naming_suggestion_id)
  ```

## RLS Policies

### 1. Users can manage their own favorites (ALL)

- **Roles**: {authenticated}
- **Using**: `(auth.uid() = user_id)`
- **With Check**: `(auth.uid() = user_id)`

---

[← Back to Schema Overview](../database-schema-overview.md)
