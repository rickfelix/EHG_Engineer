# chairman_interests Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-11T13:23:36.495Z
**Rows**: 0
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| user_id | `uuid` | **NO** | - | - |
| interest_type | `text` | **NO** | - | Type of interest: market (industry/vertical), customer_segment (target customer type), focus_area (specific focus), exclusion (areas to avoid) |
| name | `text` | **NO** | - | - |
| priority | `integer(32)` | YES | `5` | Priority level 1-10 where 10 is highest priority. Used for ranking and filtering recommendations. |
| is_active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| notes | `text` | YES | - | Optional notes/context for this interest entry |
| story_beats | `jsonb` | YES | `'[]'::jsonb` | Array of story beat objects for scenario-driven interests. Structure: [{"sequence": int, "description": "string", "acceptance_criteria": ["string"]}]. Default: [] |
| vision_signals | `jsonb` | YES | `'[]'::jsonb` | Array of vision signal objects for strategic validation. Structure: [{"signal_type": "string", "target_metric": "string", "measurement_method": "string"}]. Default: [] |
| coverage_nav_item_ids | `jsonb` | YES | `'[]'::jsonb` | Array of venture_stages_nav_items UUIDs tracking coverage. Structure: ["uuid1", "uuid2", ...]. Default: [] |
| feasibility_score | `integer(32)` | YES | - | Russian Judge scoring 0-10 for implementation feasibility. NULL = not scored yet. CHECK constraint: 0-10 inclusive. |

## Constraints

### Primary Key
- `chairman_interests_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `chairman_interests_user_id_fkey`: user_id → users(id)

### Check Constraints
- `chairman_interests_feasibility_score_check`: CHECK (((feasibility_score >= 0) AND (feasibility_score <= 10)))
- `chairman_interests_interest_type_check`: CHECK ((interest_type = ANY (ARRAY['market'::text, 'customer_segment'::text, 'focus_area'::text, 'exclusion'::text])))
- `chairman_interests_priority_check`: CHECK (((priority >= 1) AND (priority <= 10)))

## Indexes

- `chairman_interests_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_interests_pkey ON public.chairman_interests USING btree (id)
  ```
- `idx_chairman_interests_active`
  ```sql
  CREATE INDEX idx_chairman_interests_active ON public.chairman_interests USING btree (user_id, is_active) WHERE (is_active = true)
  ```
- `idx_chairman_interests_priority`
  ```sql
  CREATE INDEX idx_chairman_interests_priority ON public.chairman_interests USING btree (user_id, interest_type, priority DESC)
  ```
- `idx_chairman_interests_type`
  ```sql
  CREATE INDEX idx_chairman_interests_type ON public.chairman_interests USING btree (interest_type)
  ```
- `idx_chairman_interests_user_id`
  ```sql
  CREATE INDEX idx_chairman_interests_user_id ON public.chairman_interests USING btree (user_id)
  ```

## RLS Policies

### 1. delete_own_chairman_interests (DELETE)

- **Roles**: {authenticated}
- **Using**: `(auth.uid() = user_id)`

### 2. insert_own_chairman_interests (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(auth.uid() = user_id)`

### 3. select_own_chairman_interests (SELECT)

- **Roles**: {authenticated}
- **Using**: `(auth.uid() = user_id)`

### 4. service_role_chairman_interests (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 5. update_own_chairman_interests (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(auth.uid() = user_id)`
- **With Check**: `(auth.uid() = user_id)`

## Triggers

### chairman_interests_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_chairman_interests_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
