# feedback_quality_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T12:28:46.954Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (24 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | **NO** | `'system'::text` | - |
| version | `integer(32)` | **NO** | `1` | - |
| status | `text` | **NO** | `'active'::text` | - |
| threshold_low | `integer(32)` | **NO** | `30` | - |
| quarantine_risk_threshold | `integer(32)` | **NO** | `70` | - |
| quality_score_min | `integer(32)` | **NO** | `0` | - |
| quality_score_max | `integer(32)` | **NO** | `100` | - |
| redaction_tokens | `jsonb` | **NO** | `'{"jwt": "[REDACTED_JWT]", "ssn": "[REDACTED_SSN]", "email": "[REDACTED_EMAIL]", "phone": "[REDACTED_PHONE]", "api_key": "[REDACTED_API_KEY]", "password": "[REDACTED_PASSWORD]", "ip_address": "[REDACTED_IP]", "credit_card": "[REDACTED_CC]", "prompt_injection": "[BLOCKED_INJECTION]"}'::jsonb` | - |
| sanitization_patterns | `jsonb` | **NO** | `'[]'::jsonb` | - |
| injection_patterns | `jsonb` | **NO** | `'[]'::jsonb` | - |
| scoring_weights | `jsonb` | **NO** | `'{"clarity": 0.25, "relevance": 0.15, "specificity": 0.20, "completeness": 0.15, "actionability": 0.25}'::jsonb` | - |
| enhancement_rules | `jsonb` | **NO** | `'[]'::jsonb` | - |
| enable_sanitization | `boolean` | **NO** | `true` | - |
| enable_enhancement | `boolean` | **NO** | `true` | - |
| enable_quarantine | `boolean` | **NO** | `true` | - |
| enable_issue_patterns | `boolean` | **NO** | `true` | - |
| enable_audit_logging | `boolean` | **NO** | `true` | - |
| max_processing_time_ms | `integer(32)` | **NO** | `5000` | - |
| max_retries | `integer(32)` | **NO** | `3` | - |
| dlq_enabled | `boolean` | **NO** | `true` | - |
| description | `text` | YES | - | - |

## Constraints

### Primary Key
- `feedback_quality_config_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_feedback_quality_config_version`: UNIQUE (version)

### Check Constraints
- `feedback_quality_config_quality_score_max_check`: CHECK (((quality_score_max >= 0) AND (quality_score_max <= 100)))
- `feedback_quality_config_quality_score_min_check`: CHECK (((quality_score_min >= 0) AND (quality_score_min <= 100)))
- `feedback_quality_config_quarantine_risk_threshold_check`: CHECK (((quarantine_risk_threshold >= 0) AND (quarantine_risk_threshold <= 100)))
- `feedback_quality_config_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deprecated'::text])))
- `feedback_quality_config_threshold_low_check`: CHECK (((threshold_low >= 0) AND (threshold_low <= 100)))

## Indexes

- `feedback_quality_config_pkey`
  ```sql
  CREATE UNIQUE INDEX feedback_quality_config_pkey ON public.feedback_quality_config USING btree (id)
  ```
- `uq_feedback_quality_config_version`
  ```sql
  CREATE UNIQUE INDEX uq_feedback_quality_config_version ON public.feedback_quality_config USING btree (version)
  ```

## RLS Policies

### 1. Anon can read active feedback_quality_config (SELECT)

- **Roles**: {public}
- **Using**: `(status = 'active'::text)`

### 2. Service role full access to feedback_quality_config (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_feedback_quality_config_update_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION feedback_quality_config_update_timestamp()`

### trg_feedback_quality_config_validate

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION feedback_quality_config_validate()`

### trg_feedback_quality_config_validate

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION feedback_quality_config_validate()`

---

[← Back to Schema Overview](../database-schema-overview.md)
