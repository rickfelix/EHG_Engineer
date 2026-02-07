# user_blueprint_bookmarks Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T11:05:08.363Z
**Rows**: 0
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| user_id | `uuid` | **NO** | - | User who created the bookmark - enforced via RLS, not FK |
| blueprint_id | `uuid` | **NO** | - | The bookmarked opportunity blueprint |
| notes | `text` | YES | - | Optional notes about why this blueprint was bookmarked |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `user_blueprint_bookmarks_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `user_blueprint_bookmarks_blueprint_id_fkey`: blueprint_id → opportunity_blueprints(id)

### Unique Constraints
- `uq_user_blueprint_bookmark`: UNIQUE (user_id, blueprint_id)

## Indexes

- `idx_bookmarks_blueprint_id`
  ```sql
  CREATE INDEX idx_bookmarks_blueprint_id ON public.user_blueprint_bookmarks USING btree (blueprint_id)
  ```
- `idx_bookmarks_created_at`
  ```sql
  CREATE INDEX idx_bookmarks_created_at ON public.user_blueprint_bookmarks USING btree (created_at DESC)
  ```
- `idx_bookmarks_user_id`
  ```sql
  CREATE INDEX idx_bookmarks_user_id ON public.user_blueprint_bookmarks USING btree (user_id)
  ```
- `uq_user_blueprint_bookmark`
  ```sql
  CREATE UNIQUE INDEX uq_user_blueprint_bookmark ON public.user_blueprint_bookmarks USING btree (user_id, blueprint_id)
  ```
- `user_blueprint_bookmarks_pkey`
  ```sql
  CREATE UNIQUE INDEX user_blueprint_bookmarks_pkey ON public.user_blueprint_bookmarks USING btree (id)
  ```

## RLS Policies

### 1. delete_own_bookmarks (DELETE)

- **Roles**: {public}
- **Using**: `(auth.uid() = user_id)`

### 2. insert_own_bookmarks (INSERT)

- **Roles**: {public}
- **With Check**: `(auth.uid() = user_id)`

### 3. select_own_bookmarks (SELECT)

- **Roles**: {public}
- **Using**: `(auth.uid() = user_id)`

### 4. service_role_all_bookmarks (ALL)

- **Roles**: {public}
- **Using**: `((auth.jwt() ->> 'role'::text) = 'service_role'::text)`

### 5. update_own_bookmarks (UPDATE)

- **Roles**: {public}
- **Using**: `(auth.uid() = user_id)`
- **With Check**: `(auth.uid() = user_id)`

## Triggers

### update_user_blueprint_bookmarks_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_bookmark_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
