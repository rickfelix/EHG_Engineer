---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-03-01
tags: [reference, auto-generated]
---
# leo_integration_verification_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T00:41:31.291Z
**Rows**: 17
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (26 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| run_id | `uuid` | **NO** | - | Groups all checks from same verification run for atomic reporting |
| contract_id | `uuid` | YES | - | - |
| contract_key | `text` | **NO** | - | - |
| sd_id | `text` | YES | - | - |
| sd_type | `text` | YES | - | - |
| handoff_type | `text` | YES | - | - |
| l1_result | `USER-DEFINED` | YES | - | - |
| l1_details | `jsonb` | YES | `'{}'::jsonb` | - |
| l2_result | `USER-DEFINED` | YES | - | - |
| l2_details | `jsonb` | YES | `'{}'::jsonb` | - |
| l3_result | `USER-DEFINED` | YES | - | - |
| l3_details | `jsonb` | YES | `'{}'::jsonb` | - |
| l4_result | `USER-DEFINED` | YES | - | - |
| l4_details | `jsonb` | YES | `'{}'::jsonb` | - |
| l5_result | `USER-DEFINED` | YES | - | - |
| l5_details | `jsonb` | YES | `'{}'::jsonb` | - |
| final_status | `USER-DEFINED` | **NO** | - | - |
| final_checkpoint | `USER-DEFINED` | YES | - | Highest checkpoint level successfully verified |
| failure_checkpoint | `USER-DEFINED` | YES | - | Checkpoint level where verification failed (null if passed) |
| score | `integer(32)` | **NO** | `0` | Score 0-100: L1=20, L2=40, L3=60, L4=80, L5=100 |
| error_message | `text` | YES | - | - |
| remediation_hint | `text` | YES | - | - |
| started_at | `timestamp with time zone` | YES | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |

## Constraints

### Primary Key
- `leo_integration_verification_results_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_integration_verification_results_contract_id_fkey`: contract_id → leo_integration_contracts(id)

### Check Constraints
- `leo_integration_verification_results_score_check`: CHECK (((score >= 0) AND (score <= 100)))

## Indexes

- `idx_oiv_results_contract_id`
  ```sql
  CREATE INDEX idx_oiv_results_contract_id ON public.leo_integration_verification_results USING btree (contract_id)
  ```
- `idx_oiv_results_final_status`
  ```sql
  CREATE INDEX idx_oiv_results_final_status ON public.leo_integration_verification_results USING btree (final_status)
  ```
- `idx_oiv_results_run_id`
  ```sql
  CREATE INDEX idx_oiv_results_run_id ON public.leo_integration_verification_results USING btree (run_id)
  ```
- `idx_oiv_results_sd_id`
  ```sql
  CREATE INDEX idx_oiv_results_sd_id ON public.leo_integration_verification_results USING btree (sd_id)
  ```
- `idx_oiv_results_started_at`
  ```sql
  CREATE INDEX idx_oiv_results_started_at ON public.leo_integration_verification_results USING btree (started_at)
  ```
- `leo_integration_verification_results_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_integration_verification_results_pkey ON public.leo_integration_verification_results USING btree (id)
  ```

## RLS Policies

### 1. Anon can insert verification results (INSERT)

- **Roles**: {anon}
- **With Check**: `true`

### 2. Anon can read and insert verification results (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 3. Authenticated users can read results (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. Service role full access on leo_integration_verification_result (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
