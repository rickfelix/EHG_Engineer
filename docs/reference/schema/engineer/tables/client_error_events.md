# client_error_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-11T19:26:54.672Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| session_id | `text` | YES | - | - |
| chairman_user_id | `uuid` | YES | - | - |
| severity | `text` | **NO** | `'error'::text` | - |
| environment | `text` | YES | - | - |
| route | `text` | YES | - | - |
| message | `text` | **NO** | - | - |
| error_name | `text` | YES | - | - |
| error_hash | `text` | YES | - | Caller-computed hash for downstream dedup. ErrorCaptureProvider already populates this for the feedback table. |
| stack | `text` | YES | - | - |
| breadcrumbs | `jsonb` | **NO** | `'[]'::jsonb` | jsonb array of {ts, type, message, ...} entries. Type guarded by CHECK constraint. |
| user_agent | `text` | YES | - | - |
| app_version | `text` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `client_error_events_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `client_error_events_chairman_user_id_fkey`: chairman_user_id → users(id)

### Check Constraints
- `client_error_events_app_version_check`: CHECK (((app_version IS NULL) OR (length(app_version) <= 64)))
- `client_error_events_breadcrumbs_check`: CHECK ((jsonb_typeof(breadcrumbs) = 'array'::text))
- `client_error_events_environment_check`: CHECK (((environment IS NULL) OR (environment = ANY (ARRAY['production'::text, 'preview'::text, 'development'::text]))))
- `client_error_events_error_hash_check`: CHECK (((error_hash IS NULL) OR (length(error_hash) <= 128)))
- `client_error_events_error_name_check`: CHECK (((error_name IS NULL) OR (length(error_name) <= 256)))
- `client_error_events_message_check`: CHECK ((length(message) <= 8000))
- `client_error_events_metadata_check`: CHECK ((jsonb_typeof(metadata) = 'object'::text))
- `client_error_events_route_check`: CHECK (((route IS NULL) OR (length(route) <= 2048)))
- `client_error_events_session_id_check`: CHECK (((session_id IS NULL) OR (length(session_id) <= 128)))
- `client_error_events_severity_check`: CHECK ((severity = ANY (ARRAY['error'::text, 'warning'::text, 'fatal'::text])))
- `client_error_events_stack_check`: CHECK (((stack IS NULL) OR (length(stack) <= 32000)))
- `client_error_events_user_agent_check`: CHECK (((user_agent IS NULL) OR (length(user_agent) <= 1024)))

## Indexes

- `client_error_events_pkey`
  ```sql
  CREATE UNIQUE INDEX client_error_events_pkey ON public.client_error_events USING btree (id)
  ```
- `idx_client_error_events_chairman_created_at`
  ```sql
  CREATE INDEX idx_client_error_events_chairman_created_at ON public.client_error_events USING btree (chairman_user_id, created_at DESC) WHERE (chairman_user_id IS NOT NULL)
  ```
- `idx_client_error_events_created_at`
  ```sql
  CREATE INDEX idx_client_error_events_created_at ON public.client_error_events USING btree (created_at DESC)
  ```
- `idx_client_error_events_error_hash_created_at`
  ```sql
  CREATE INDEX idx_client_error_events_error_hash_created_at ON public.client_error_events USING btree (error_hash, created_at DESC)
  ```
- `idx_client_error_events_error_name_created_at`
  ```sql
  CREATE INDEX idx_client_error_events_error_name_created_at ON public.client_error_events USING btree (error_name, created_at DESC)
  ```
- `idx_client_error_events_route_created_at`
  ```sql
  CREATE INDEX idx_client_error_events_route_created_at ON public.client_error_events USING btree (route, created_at DESC)
  ```
- `idx_client_error_events_severity_created_at`
  ```sql
  CREATE INDEX idx_client_error_events_severity_created_at ON public.client_error_events USING btree (severity, created_at DESC)
  ```

## RLS Policies

### 1. all_service_role_client_error_events (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. ins_anon_authenticated_client_error_events (INSERT)

- **Roles**: {anon,authenticated}
- **With Check**: `true`

### 3. sel_chairman_scoped_client_error_events (SELECT)

- **Roles**: {authenticated}
- **Using**: `(chairman_user_id = auth.uid())`

---

[← Back to Schema Overview](../database-schema-overview.md)
