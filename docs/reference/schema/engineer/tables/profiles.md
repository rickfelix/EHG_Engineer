# profiles Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-05T23:08:29.617Z
**Rows**: 2
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (21 total)

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
| website_url | `text` | YES | - | PrivacyPatrol AI: user-supplied website URL captured during onboarding for first scan |
| onboarding_completed_at | `timestamp with time zone` | YES | - | PrivacyPatrol AI: timestamp when user completed the initial onboarding flow |
| primary_persona | `text` | YES | - | PrivacyPatrol AI: user persona classification (pragmatic_priya | indie_dev_ian | NULL) |

## Constraints

### Primary Key
- `profiles_pkey`: PRIMARY KEY (id)

### Check Constraints
- `profiles_primary_persona_check`: CHECK (((primary_persona IS NULL) OR (primary_persona = ANY (ARRAY['pragmatic_priya'::text, 'indie_dev_ian'::text]))))

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
