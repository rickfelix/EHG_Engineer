---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# EXEC Agent Guide: Using Component Recommendations



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Reading Component Recommendations](#reading-component-recommendations)
  - [PRD Structure](#prd-structure)
  - [Understanding Confidence Scores](#understanding-confidence-scores)
  - [Understanding the Explanation](#understanding-the-explanation)
- [Installation Workflow](#installation-workflow)
  - [Step 1: Review Recommendations](#step-1-review-recommendations)
  - [Step 2: Install Critical Components](#step-2-install-critical-components)
  - [Step 3: Evaluate Recommended Components](#step-3-evaluate-recommended-components)
  - [Step 4: Consider Optional Components](#step-4-consider-optional-components)
- [Handling Warnings](#handling-warnings)
  - [Bundle Size Warnings](#bundle-size-warnings)
  - [Dependency Warnings](#dependency-warnings)
- [Using Alternatives](#using-alternatives)
- [Installation Script Generation](#installation-script-generation)
- [Troubleshooting](#troubleshooting)
  - [No Recommendations Found](#no-recommendations-found)
  - [Irrelevant Recommendations](#irrelevant-recommendations)
  - [Missing Components](#missing-components)
- [Best Practices](#best-practices)
  - [1. Install Components Early](#1-install-components-early)
  - [2. Trust the Confidence Scores](#2-trust-the-confidence-scores)
  - [3. Read the Explanations](#3-read-the-explanations)
  - [4. Monitor Bundle Size](#4-monitor-bundle-size)
  - [5. Document Decisions](#5-document-decisions)
- [Component Decisions](#component-decisions)
- [Integration with Existing Workflow](#integration-with-existing-workflow)
  - [PLAN Phase](#plan-phase)
  - [EXEC Phase (You)](#exec-phase-you)
  - [Handoff to Testing](#handoff-to-testing)
- [Example: Complete Workflow](#example-complete-workflow)
  - [1. Receive PRD](#1-receive-prd)
  - [2. Install Components](#2-install-components)
  - [3. Implement Features](#3-implement-features)
  - [4. Document in Handoff](#4-document-in-handoff)
- [Component Decisions](#component-decisions)
- [FAQ](#faq)
  - [Q: Can I ignore recommendations?](#q-can-i-ignore-recommendations)
  - [Q: What if a recommended component doesn't fit?](#q-what-if-a-recommended-component-doesnt-fit)
  - [Q: How do I request better recommendations?](#q-how-do-i-request-better-recommendations)
  - [Q: What if no recommendations are generated?](#q-what-if-no-recommendations-are-generated)
- [Reference Links](#reference-links)
- [Support](#support)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: api, testing, feature, guide

**Purpose**: Guide EXEC agents on how to use semantic component recommendations in PRDs

**Status**: Active (v1.0)
**Last Updated**: 2025-10-18
**Part of**: Semantic Component Selector with Explainable AI

---

## Overview

When PLAN creates a PRD, it now includes **semantic component recommendations** with **explainable confidence scores**. These recommendations are stored in the `ui_components` field and help you:

1. **Accelerate development**: Pre-selected components matching SD requirements
2. **Make informed decisions**: Confidence breakdowns explain why each component was recommended
3. **Avoid over-engineering**: Bundle size warnings and alternative suggestions
4. **Follow best practices**: Popular components with proven reliability

---

## Reading Component Recommendations

### PRD Structure

Each PRD now contains:

```json
{
  "ui_components": [
    {
      "name": "table",
      "registry": "shadcn-ui",
      "install_command": "npx shadcn@latest add table",
      "confidence": 87,
      "priority": "CRITICAL",
      "reason": "HIGH confidence (87%) - critical installation priority. Primary use case: Display structured data with sorting, filtering, and pagination. Excellent semantic match with SD requirements. Trigger keywords matched in SD description. Highly popular component with proven reliability.",
      "docs_url": "https://ui.shadcn.com/docs/components/table",
      "dependencies": [
        { "name": "@tanstack/react-table", "version": "^8.0.0" }
      ],
      "warnings": [
        {
          "type": "BUNDLE_SIZE",
          "severity": "INFO",
          "message": "Large bundle size: ~45KB. Consider performance impact."
        }
      ],
      "alternatives": [
        {
          "component": "Simple list with Card components",
          "tradeoff": "Lighter but no built-in sorting/filtering"
        }
      ]
    }
  ],
  "ui_components_summary": "Found 5 component recommendations:\n- 2 critical\n- 2 recommended\n- 1 optional"
}
```

### Understanding Confidence Scores

| Confidence | Priority | Meaning | Action |
|------------|----------|---------|--------|
| ≥85% | **CRITICAL** | High confidence match | Install immediately |
| 70-85% | **RECOMMENDED** | Strong match | Install if applicable |
| 60-70% | **OPTIONAL** | Moderate match | Consider based on specific needs |
| <60% | (Not shown) | Low confidence | Filtered out |

### Understanding the Explanation

Each recommendation includes a `reason` field with a plain-English explanation:

**Format**: `{TIER} confidence ({PERCENTAGE}%) - {PRIORITY} installation priority. {REASONING}.`

**Example**:
> "HIGH confidence (87%) - critical installation priority. Primary use case: Display structured data with sorting, filtering, and pagination. Excellent semantic match with SD requirements. Trigger keywords matched in SD description. Highly popular component with proven reliability."

**Confidence Breakdown** (available in full response):
```json
"breakdown": {
  "semantic_similarity": {
    "score": 0.82,
    "percentage": 82,
    "explanation": "82% semantic match between SD description and component use cases"
  },
  "keyword_boost": {
    "score": 0.05,
    "percentage": 5,
    "explanation": "+5% boost from matching trigger keywords"
  },
  "popularity_weight": {
    "score": 1.5,
    "percentage": 50,
    "explanation": "+50% popularity boost (widely used component)"
  },
  "final_confidence": {
    "score": 0.87,
    "percentage": 87,
    "tier": "HIGH",
    "explanation": "Final confidence: 87% (HIGH)"
  }
}
```

---

## Installation Workflow

### Step 1: Review Recommendations

```bash
# In PRD, check ui_components field
# Review confidence scores and priorities
# Read warnings and alternatives
```

### Step 2: Install Critical Components

```bash
# Install all CRITICAL priority components immediately
npx shadcn@latest add table
npx shadcn@latest add form
```

**Why CRITICAL?**
- ≥85% confidence
- Core to SD requirements
- Semantic match with SD description
- Likely required for implementation

### Step 3: Evaluate Recommended Components

For RECOMMENDED priority (70-85% confidence):

1. **Read the reasoning**: Does it align with your implementation plan?
2. **Check warnings**: Are there bundle size concerns?
3. **Review alternatives**: Would a lighter option work?
4. **Install if applicable**: Strong match but verify fit

```bash
# Example: Install if needed
npx shadcn@latest add dialog
```

### Step 4: Consider Optional Components

For OPTIONAL priority (60-70% confidence):

- Lower confidence match
- May be useful but not critical
- Review carefully before installing
- Consider alternatives

---

## Handling Warnings

### Bundle Size Warnings

**Warning**: `"Large bundle size: ~45KB. Consider performance impact."`

**Actions**:
1. **Check alternatives**: Often includes lighter options
2. **Evaluate necessity**: Is the full component needed?
3. **Code splitting**: Lazy load if possible
4. **Monitor bundle**: Track impact on build size

### Dependency Warnings

**Warning**: `"Requires 5 dependencies. Review installation requirements."`

**Actions**:
1. **Review dependencies**: Check package.json impact
2. **Check compatibility**: Verify no conflicts
3. **Consider alternatives**: Lighter components may have fewer deps
4. **Document**: Note dependencies in EXEC handoff

---

## Using Alternatives

Each recommendation may include alternatives:

```json
"alternatives": [
  {
    "component": "Simple list with Card components",
    "tradeoff": "Lighter but no built-in sorting/filtering"
  },
  {
    "component": "Custom table with native HTML",
    "tradeoff": "Full control but requires manual feature implementation"
  }
]
```

**When to use alternatives**:
1. **Bundle size concerns**: Choose lighter option
2. **Simpler requirements**: Full component may be overkill
3. **Custom needs**: Native HTML gives more control
4. **Performance critical**: Minimize dependencies

---

## Installation Script Generation

PLAN generates an installation script for CRITICAL + RECOMMENDED components:

```bash
#!/bin/bash
# Component Installation Script
# Generated by Shadcn Semantic Selector

echo "Installing UI components..."

# table (CRITICAL)
# Confidence: 87%
# HIGH confidence (87%) - critical installation priority. Primary use case: Display structured data...
npx shadcn@latest add table

# form (CRITICAL)
# Confidence: 85%
# HIGH confidence (85%) - critical installation priority. Primary use case: Collect user input...
npx shadcn@latest add form

echo "Installation complete!"
```

**Usage**:
1. Copy script from PRD output
2. Review components listed
3. Run script or install individually
4. Document installed components in EXEC handoff

---

## Troubleshooting

### No Recommendations Found

**Possible causes**:
1. SD description too vague
2. No components match requirements
3. Confidence threshold too high
4. Component registry not seeded

**Actions**:
1. Request PLAN to refine SD description
2. Manually select components from shadcn/ui docs
3. Lower similarity threshold (requires PLAN update)

### Irrelevant Recommendations

**Possible causes**:
1. SD description includes unrelated keywords
2. Semantic search false positive
3. Component metadata needs refinement

**Actions**:
1. Ignore low-confidence recommendations (<70%)
2. Review alternatives for better matches
3. Manually select appropriate components
4. Report issue to improve future recommendations

### Missing Components

**Possible causes**:
1. Component not in registry yet
2. Specialized component not in standard sets
3. Custom component needed

**Actions**:
1. Check shadcn/ui docs for additional components
2. Search third-party registries (AI Elements, Kibo UI, etc.)
3. Build custom component if needed

---

## Best Practices

### 1. Install Components Early

- Install CRITICAL components before starting implementation
- Prevents rework if component APIs differ from assumptions
- Allows early testing of component behavior

### 2. Trust the Confidence Scores

- **≥85%**: Strong match, install with confidence
- **70-85%**: Good match, verify fit
- **<70%**: Evaluate carefully before using

### 3. Read the Explanations

- Understand **why** each component was recommended
- Check if reasoning aligns with your implementation plan
- Use explanations to justify component choices in handoffs

### 4. Monitor Bundle Size

- Track cumulative bundle impact
- Use alternatives for non-critical features
- Lazy load large components when possible

### 5. Document Decisions

In your EXEC handoff, document:
- Which recommended components you installed
- Which you skipped and why
- Alternative components chosen
- Any custom implementations

**Example**:
```markdown
## Component Decisions

- ✅ Installed `table` (CRITICAL, 87%): Core requirement for user management
- ✅ Installed `form` (CRITICAL, 85%): Required for user input
- ⏭️  Skipped `dialog` (RECOMMENDED, 72%): Used Sheet instead for better mobile UX
- 🔧 Custom calendar component: Standard calendar didn't support range selection with blackout dates
```

---

## Integration with Existing Workflow

### PLAN Phase

1. ✅ PLAN creates PRD
2. ✅ Semantic selector generates recommendations
3. ✅ PRD includes `ui_components` field
4. ✅ Installation script generated

### EXEC Phase (You)

1. ✅ Read PRD `ui_components` field
2. ✅ Review confidence scores and explanations
3. ✅ Install CRITICAL components
4. ✅ Evaluate RECOMMENDED components
5. ✅ Document component decisions
6. ✅ Implement features using components

### Handoff to Testing

- List all installed components
- Note any deviations from recommendations
- Document custom component implementations
- Include bundle size impact if relevant

---

## Example: Complete Workflow

### 1. Receive PRD

```json
{
  "directive_id": "SD-USER-MGMT-001",
  "ui_components": [
    {
      "name": "table",
      "priority": "CRITICAL",
      "confidence": 87,
      "install_command": "npx shadcn@latest add table"
    },
    {
      "name": "form",
      "priority": "CRITICAL",
      "confidence": 85,
      "install_command": "npx shadcn@latest add form"
    },
    {
      "name": "dialog",
      "priority": "RECOMMENDED",
      "confidence": 72,
      "install_command": "npx shadcn@latest add dialog"
    }
  ]
}
```

### 2. Install Components

```bash
# Install CRITICAL components
npx shadcn@latest add table
npx shadcn@latest add form

# Evaluate RECOMMENDED: dialog (72% confidence)
# Decision: Install, needed for user detail modal
npx shadcn@latest add dialog
```

### 3. Implement Features

```tsx
// Use installed components
import { DataTable } from "@/components/ui/data-table"
import { Form } from "@/components/ui/form"
import { Dialog } from "@/components/ui/dialog"

export function UserManagement() {
  return (
    <>
      <DataTable columns={columns} data={users} />
      <Dialog>
        <Form>...</Form>
      </Dialog>
    </>
  )
}
```

### 4. Document in Handoff

```markdown
## Component Decisions

- ✅ table (CRITICAL, 87%): Installed for user list display
- ✅ form (CRITICAL, 85%): Installed for user creation/editing
- ✅ dialog (RECOMMENDED, 72%): Installed for user detail modal

Total bundle impact: ~77KB (table: 45KB, form: 20KB, dialog: 12KB)
```

---

## FAQ

### Q: Can I ignore recommendations?

**A**: Yes. Recommendations are suggestions based on semantic analysis. You have final say on component choices. Document your decisions in the EXEC handoff.

### Q: What if a recommended component doesn't fit?

**A**:
1. Check alternatives in the recommendation
2. Search shadcn/ui docs for better matches
3. Build custom component if needed
4. Document decision in handoff

### Q: How do I request better recommendations?

**A**:
1. Ask PLAN to refine SD description with more specific UI requirements
2. Include keywords like "table", "form", "modal" in SD scope
3. Report patterns to improve component registry

### Q: What if no recommendations are generated?

**A**:
1. SD may not have UI requirements (backend-only)
2. Component registry not yet seeded
3. Manually select components from shadcn/ui

---

## Reference Links

- **Shadcn/ui Docs**: https://ui.shadcn.com
- **AI Elements**: https://sdk.vercel.ai/docs/ai-sdk-ui
- **OpenAI Voice**: https://platform.openai.com/docs/guides/speech-to-text
- **Kibo UI**: https://kibo-ui.com
- **Blocks.so**: https://blocks.so
- **ReUI**: https://reui.io

---

## Support

**Issues with recommendations?**
- Review this guide
- Check confidence scores and explanations
- Document unexpected behavior
- Suggest improvements to component registry

**Questions?**
- Ask PLAN to clarify SD requirements
- Consult shadcn/ui documentation
- Use LEO Protocol sub-agents for technical questions
