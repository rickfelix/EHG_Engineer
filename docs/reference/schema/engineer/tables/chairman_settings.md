# chairman_settings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T16:19:37.894Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| company_id | `uuid` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| risk_tolerance | `integer(32)` | **NO** | `35` | Maximum acceptable risk level (0-100). Higher = more risk-tolerant. |
| pattern_threshold | `integer(32)` | **NO** | `75` | Minimum pattern match percentage required (0-100). Higher = stricter pattern requirements. |
| time_to_revenue_max | `integer(32)` | **NO** | `21` | Maximum days to first revenue. Ventures exceeding this are filtered out. |
| capital_cap | `integer(32)` | **NO** | `2000` | Maximum initial capital investment in dollars. |
| feedback_speed | `integer(32)` | **NO** | `8` | Importance of fast customer feedback (1-10). Higher = faster feedback preferred. |
| growth_curve | `character varying(20)` | **NO** | `'linear'::character varying` | Preferred growth trajectory: linear, exponential, logarithmic, s_curve. |
| exploit_ratio | `integer(32)` | **NO** | `75` | Percentage of portfolio allocated to exploiting proven patterns (0-100). |
| explore_ratio | `integer(32)` | **NO** | `25` | Percentage of portfolio allocated to exploring new patterns (0-100). |
| new_pattern_budget | `integer(32)` | **NO** | `5000` | Budget allocated for developing new patterns in dollars. |
| require_dogfooding | `boolean` | **NO** | `true` | Whether ventures must use our own patterns (true = required). |
| kill_gate_mode | `character varying(20)` | **NO** | `'standard'::character varying` | How strictly to enforce kill gates: standard, strict, lenient, disabled. |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `chairman_settings_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `chairman_settings_company_id_fkey`: company_id → companies(id)
- `chairman_settings_created_by_fkey`: created_by → users(id)
- `chairman_settings_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `unique_company_venture_settings`: UNIQUE (company_id, venture_id)

### Check Constraints
- `chairman_settings_capital_cap_check`: CHECK ((capital_cap > 0))
- `chairman_settings_exploit_ratio_check`: CHECK (((exploit_ratio >= 0) AND (exploit_ratio <= 100)))
- `chairman_settings_explore_ratio_check`: CHECK (((explore_ratio >= 0) AND (explore_ratio <= 100)))
- `chairman_settings_feedback_speed_check`: CHECK (((feedback_speed >= 1) AND (feedback_speed <= 10)))
- `chairman_settings_growth_curve_check`: CHECK (((growth_curve)::text = ANY ((ARRAY['linear'::character varying, 'exponential'::character varying, 'logarithmic'::character varying, 's_curve'::character varying])::text[])))
- `chairman_settings_kill_gate_mode_check`: CHECK (((kill_gate_mode)::text = ANY ((ARRAY['standard'::character varying, 'strict'::character varying, 'lenient'::character varying, 'disabled'::character varying])::text[])))
- `chairman_settings_new_pattern_budget_check`: CHECK ((new_pattern_budget >= 0))
- `chairman_settings_pattern_threshold_check`: CHECK (((pattern_threshold >= 0) AND (pattern_threshold <= 100)))
- `chairman_settings_risk_tolerance_check`: CHECK (((risk_tolerance >= 0) AND (risk_tolerance <= 100)))
- `chairman_settings_time_to_revenue_max_check`: CHECK ((time_to_revenue_max > 0))
- `exploit_explore_ratio_sum`: CHECK (((exploit_ratio + explore_ratio) = 100))

## Indexes

- `chairman_settings_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_settings_pkey ON public.chairman_settings USING btree (id)
  ```
- `idx_chairman_settings_company_id`
  ```sql
  CREATE INDEX idx_chairman_settings_company_id ON public.chairman_settings USING btree (company_id)
  ```
- `idx_chairman_settings_venture_id`
  ```sql
  CREATE INDEX idx_chairman_settings_venture_id ON public.chairman_settings USING btree (venture_id) WHERE (venture_id IS NOT NULL)
  ```
- `unique_company_venture_settings`
  ```sql
  CREATE UNIQUE INDEX unique_company_venture_settings ON public.chairman_settings USING btree (company_id, venture_id)
  ```

## RLS Policies

### 1. chairman_settings_delete_owner (DELETE)

- **Roles**: {public}
- **Using**: `(EXISTS ( SELECT 1
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.company_id = chairman_settings.company_id) AND (user_company_access.role = 'owner'::text) AND (user_company_access.is_active = true))))`

### 2. chairman_settings_insert_admin (INSERT)

- **Roles**: {public}
- **With Check**: `(EXISTS ( SELECT 1
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.company_id = chairman_settings.company_id) AND (user_company_access.role = ANY (ARRAY['admin'::text, 'owner'::text])) AND (user_company_access.is_active = true))))`

### 3. chairman_settings_select_own_company (SELECT)

- **Roles**: {public}
- **Using**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true))))`

### 4. chairman_settings_update_admin (UPDATE)

- **Roles**: {public}
- **Using**: `(EXISTS ( SELECT 1
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.company_id = chairman_settings.company_id) AND (user_company_access.role = ANY (ARRAY['admin'::text, 'owner'::text])) AND (user_company_access.is_active = true))))`

## Triggers

### trg_chairman_settings_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_chairman_settings_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
