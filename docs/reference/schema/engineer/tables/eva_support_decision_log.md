# eva_support_decision_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-12T15:22:25.101Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| schema_version | `character varying(8)` | **NO** | - | - |
| task_id | `text` | **NO** | - | - |
| sequence | `integer(32)` | **NO** | - | - |
| timestamp | `timestamp with time zone` | **NO** | - | - |
| flow | `text` | **NO** | - | Validated app-side against FLOWS list (see decision-log-formatter.js). No DB CHECK to keep value-set evolution in code. |
| eva_reply_summary | `text` | **NO** | - | - |
| operator_input_summary | `text` | **NO** | - | - |
| override_reason | `text` | YES | - | - |
| model | `text` | **NO** | - | - |
| tokens_in | `integer(32)` | **NO** | - | - |
| tokens_out | `integer(32)` | **NO** | - | - |
| references | `jsonb` | **NO** | `'[]'::jsonb` | JSONB array of citation refs. Name matches envelope v1.0 REQUIRED_FIELDS verbatim; quote as "references" in raw SQL to avoid FK-reference keyword ambiguity. |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_support_decision_log_pkey`: PRIMARY KEY (task_id, sequence)

### Check Constraints
- `eva_support_decision_log_eva_reply_summary_check`: CHECK ((length(eva_reply_summary) <= 500))
- `eva_support_decision_log_operator_input_summary_check`: CHECK ((length(operator_input_summary) <= 500))
- `eva_support_decision_log_schema_version_check`: CHECK (((schema_version)::text = '1.0'::text))
- `eva_support_decision_log_sequence_check`: CHECK ((sequence > 0))
- `eva_support_decision_log_tokens_in_check`: CHECK ((tokens_in >= 0))
- `eva_support_decision_log_tokens_out_check`: CHECK ((tokens_out >= 0))

## Indexes

- `eva_support_decision_log_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_support_decision_log_pkey ON public.eva_support_decision_log USING btree (task_id, sequence)
  ```
- `idx_eva_support_decision_log_ts`
  ```sql
  CREATE INDEX idx_eva_support_decision_log_ts ON public.eva_support_decision_log USING btree ("timestamp" DESC)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
