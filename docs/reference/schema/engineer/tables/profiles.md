# profiles Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T18:05:55.206Z
**Rows**: 2
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | - | - |
| email | `text` | YES | - | - |
| full_name | `text` | YES | - | - |
| avatar_url | `text` | YES | - | - |
| settings | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| user_id | `uuid` | YES | - | - |
| display_name | `text` | YES | - | - |
| elevenlabs_agent_id | `text` | YES | - | - |
| eva_voice_enabled | `boolean` | YES | - | - |
| first_name | `text` | YES | - | - |
| last_name | `text` | YES | - | - |
| phone | `text` | YES | - | - |
| location | `text` | YES | - | - |
| bio | `text` | YES | - | - |
| timezone | `text` | YES | - | - |
| language | `text` | YES | - | - |

## Constraints

### Primary Key
- `profiles_pkey`: PRIMARY KEY (id)

## Indexes

- `profiles_pkey`
  ```sql
  CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)
  ```

## RLS Policies

### 1. Allow authenticated users to delete profiles (DELETE)

- **Roles**: {authenticated}
- **Using**: `(auth.uid() = id)`

### 2. Users can insert own profile (INSERT)

- **Roles**: {authenticated}
- **With Check**: `((auth.uid() = id) OR (auth.uid() = user_id))`

### 3. Users can update own profile (UPDATE)

- **Roles**: {authenticated}
- **Using**: `((auth.uid() = id) OR (auth.uid() = user_id))`
- **With Check**: `((auth.uid() = id) OR (auth.uid() = user_id))`

### 4. Users can view own profile (SELECT)

- **Roles**: {authenticated}
- **Using**: `((auth.uid() = id) OR (auth.uid() = user_id))`

---

[← Back to Schema Overview](../database-schema-overview.md)
