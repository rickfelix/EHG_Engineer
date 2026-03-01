---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# PRD Integration & Operationalization Section Guide


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Purpose](#purpose)
- [Section Structure](#section-structure)
  - [1. Consumers & User Journeys](#1-consumers-user-journeys)
  - [2. Upstream/Downstream Dependencies](#2-upstreamdownstream-dependencies)
  - [3. Data Contracts & Schema](#3-data-contracts-schema)
  - [4. Runtime Configuration & Environments](#4-runtime-configuration-environments)
  - [5. Observability, Rollout & Rollback](#5-observability-rollout-rollback)
- [Validation Gate](#validation-gate)
  - [Validation Rules](#validation-rules)
  - [SD Type Enforcement](#sd-type-enforcement)
  - [Error Codes](#error-codes)
- [How to Use This Section](#how-to-use-this-section)
  - [During PLAN Phase (PRD Creation)](#during-plan-phase-prd-creation)
  - [During EXEC Phase (Implementation)](#during-exec-phase-implementation)
- [Examples](#examples)
  - [Example 1: Feature SD - User Analytics Dashboard](#example-1-feature-sd---user-analytics-dashboard)
  - [Example 2: Infrastructure SD - Database Migration](#example-2-infrastructure-sd---database-migration)
- [Related Documentation](#related-documentation)
- [Troubleshooting](#troubleshooting)
  - ["Integration section missing" error](#integration-section-missing-error)
  - ["No consumer justification required" warning (infrastructure SDs)](#no-consumer-justification-required-warning-infrastructure-sds)
  - ["Subsection X missing" error](#subsection-x-missing-error)

## Metadata
- **Category**: Guide
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DATABASE Sub-Agent (SD-LEO-INFRA-PRD-INTEGRATION-SECTION-001)
- **Last Updated**: 2026-02-02
- **Tags**: prd, integration, validation, plan-to-exec

## Overview

The **Integration & Operationalization** section is a mandatory part of Product Requirements Documents (PRDs) that forces explicit thinking about how new work integrates with the existing codebase. This guide explains how to complete this section effectively.

## Purpose

Before implementation begins (EXEC phase), the PLAN phase must answer:
- **Who uses this?** (Consumers & User Journeys)
- **What does it depend on?** (Upstream/Downstream Dependencies)
- **What data contracts exist?** (Schema, API shapes)
- **How is it configured?** (Environment variables, feature flags)
- **How is it monitored?** (Metrics, rollout/rollback strategy)

## Section Structure

The integration section has 5 mandatory subsections stored in the `product_requirements_v2.integration_operationalization` JSONB column:

### 1. Consumers & User Journeys

**Purpose**: Identify who/what depends on this feature and what breaks if it fails.

**Required Fields**:
```json
{
  "consumers": [
    {
      "name": "Admin Dashboard",
      "type": "ui_component",
      "impact_if_broken": "Admins cannot view user analytics",
      "user_journey": "Admin → Analytics Tab → View Charts"
    }
  ]
}
```

**SD Type Requirements**:
- **infrastructure**: REQUIRED (≥30 char justification if no consumers)
- **feature**: REQUIRED
- **bugfix**: Optional

**Examples**:
- UI Component: "Admin Dashboard - Analytics Tab"
- Backend Service: "Notification Service - Email Queue Processor"
- External System: "Stripe Webhook Handler"

### 2. Upstream/Downstream Dependencies

**Purpose**: Document what this feature calls (upstream) and what calls it (downstream).

**Required Fields**:
```json
{
  "upstream_dependencies": [
    {
      "name": "User Service API",
      "direction": "upstream",
      "relationship": "calls",
      "failure_mode": "Return cached data, show stale message"
    }
  ],
  "downstream_dependencies": [
    {
      "name": "Analytics Dashboard",
      "direction": "downstream",
      "relationship": "called_by",
      "failure_mode": "Dashboard shows 'Data unavailable'"
    }
  ]
}
```

**Failure Mode**: How the system behaves when this dependency is unavailable.

**Examples**:
- Upstream: "Supabase Auth - Returns cached session if unavailable"
- Downstream: "Mobile App - Shows offline mode banner"

### 3. Data Contracts & Schema

**Purpose**: Define the shape of data exchanged between systems.

**Required Fields**:
```json
{
  "data_contracts": [
    {
      "contract_name": "UserAnalytics API Response",
      "schema": {
        "type": "object",
        "properties": {
          "user_id": "uuid",
          "metrics": "jsonb",
          "timestamp": "timestamptz"
        }
      },
      "validation_rules": ["user_id is required", "timestamp must be ISO 8601"]
    }
  ]
}
```

**Include**:
- Database schema changes (new tables, columns, indexes)
- API request/response shapes
- Event payload structures
- File format specifications

### 4. Runtime Configuration & Environments

**Purpose**: Document environment-specific settings required for this feature.

**Required Fields**:
```json
{
  "runtime_config": [
    {
      "config_key": "ANALYTICS_REFRESH_INTERVAL",
      "description": "Seconds between analytics data refreshes",
      "default_value": "300",
      "required_environments": ["production", "staging"]
    }
  ],
  "feature_flags": [
    {
      "flag_name": "enable_advanced_analytics",
      "description": "Show advanced analytics charts",
      "default_state": "disabled",
      "rollout_strategy": "gradual_10_percent_increments"
    }
  ]
}
```

**Include**:
- Environment variables (API keys, URLs, limits)
- Feature flags and their rollout strategy
- Configuration files (e.g., `.env.example` changes)

### 5. Observability, Rollout & Rollback

**Purpose**: Define how to measure success and safely deploy/revert this feature.

**Required Fields**:
```json
{
  "observability": {
    "metrics_to_track": [
      {
        "metric_name": "analytics_api_response_time",
        "threshold": "< 500ms p95",
        "alert_condition": "> 1000ms for 5 minutes"
      }
    ],
    "logs_to_capture": ["analytics.request", "analytics.error"],
    "dashboards": ["Analytics API Health Dashboard"]
  },
  "rollout_strategy": {
    "phases": [
      "Deploy to staging → Verify E2E tests pass",
      "Canary 10% production traffic → Monitor error rate",
      "Full production rollout if error rate < 1%"
    ]
  },
  "rollback_plan": {
    "trigger": "Error rate > 5% OR p95 latency > 2000ms",
    "steps": [
      "Disable feature flag 'enable_advanced_analytics'",
      "Revert database migration if schema change exists",
      "Monitor for 15 minutes to confirm stability"
    ]
  }
}
```

**Include**:
- Metrics to track (latency, error rate, throughput)
- Logging strategy
- Canary deployment steps
- Rollback triggers and procedures

## Validation Gate

The `GATE_INTEGRATION_SECTION_VALIDATION` runs during the PLAN-TO-EXEC handoff and validates:

### Validation Rules

1. **Section Exists**: PRD must have `integration_operationalization` field populated
2. **All 5 Subsections Present**: consumers, dependencies, data_contracts, runtime_config, observability
3. **Consumer Presence (infrastructure SDs)**:
   - If `sd_type = 'infrastructure'` AND no consumers listed
   - THEN `no_consumers_justification` must be ≥30 characters

### SD Type Enforcement

| SD Type | Enforcement Level |
|---------|-------------------|
| feature, bugfix | BLOCKING (handoff rejected if missing) |
| infrastructure | WARNING (handoff proceeds, logged) |
| documentation | SKIP (validation bypassed) |

### Error Codes

- `ERR_INTEGRATION_SECTION_MISSING` - Section not found in PRD
- `ERR_INTEGRATION_CONSUMERS_MISSING` - Consumers subsection missing
- `ERR_INTEGRATION_DEPENDENCIES_MISSING` - Dependencies subsection missing
- `ERR_INTEGRATION_CONTRACTS_MISSING` - Data contracts subsection missing
- `ERR_INTEGRATION_CONFIG_MISSING` - Runtime config subsection missing
- `ERR_INTEGRATION_OBSERVABILITY_MISSING` - Observability subsection missing
- `ERR_INFRASTRUCTURE_NO_CONSUMER_JUSTIFICATION` - Infrastructure SD with no consumers lacks justification

## How to Use This Section

### During PLAN Phase (PRD Creation)

1. **Read the PRD template** - The integration section is pre-scaffolded in `scripts/modules/prd-validator/template-generator.js`
2. **Fill each subsection** - Use the structured tables provided
3. **Think critically**:
   - What breaks if this feature is down?
   - What upstream services can fail and how do we handle it?
   - What data do we send/receive?
   - What environment variables are needed?
   - How do we measure success and roll back if needed?

### During EXEC Phase (Implementation)

**MANDATORY**: Read the integration section BEFORE writing any code (EXEC step 0.5).

Extract and document:
- **Consumers**: Who/what uses this feature?
- **Dependencies**: Upstream systems to call, downstream systems that call us
- **Failure modes**: Error handling for each dependency
- **Data contracts**: Schema changes, API shapes to implement
- **Runtime config**: Env vars to add, feature flags to configure
- **Observability**: Metrics to track, rollout/rollback plan

**If section is missing**: Flag to PLAN for remediation before EXEC proceeds.

## Examples

### Example 1: Feature SD - User Analytics Dashboard

```json
{
  "consumers": [
    {
      "name": "Admin Dashboard - Analytics Tab",
      "type": "ui_component",
      "impact_if_broken": "Admins cannot view user engagement metrics",
      "user_journey": "Admin → Dashboard → Analytics → View Charts"
    }
  ],
  "upstream_dependencies": [
    {
      "name": "Supabase Analytics API",
      "direction": "upstream",
      "relationship": "calls",
      "failure_mode": "Return cached data with 'Stale Data' banner"
    }
  ],
  "downstream_dependencies": [],
  "data_contracts": [
    {
      "contract_name": "Analytics API Response",
      "schema": {
        "user_count": "integer",
        "active_sessions": "integer",
        "timestamp": "timestamptz"
      }
    }
  ],
  "runtime_config": [
    {
      "config_key": "ANALYTICS_CACHE_TTL",
      "default_value": "300",
      "required_environments": ["production"]
    }
  ],
  "observability": {
    "metrics_to_track": [
      {
        "metric_name": "analytics_api_latency",
        "threshold": "< 500ms p95"
      }
    ]
  }
}
```

### Example 2: Infrastructure SD - Database Migration

```json
{
  "consumers": [],
  "no_consumers_justification": "Schema-only migration adds RLS policies to existing tables. No direct consumers - infrastructure change only.",
  "upstream_dependencies": [],
  "downstream_dependencies": [
    {
      "name": "All API endpoints using affected tables",
      "direction": "downstream",
      "relationship": "called_by",
      "failure_mode": "RLS policies enforce permissions; unauthorized access returns 403"
    }
  ],
  "data_contracts": [
    {
      "contract_name": "RLS Policy Rules",
      "schema": "Users can only read their own data; admins can read all"
    }
  ],
  "runtime_config": [],
  "observability": {
    "metrics_to_track": [
      {
        "metric_name": "rls_policy_violations",
        "threshold": "0 unauthorized access attempts"
      }
    ],
    "rollback_plan": {
      "trigger": "RLS policies block legitimate user access",
      "steps": ["Revert migration", "Verify existing queries work"]
    }
  }
}
```

## Related Documentation

- [PRD Creation Process](./prd-creation-process.md) - Overall PRD workflow
- [PRD Developer Guide](./prd-developer-guide.md) - Technical implementation details
- [Validation Enforcement](../reference/validation-enforcement.md) - All validation gates
- PLAN-TO-EXEC Handoff - Phase transition requirements

## Troubleshooting

### "Integration section missing" error

**Cause**: PRD was created before this feature was added OR section was accidentally deleted.

**Fix**:
1. Read the PRD template generator: `scripts/modules/prd-validator/template-generator.js`
2. Copy the integration section structure from lines 228-296
3. Paste into PRD and fill in the 5 subsections
4. Update PRD in database

### "No consumer justification required" warning (infrastructure SDs)

**Cause**: Infrastructure SD has no consumers listed and no justification.

**Fix**:
Add `no_consumers_justification` field with ≥30 characters explaining why no direct consumers exist.

Example: "Schema migration adds indexes only. No UI/API changes. Improves query performance but has no direct consumers."

### "Subsection X missing" error

**Cause**: One of the 5 required subsections is missing or empty.

**Fix**:
Ensure ALL 5 subsections are present in `integration_operationalization` JSONB:
1. consumers (or no_consumers_justification)
2. upstream_dependencies & downstream_dependencies
3. data_contracts
4. runtime_config (can be empty array if no config needed)
5. observability (metrics, rollout, rollback)

---

*Generated by: SD-LEO-INFRA-PRD-INTEGRATION-SECTION-001*
*Part of: LEO Protocol v4.3.3 - Database-First Documentation*
