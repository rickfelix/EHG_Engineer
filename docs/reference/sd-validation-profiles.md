---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# SD Validation Profiles Reference



## Table of Contents

- [Metadata](#metadata)
- [Valid SD Status Values](#valid-sd-status-values)
- [Valid SD Type Values](#valid-sd-type-values)
- [Type-Specific Required Fields](#type-specific-required-fields)
  - [All Types (Required)](#all-types-required)
  - [bugfix / feature Types](#bugfix-feature-types)
  - [refactor Type](#refactor-type)
  - [orchestrator Type](#orchestrator-type)
  - [infrastructure / documentation Types](#infrastructure-documentation-types)
- [Feedback Table Schema](#feedback-table-schema)
  - [Valid source_type Values](#valid-source_type-values)
  - [Valid type Values](#valid-type-values)
  - [Valid status Values](#valid-status-values)
  - [Valid priority Values](#valid-priority-values)
- [Handoff Requirements by Type](#handoff-requirements-by-type)
  - [LEAD-TO-PLAN Handoff](#lead-to-plan-handoff)
  - [PLAN-TO-EXEC Handoff](#plan-to-exec-handoff)
  - [EXEC-TO-PLAN Handoff](#exec-to-plan-handoff)
- [Quick Reference Matrix](#quick-reference-matrix)
- [Related Scripts](#related-scripts)
- [Version History](#version-history)

## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-19
- **Tags**: database, testing, e2e, migration

This document defines the validation requirements for Strategic Directives (SDs) based on their `sd_type`. It was created as part of SD-UAT-WORKFLOW-001 to eliminate trial-and-error during SD creation.

---

## Table of Contents

1. [Valid SD Status Values](#valid-sd-status-values)
2. [Valid SD Type Values](#valid-sd-type-values)
3. [Type-Specific Required Fields](#type-specific-required-fields)
4. [Feedback Table Schema](#feedback-table-schema)
5. [Handoff Requirements by Type](#handoff-requirements-by-type)
6. [Quick Reference Matrix](#quick-reference-matrix)

---

## Valid SD Status Values

The `strategic_directives_v2.status` column accepts these values:

| Status | Description | When to Use |
|--------|-------------|-------------|
| `draft` | Initial state, not yet started | New SDs |
| `in_progress` | Work has begun | After LEAD-TO-PLAN approval |
| `active` | Currently being executed | During EXEC phase |
| `pending_approval` | Awaiting review | Before final approval |
| `completed` | Work finished | After LEAD-FINAL-APPROVAL |
| `deferred` | Postponed to future | Deprioritized SDs |
| `cancelled` | Abandoned | SDs that won't be completed |

**Constraint**: `strategic_directives_v2_status_check`

---

## Valid SD Type Values

The `strategic_directives_v2.sd_type` column accepts these values:

| SD Type | Purpose | Sub-agents Involved |
|---------|---------|---------------------|
| `bugfix` | Fix defects/errors | TESTING, GITHUB |
| `database` | Schema changes, migrations | DATABASE |
| `docs` | Documentation only | DOCMON |
| `documentation` | Documentation (alias) | DOCMON |
| `feature` | New functionality | DESIGN, DATABASE, TESTING, GITHUB |
| `infrastructure` | Build tools, CI/CD, scripts | None (reduced workflow) |
| `orchestrator` | Parent SD coordinating children | None (manages children) |
| `qa` | Testing/quality work | TESTING |
| `refactor` | Code restructuring | REGRESSION |
| `security` | Security improvements | SECURITY |
| `implementation` | General implementation | TESTING, GITHUB |
| `discovery_spike` | Research/exploration | None |
| `ux_debt` | UX improvements | DESIGN |
| `product_decision` | Product direction | None |

**Constraint**: `strategic_directives_v2_sd_type_check`

---

## Type-Specific Required Fields

Different SD types have different required fields for handoff validation:

### All Types (Required)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Auto-generated or explicit UUID |
| `sd_key` | string | Human-readable key (e.g., SD-FIX-001) |
| `title` | string | Descriptive title |
| `description` | text | What the SD accomplishes |
| `rationale` | text | **Why** this work matters |
| `status` | enum | See valid statuses above |
| `sd_type` | enum | See valid types above |
| `success_criteria` | JSON array | Measurable success criteria |

### bugfix / feature Types

These types require **smoke_test_steps** for LEAD-TO-PLAN:

```json
{
  "smoke_test_steps": [
    {
      "step_number": 1,
      "instruction": "Navigate to [feature]",
      "expected_outcome": "Feature loads without errors"
    },
    {
      "step_number": 2,
      "instruction": "Perform [action]",
      "expected_outcome": "[Expected result]"
    }
  ]
}
```

**Why**: Human-verifiable outcome (Q9 in LEAD checklist)

### refactor Type

Requires **intensity_level** field:

| Level | Description | Risk |
|-------|-------------|------|
| `cosmetic` | Naming, formatting only | Very Low |
| `minor` | Small structural changes | Low |
| `moderate` | Significant restructuring | Medium |
| `major` | Architecture-level changes | High |
| `critical` | Core system changes | Very High |

### orchestrator Type

Requires:
- `parent_sd_id` should be NULL (it's the parent)
- Children must have `parent_sd_id` set to orchestrator's `id`

### infrastructure / documentation Types

**Reduced workflow**:
- E2E tests not required
- TESTING/GITHUB sub-agents skipped
- EXEC-TO-PLAN optional

---

## Feedback Table Schema

The `feedback` table stores UAT findings and manual feedback:

### Valid source_type Values

| Value | Description | When to Use |
|-------|-------------|-------------|
| `uat_failure` | Defect found during UAT | Automated by /uat command |
| `manual_feedback` | User-reported issue | Manual entry |

### Valid type Values

| Value | Description | Maps to SD Type |
|-------|-------------|-----------------|
| `issue` | Bug, error, problem | `bugfix` |
| `enhancement` | New feature request | `feature` |

### Valid status Values

| Value | Description |
|-------|-------------|
| `open` | New, unprocessed |
| `triaged` | Reviewed, prioritized |
| `in_progress` | Being worked on |
| `resolved` | Fixed |
| `closed` | Completed |
| `rejected` | Won't fix |
| `snoozed` | Deferred |

### Valid priority Values

| Value | Description |
|-------|-------------|
| `P0` | Critical - blocking |
| `P1` | High - urgent |
| `P2` | Medium - normal |
| `P3` | Low - nice to have |

---

## Handoff Requirements by Type

### LEAD-TO-PLAN Handoff

| SD Type | Minimum Score | Required Fields | Notes |
|---------|--------------|-----------------|-------|
| `bugfix` | 90% | smoke_test_steps | Human-verifiable outcome |
| `feature` | 90% | smoke_test_steps | Human-verifiable outcome |
| `refactor` | 90% | intensity_level | Risk assessment |
| `infrastructure` | 80% | None extra | Reduced validation |
| `documentation` | 80% | None extra | Reduced validation |
| `orchestrator` | 90% | Children defined | Coordination SD |

### PLAN-TO-EXEC Handoff

| SD Type | PRD Required | User Stories | E2E Tests |
|---------|--------------|--------------|-----------|
| `bugfix` | Yes | Yes | Yes |
| `feature` | Yes | Yes | Yes |
| `refactor` | Yes | Optional | Optional |
| `infrastructure` | Yes | Yes | No |
| `documentation` | Optional | No | No |
| `orchestrator` | No | No | No (children have own) |

### EXEC-TO-PLAN Handoff

| SD Type | Required | Tests Must Pass |
|---------|----------|-----------------|
| `bugfix` | Yes | Yes |
| `feature` | Yes | Yes |
| `refactor` | Yes | Yes |
| `infrastructure` | Optional | N/A |
| `documentation` | No | N/A |
| `orchestrator` | No | N/A |

---

## Quick Reference Matrix

| SD Type | smoke_test_steps | intensity_level | E2E Required | Sub-agents |
|---------|-----------------|-----------------|--------------|------------|
| `bugfix` | REQUIRED | - | Yes | TESTING, GITHUB |
| `feature` | REQUIRED | - | Yes | DESIGN, DATABASE, TESTING, GITHUB |
| `refactor` | - | REQUIRED | Optional | REGRESSION |
| `infrastructure` | - | - | No | None |
| `documentation` | - | - | No | DOCMON |
| `orchestrator` | - | - | No | None |
| `security` | - | - | Yes | SECURITY |
| `qa` | - | - | Yes | TESTING |
| `ux_debt` | - | - | Yes | DESIGN |

---

## Related Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create-sd.js` | Create SDs with type-aware validation |
| `scripts/sd-from-feedback.js` | Convert feedback items to SDs |
| `scripts/handoff.js` | Execute phase transitions |

---

## Version History

| Date | Change |
|------|--------|
| 2026-01-19 | Initial creation (SD-UAT-WORKFLOW-001) |

---

*This document is maintained as part of the LEO Protocol infrastructure.*
