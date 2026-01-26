# OKR Strategic Hierarchy Schema Documentation


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, unit, migration, schema

**Generated**: 2026-01-04T18:04:20.217Z
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Migration**: 20260104_okr_strategic_hierarchy.sql

## Overview

This schema implements a hierarchical OKR (Objectives and Key Results) system that connects:
- **Strategic Vision** (2-5 year horizon)
- **Objectives** (qualitative goals)
- **Key Results** (measurable outcomes)
- **Strategic Directives** (aligned work items)

## Table: strategic_vision

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| code | text | No | - |
| title | text | No | - |
| statement | text | No | - |
| time_horizon_start | date | Yes | - |
| time_horizon_end | date | Yes | - |
| is_active | boolean | Yes | true |
| created_by | text | Yes | 'system'::text |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

**Constraints:**
- CHECK: 2200_348556_1_not_null
- CHECK: 2200_348556_2_not_null
- CHECK: 2200_348556_3_not_null
- CHECK: 2200_348556_4_not_null
- PRIMARY KEY: strategic_vision_pkey
- UNIQUE: strategic_vision_code_key

## Table: objectives

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| vision_id | uuid | Yes | - |
| code | text | No | - |
| title | text | No | - |
| description | text | Yes | - |
| owner | text | Yes | - |
| cadence | text | Yes | 'quarterly'::text |
| period | text | Yes | - |
| sequence | integer | Yes | 1 |
| is_active | boolean | Yes | true |
| created_by | text | Yes | 'system'::text |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

**Constraints:**
- CHECK: 2200_348570_1_not_null
- CHECK: 2200_348570_4_not_null
- CHECK: 2200_348570_3_not_null
- CHECK: objectives_cadence_check
- FOREIGN KEY: objectives_vision_id_fkey
- PRIMARY KEY: objectives_pkey
- UNIQUE: objectives_code_key

## Table: key_results

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| objective_id | uuid | Yes | - |
| code | text | No | - |
| title | text | No | - |
| description | text | Yes | - |
| metric_type | text | Yes | - |
| baseline_value | numeric | Yes | - |
| current_value | numeric | Yes | - |
| target_value | numeric | No | - |
| unit | text | Yes | - |
| direction | text | Yes | 'increase'::text |
| confidence | numeric | Yes | - |
| status | text | Yes | 'pending'::text |
| sequence | integer | Yes | 1 |
| is_active | boolean | Yes | true |
| last_updated_by | text | Yes | - |
| created_by | text | Yes | 'system'::text |
| created_at | timestamp with time zone | Yes | now() |
| updated_at | timestamp with time zone | Yes | now() |

**Constraints:**
- CHECK: 2200_348594_4_not_null
- CHECK: key_results_confidence_check
- CHECK: key_results_direction_check
- CHECK: key_results_metric_type_check
- CHECK: 2200_348594_3_not_null
- CHECK: 2200_348594_9_not_null
- CHECK: key_results_status_check
- CHECK: 2200_348594_1_not_null
- FOREIGN KEY: key_results_objective_id_fkey
- PRIMARY KEY: key_results_pkey
- UNIQUE: key_results_code_key

## Table: sd_key_result_alignment

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| sd_id | character varying | Yes | - |
| key_result_id | uuid | Yes | - |
| contribution_type | text | Yes | 'supporting'::text |
| contribution_weight | numeric | Yes | 1.0 |
| contribution_note | text | Yes | - |
| aligned_by | text | Yes | 'manual'::text |
| alignment_confidence | numeric | Yes | - |
| created_by | text | Yes | 'system'::text |
| created_at | timestamp with time zone | Yes | now() |

**Constraints:**
- CHECK: sd_key_result_alignment_aligned_by_check
- CHECK: sd_key_result_alignment_alignment_confidence_check
- CHECK: sd_key_result_alignment_contribution_type_check
- CHECK: sd_key_result_alignment_contribution_weight_check
- CHECK: 2200_348623_1_not_null
- FOREIGN KEY: sd_key_result_alignment_sd_id_fkey
- FOREIGN KEY: sd_key_result_alignment_key_result_id_fkey
- PRIMARY KEY: sd_key_result_alignment_pkey
- UNIQUE: sd_key_result_alignment_sd_id_key_result_id_key

## Table: kr_progress_snapshots

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | No | gen_random_uuid() |
| key_result_id | uuid | Yes | - |
| snapshot_date | date | No | CURRENT_DATE |
| value | numeric | No | - |
| notes | text | Yes | - |
| created_by | text | Yes | 'system'::text |
| created_at | timestamp with time zone | Yes | now() |

**Constraints:**
- CHECK: 2200_348654_1_not_null
- CHECK: 2200_348654_3_not_null
- CHECK: 2200_348654_4_not_null
- FOREIGN KEY: kr_progress_snapshots_key_result_id_fkey
- PRIMARY KEY: kr_progress_snapshots_pkey
- UNIQUE: kr_progress_snapshots_key_result_id_snapshot_date_key

## Views

### v_okr_hierarchy
Full hierarchical view: Vision → Objectives → Key Results with progress calculations.

### v_okr_scorecard
Aggregated objective-level metrics with progress indicators (5-dot display).

### v_sd_okr_context
Strategic Directives with their aligned Key Results (for sd:next integration).

### v_key_results_with_sds
Key Results with counts of aligned, active, and completed SDs.

## Functions

### update_kr_status()
Trigger function that auto-updates key_results.status based on current_value vs target_value.

### get_unaligned_sds()
Returns active Strategic Directives that are not aligned to any Key Result.
