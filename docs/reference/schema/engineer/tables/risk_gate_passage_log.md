# risk_gate_passage_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T16:19:37.894Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| venture_id | `uuid` | **NO** | - | - |
| gate_number | `integer(32)` | **NO** | - | - |
| risk_form_id | `uuid` | **NO** | - | - |
| passed | `boolean` | **NO** | - | - |
| blocked_reason | `text` | YES | - | - |
| critical_risks_count | `integer(32)` | **NO** | `0` | - |
| high_risks_count | `integer(32)` | **NO** | `0` | - |
| medium_risks_count | `integer(32)` | **NO** | `0` | - |
| low_risks_count | `integer(32)` | **NO** | `0` | - |
| attempted_at | `timestamp with time zone` | **NO** | `now()` | - |
| passed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `risk_gate_passage_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `risk_gate_passage_log_risk_form_id_fkey`: risk_form_id → risk_recalibration_forms(id)
- `risk_gate_passage_log_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `risk_gate_passage_log_gate_number_check`: CHECK ((gate_number = ANY (ARRAY[3, 4, 5, 6])))

## Indexes

- `idx_risk_gate_passage_gate`
  ```sql
  CREATE INDEX idx_risk_gate_passage_gate ON public.risk_gate_passage_log USING btree (gate_number)
  ```
- `idx_risk_gate_passage_outcome`
  ```sql
  CREATE INDEX idx_risk_gate_passage_outcome ON public.risk_gate_passage_log USING btree (passed)
  ```
- `idx_risk_gate_passage_venture`
  ```sql
  CREATE INDEX idx_risk_gate_passage_venture ON public.risk_gate_passage_log USING btree (venture_id)
  ```
- `risk_gate_passage_log_pkey`
  ```sql
  CREATE UNIQUE INDEX risk_gate_passage_log_pkey ON public.risk_gate_passage_log USING btree (id)
  ```

## RLS Policies

### 1. Authenticated users can read gate passages (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role full access on risk_gate_passage_log (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
