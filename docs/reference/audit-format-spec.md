---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Audit File Format Specification



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [File Location & Naming](#file-location-naming)
  - [Directory](#directory)
  - [Filename Format](#filename-format)
- [Required Structure](#required-structure)
  - [Minimum Required Sections](#minimum-required-sections)
  - [Optional Sections](#optional-sections)
- [Issues Table Format](#issues-table-format)
  - [Required Columns](#required-columns)
  - [Example Table](#example-table)
- [ID Format Rules](#id-format-rules)
  - [Structure](#structure)
  - [PREFIX Requirements](#prefix-requirements)
  - [NUMBER Requirements](#number-requirements)
  - [Valid Examples](#valid-examples)
  - [Invalid Examples](#invalid-examples)
- [Type Values (Enum)](#type-values-enum)
- [Severity Values (Enum)](#severity-values-enum)
- [Description Field Rules](#description-field-rules)
  - [CRITICAL: Verbatim Preservation](#critical-verbatim-preservation)
  - [Example - Correct](#example---correct)
  - [Example - INCORRECT (Do Not Do)](#example---incorrect-do-not-do)
- [Multiple Tables](#multiple-tables)
- [Critical Issues](#critical-issues)
- [UX Observations](#ux-observations)
- [Brainstorm Ideas](#brainstorm-ideas)
- [Validation Rules](#validation-rules)
  - [File-Level](#file-level)
  - [Table-Level](#table-level)
  - [Row-Level](#row-level)
- [Validation Script Usage](#validation-script-usage)
  - [Expected Output (Valid)](#expected-output-valid)
  - [Expected Output (Invalid)](#expected-output-invalid)
- [Migration Notes](#migration-notes)
  - [Existing Audits](#existing-audits)
  - [December 26 Navigation Audit](#december-26-navigation-audit)
- [Related Documentation](#related-documentation)

## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: api, testing, migration, security

**Version**: 1.0
**Date**: 2025-12-28
**Status**: Active

---

## Overview

This specification defines the required format for runtime audit files. All audit files must conform to this spec to be processable by the audit-to-SD pipeline.

---

## File Location & Naming

### Directory
All audit files must be stored in:
```
docs/audits/
```

### Filename Format
```
YYYY-MM-DD-{audit-name}.md
```

**Examples**:
- `2025-12-26-navigation-audit.md`
- `2025-12-28-api-endpoint-audit.md`
- `2025-01-15-chairman-walkthrough.md`

**Rules**:
- Date must be ISO 8601 format (YYYY-MM-DD)
- Audit name must be lowercase
- Use hyphens as word separators (no spaces or underscores)
- Extension must be `.md`

---

## Required Structure

### Minimum Required Sections

1. **Title** - H1 heading with audit name and date
2. **Context** - Brief description of what was tested
3. **Issues Table** - At least one markdown table with findings

### Optional Sections

- Summary statistics
- Themes identified
- Recommendations
- Follow-up actions

---

## Issues Table Format

### Required Columns

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| **ID** | String | Unique identifier in PREFIX-NN format | `NAV-01`, `UAT-15` |
| **Route** | Path | Application route path or "Global" | `/chairman/decisions` |
| **Type** | Enum | Issue category | `Bug`, `UX`, `Brainstorm` |
| **Severity** | Enum | Issue severity level | `Critical`, `Major`, `Minor` |
| **Description** | Text | Verbatim observation (Chairman's words) | "Button doesn't respond on click" |

### Example Table

```markdown
| ID | Route | Type | Severity | Description |
|----|-------|------|----------|-------------|
| NAV-01 | /dashboard | Bug | Critical | Dashboard crashes on load when user has no ventures |
| NAV-02 | /chairman/decisions | UX | Major | Decision cards too small to read on mobile |
| NAV-03 | Global | Brainstorm | Idea | Consider adding dark mode toggle |
```

---

## ID Format Rules

### Structure
```
{PREFIX}-{NUMBER}
```

### PREFIX Requirements
- 2-5 uppercase letters
- Descriptive of audit scope
- Consistent within a single audit file

**Common Prefixes**:
| Prefix | Usage |
|--------|-------|
| `NAV` | Navigation/routing audits |
| `UAT` | User acceptance testing |
| `API` | API endpoint audits |
| `UI` | User interface audits |
| `PERF` | Performance audits |
| `SEC` | Security audits |

### NUMBER Requirements
- 2 or more digits
- Zero-padded (e.g., `01`, `09`, `99`, `100`)
- Sequential within file (no gaps required)
- Unique within file

### Valid Examples
```
NAV-01, NAV-99, NAV-100
UAT-001, UAT-042
API-01, API-15
```

### Invalid Examples
```
NAV1        # Missing hyphen
nav-01      # Lowercase prefix
NAV-1       # Single digit (must be 01)
N-01        # Prefix too short
NAVIGATE-01 # Prefix too long
```

---

## Type Values (Enum)

| Value | Description | Typical Disposition |
|-------|-------------|---------------------|
| `Bug` | Something is broken/not working | `sd_created` |
| `UX` | User experience issue (not broken, but poor) | `sd_created` or `deferred` |
| `Brainstorm` | New idea or suggestion | `needs_discovery` |
| `Theme` | Cross-cutting pattern across issues | `sd_created` (as Theme SD) |
| `Question` | Needs clarification before action | `needs_discovery` |
| `Observation` | Strategic insight (no immediate action) | `deferred` or `sd_created` |

**Case Sensitivity**: First letter uppercase, rest lowercase

---

## Severity Values (Enum)

| Value | Description | Priority |
|-------|-------------|----------|
| `Critical` | Application unusable, data loss risk | P0 - Immediate |
| `Major` | Significant functionality broken | P1 - High |
| `Minor` | Small issue, workaround exists | P2 - Medium |
| `Idea` | Enhancement suggestion | P3 - Low |

**Case Sensitivity**: First letter uppercase, rest lowercase

---

## Description Field Rules

### CRITICAL: Verbatim Preservation

The Description field MUST contain the Chairman's **exact words**.

**DO NOT**:
- Summarize or paraphrase
- Add technical jargon not in original
- Remove emotional context
- "Clean up" grammar
- Truncate long observations

**DO**:
- Preserve original phrasing
- Include quoted speech markers if present
- Keep original punctuation
- Maintain full context

### Example - Correct

**Original observation**: "This page is completely useless - why do we even have it? First principles rethink needed."

**In table**:
```markdown
| NAV-42 | /reports/legacy | Observation | Major | This page is completely useless - why do we even have it? First principles rethink needed. |
```

### Example - INCORRECT (Do Not Do)

```markdown
| NAV-42 | /reports/legacy | Bug | Minor | Legacy reports page needs review |
```
*This summarizes, changes type/severity, and loses Chairman's voice.*

---

## Multiple Tables

Audit files MAY contain multiple tables for different sections:

```markdown
## Critical Issues
| ID | Route | Type | Severity | Description |
|----|-------|------|----------|-------------|
| NAV-01 | ... | Bug | Critical | ... |

## UX Observations
| ID | Route | Type | Severity | Description |
|----|-------|------|----------|-------------|
| NAV-10 | ... | UX | Major | ... |

## Brainstorm Ideas
| ID | Route | Type | Severity | Description |
|----|-------|------|----------|-------------|
| NAV-20 | ... | Brainstorm | Idea | ... |
```

**Rules for multiple tables**:
- Each table must have all required columns
- IDs must be unique across ALL tables in the file
- Tables can have different purposes but same format

---

## Validation Rules

### File-Level
1. File exists in `docs/audits/`
2. Filename matches `YYYY-MM-DD-*.md` pattern
3. Contains at least one valid markdown table
4. Has H1 title

### Table-Level
1. Has all 5 required columns: ID, Route, Type, Severity, Description
2. At least 1 data row (besides header)
3. No empty ID cells
4. No empty Description cells

### Row-Level
1. ID matches `{PREFIX}-{NN+}` pattern
2. Type is valid enum value
3. Severity is valid enum value
4. ID is unique within file

---

## Validation Script Usage

```bash
# Validate a single file
npm run audit:validate -- --file docs/audits/2025-12-26-navigation-audit.md

# Validate with verbose output
npm run audit:validate -- --file docs/audits/2025-12-26-navigation-audit.md --verbose
```

### Expected Output (Valid)
```
Validating: docs/audits/2025-12-26-navigation-audit.md
File format: VALID
Tables found: 3
Total issues: 79
ID format: ALL VALID
Types: ALL VALID
Severities: ALL VALID

Result: PASSED
```

### Expected Output (Invalid)
```
Validating: docs/audits/bad-audit.md

ERRORS:
  - Line 15: ID "NAV1" does not match required format {PREFIX}-{NN}
  - Line 23: Type "bug" should be "Bug" (case sensitive)
  - Line 31: Duplicate ID "NAV-05" found (first occurrence: line 18)

WARNINGS:
  - Line 45: Empty Description field

Result: FAILED (3 errors, 1 warning)
```

---

## Migration Notes

### Existing Audits
Audits created before this spec should be validated and fixed if needed before ingestion.

### December 26 Navigation Audit
- File: `docs/audits/2025-12-26-navigation-audit.md`
- Status: Pre-spec, needs validation
- Expected issues: 79
- Prefix: NAV

---

## Related Documentation

- [Audit-to-SD Pipeline](./audit-to-sd-pipeline.md) - How ingested audits become SDs
- [Researcher Agent Workflow](./researcher-agent-workflow.md) - For discovery_spike and architectural_review SDs
- [Runtime Audit Protocol](../protocols/runtime-audit-protocol.md) - Full 7-phase audit process

---

*Specification created: 2025-12-28*
*Based on triangulated recommendations (Claude + OpenAI + Antigravity)*
