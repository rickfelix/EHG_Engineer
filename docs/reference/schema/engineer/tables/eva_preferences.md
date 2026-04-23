# eva_preferences Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-23T22:47:27.849Z
**Rows**: 0
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| preference_type | `text` | **NO** | - | Category of preference: mood_pattern, time_preference, topic_priority, section_skip, agenda_override, feedback |
| pattern_data | `jsonb` | **NO** | - | JSONB payload containing the preference details - structure varies by preference_type |
| observation_count | `integer(32)` | YES | `1` | Number of times this pattern has been observed |
| last_observed_at | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_preferences_pkey`: PRIMARY KEY (id)

### Check Constraints
- `eva_preferences_preference_type_check`: CHECK ((preference_type = ANY (ARRAY['mood_pattern'::text, 'time_preference'::text, 'topic_priority'::text, 'section_skip'::text, 'agenda_override'::text, 'feedback'::text])))

## Indexes

- `eva_preferences_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_preferences_pkey ON public.eva_preferences USING btree (id)
  ```
- `idx_eva_preferences_type`
  ```sql
  CREATE INDEX idx_eva_preferences_type ON public.eva_preferences USING btree (preference_type)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
