---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Design Sub-Agent Application Expertise Enhancement



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [What Changed](#what-changed)
  - [1. Database Schema (New)](#1-database-schema-new)
  - [2. Design Agent Persona Enhancement](#2-design-agent-persona-enhancement)
  - [3. Context Builder Script (New)](#3-context-builder-script-new)
  - [4. Slash Command Update](#4-slash-command-update)
  - [5. Database Record Update](#5-database-record-update)
- [Decision Framework](#decision-framework)
  - [Step 1: Analyze Context](#step-1-analyze-context)
  - [Step 2: Evaluate Placement](#step-2-evaluate-placement)
  - [Step 3: Component Reuse](#step-3-component-reuse)
  - [Step 4: Workflow Integration](#step-4-workflow-integration)
  - [Step 5: Document Decision](#step-5-document-decision)
- [Example Output](#example-output)
- [Seeded Data](#seeded-data)
  - [Feature Areas (10)](#feature-areas-10)
  - [Page Routes (8)](#page-routes-8)
  - [Component Patterns (4)](#component-patterns-4)
  - [User Workflows (3)](#user-workflows-3)
- [Pre-Implementation Questions](#pre-implementation-questions)
- [Success Metrics](#success-metrics)
- [Files Modified](#files-modified)
- [Testing](#testing)
- [Next Steps](#next-steps)
- [Usage in LEO Protocol](#usage-in-leo-protocol)
- [Benefits](#benefits)

## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, migration, schema

**Version**: 4.2.0
**Date**: 2025-10-03
**Status**: ✅ Complete

## Overview

Enhanced the Design sub-agent with deep knowledge of EHG application architecture to intelligently recommend optimal UI placement for new features, promote component reuse, and integrate with existing workflows.

## What Changed

### 1. Database Schema (New)

Created 5 new tables to track application architecture:

```sql
ehg_feature_areas        -- 10 major feature domains (Chairman, Ventures, Analytics, etc.)
ehg_page_routes          -- 40+ existing page routes and their purposes
ehg_component_patterns   -- Reusable UI patterns (Dashboard Card, Data Table, etc.)
ehg_user_workflows       -- Documented user journeys (Venture Create, Report Build, etc.)
ehg_design_decisions     -- Historical design decisions for learning
```

**Migration**: `database/migrations/create-ehg-application-architecture-tables.sql`

### 2. Design Agent Persona Enhancement

Updated `lib/agents/personas/sub-agents/design-agent.json`:

**New Section**: `application_expertise`
- 5-step decision framework for UI placement
- Pre-implementation questions
- Database table references
- Component reuse preference order: Reuse > Extend > Create New

**Version**: 4.1.0 → 4.2.0

### 3. Context Builder Script (New)

Created `scripts/design-subagent-context-builder.js`:

**Capabilities**:
- Query application architecture for similar features
- Generate intelligent UI placement recommendations
- Identify reusable component patterns
- Map to existing user workflows
- Record design decisions for future reference

**Usage**:
```bash
# Search for similar features
node scripts/design-subagent-context-builder.js search "venture"

# Build context with recommendations
node scripts/design-subagent-context-builder.js context "New feature description" [AREA_CODE] [keywords]
```

### 4. Slash Command Update

Enhanced `.claude/commands/leo-design.md`:

**New Checklist**: Application Context Checklist (REQUIRED FIRST)
- Similar features identified
- UI placement evaluated
- Component reuse assessed
- Workflow integration planned
- Design decision documented

**New Section**: UI Placement Decision Framework
- 5-step evaluation process
- Placement options table (extend page, new page, modal, etc.)
- Pre-implementation questions

### 5. Database Record Update

Updated `leo_sub_agents` table for DESIGN sub-agent:
- Version: 4.2.0
- Application expertise: Enabled
- 4 new capabilities added
- Context builder script reference

## Decision Framework

### Step 1: Analyze Context
**Question**: What is this feature trying to accomplish?
- Query `ehg_feature_areas` for related domains
- Search `ehg_page_routes` for similar pages
- Check `ehg_user_workflows` for existing journeys

### Step 2: Evaluate Placement
**Question**: Where should this UI live?

| Option | When to Use |
|--------|-------------|
| Extend existing page | Feature complements current functionality |
| New page in existing area | Distinct but part of existing domain |
| New top-level navigation | Entirely new domain with multiple pages |
| Modal/dialog | Supporting action in existing flow |

### Step 3: Component Reuse
**Question**: Can we reuse existing components?
- Query `ehg_component_patterns` for matching patterns
- **Rule**: If existing pattern fits 80%+ of requirements → REUSE
- **Preference**: Reuse > Extend > Create New

### Step 4: Workflow Integration
**Question**: How does this fit into user workflows?
- Query `ehg_user_workflows` for related journeys
- Identify natural entry/exit points

### Step 5: Document Decision
**Question**: Why did we choose this approach?
- Insert into `ehg_design_decisions` table
- Document alternatives considered

## Example Output

```bash
$ node scripts/design-subagent-context-builder.js context "New venture analytics dashboard" ANALYTICS "dashboard"

📋 Recommendations:
{
  "placement_options": [
    {
      "type": "feature_area_match",
      "area": "ANALYTICS",
      "navigation_path": "/analytics",
      "rationale": "Feature maps to existing Analytics & Insights domain"
    },
    {
      "type": "extend_existing_page",
      "pages": [
        {
          "route": "/analytics",
          "name": "AnalyticsDashboard",
          "purpose": "Business intelligence dashboard with charts and insights"
        }
      ],
      "rationale": "1 existing page in this area could be extended"
    }
  ],
  "component_reuse": [
    {
      "pattern": "Dashboard Card",
      "path": "src/components/ui/card.tsx",
      "examples": ["src/pages/ChairmanDashboard.tsx", "src/pages/AnalyticsDashboard.tsx"]
    }
  ],
  "workflow_integration": [
    {
      "workflow": "Build Custom Report",
      "code": "REPORT_BUILD",
      "suggestion": "Consider integrating with 'Build Custom Report' workflow"
    }
  ]
}
```

## Seeded Data

### Feature Areas (10)
- CHAIRMAN - Chairman Dashboard
- VENTURES - Venture Management
- ANALYTICS - Analytics & Insights
- EVA - EVA Assistant
- AGENTS - AI Agents
- GOVERNANCE - Governance & Compliance
- AUTOMATION - Automation Engine
- GTM - Go-to-Market Intelligence
- REPORTS - Report Builder
- SETTINGS - Settings & Configuration

### Page Routes (8)
- /chairman - ChairmanDashboard
- /chairman/settings - ChairmanSettingsPage
- /ventures - VenturesPage
- /ventures/:id - VentureDetailEnhanced
- /analytics - AnalyticsDashboard
- /reports/builder - ReportBuilderPage
- /automation - AutomationDashboardPage
- /eva - EVAAssistantPage

### Component Patterns (4)
- Dashboard Card (layout)
- Data Table (data-display)
- Modal Dialog (navigation)
- Tab Navigation (navigation)

### User Workflows (3)
- VENTURE_CREATE - Create New Venture
- CHAIRMAN_REVIEW - Review Executive Dashboard
- REPORT_BUILD - Build Custom Report

## Pre-Implementation Questions

The Design sub-agent will now ask:
1. "Is there a similar feature in [FEATURE_AREA]?"
2. "Can this extend the existing [PAGE_NAME] instead of creating new page?"
3. "Does this fit into the [WORKFLOW_NAME] user workflow?"
4. "Are there existing [PATTERN_NAME] components we can reuse?"
5. "Would users expect to find this in [NAVIGATION_PATH]?"
6. "Is this better as a tab, modal, or separate page?"

## Success Metrics

✅ Design sub-agent can answer: "Where should this UI go?"
✅ Evaluates existing workflows before proposing new pages
✅ Recommends component reuse over new creation
✅ Flags when features fit into existing domains
✅ Prevents duplicate UI for similar features
✅ Documents all design decisions for future reference

## Files Modified

1. ✅ `database/migrations/create-ehg-application-architecture-tables.sql` (NEW)
2. ✅ `scripts/seed-ehg-application-architecture.js` (NEW)
3. ✅ `scripts/design-subagent-context-builder.js` (NEW)
4. ✅ `lib/agents/personas/sub-agents/design-agent.json` (UPDATED - v4.2.0)
5. ✅ `.claude/commands/leo-design.md` (UPDATED)
6. ✅ Database: `leo_sub_agents` table (UPDATED - DESIGN record)

## Testing

```bash
# Test 1: Search for similar features
node scripts/design-subagent-context-builder.js search "venture"
# Result: ✅ Found 3 similar features

# Test 2: Build context with recommendations
node scripts/design-subagent-context-builder.js context "New venture analytics dashboard" ANALYTICS "dashboard"
# Result: ✅ Generated placement recommendations, component reuse suggestions, workflow integration

# Test 3: Verify database tables
psql -c "SELECT tablename FROM pg_tables WHERE tablename LIKE 'ehg_%'"
# Result: ✅ All 5 tables created
```

## Next Steps

1. **Expand Seeded Data**: Add more page routes as application grows
2. **Historical Analysis**: Populate `ehg_design_decisions` with past decisions
3. **Pattern Recognition**: Build ML model to suggest patterns based on feature descriptions
4. **Workflow Mapping**: Document all user workflows in the application
5. **Integration**: Auto-trigger context builder during PLAN phase PRD creation

## Usage in LEO Protocol

When a Strategic Directive enters PLAN phase with UI/UX requirements:

1. **Automatic Trigger**: Design sub-agent activates
2. **Context Query**: Runs `design-subagent-context-builder.js`
3. **Analysis**: Evaluates placement options, component reuse, workflow integration
4. **Recommendations**: Presents options to PLAN agent
5. **Decision**: PLAN agent selects approach with Design sub-agent guidance
6. **Documentation**: Decision recorded in `ehg_design_decisions`
7. **Handoff**: Complete UI/UX specs with placement rationale to EXEC

## Benefits

- **Consistency**: Ensures similar features use similar UI patterns
- **Efficiency**: Promotes component reuse over duplication
- **User Experience**: Integrates new features into existing workflows naturally
- **Knowledge Retention**: Documents design decisions for future reference
- **Onboarding**: New team members can query past decisions for guidance
- **Scalability**: As application grows, knowledge base grows with it

---

**Implementation Date**: 2025-10-03
**Author**: Claude Code
**LEO Protocol Version**: v4.2.0
