---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# UAT Campaign Guide



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Campaign Structure](#campaign-structure)
  - [Orchestrator SD](#orchestrator-sd)
  - [Child SDs (Test in Order)](#child-sds-test-in-order)
- [Running Each Area](#running-each-area)
  - [Step 1: Start UAT Session](#step-1-start-uat-session)
  - [Step 2: Execute Test Scenarios](#step-2-execute-test-scenarios)
  - [Step 3: Record Results](#step-3-record-results)
  - [Step 4: Review Quality Gate](#step-4-review-quality-gate)
  - [Step 5: Handle Defects](#step-5-handle-defects)
- [Area-Specific Test Focus](#area-specific-test-focus)
  - [SD-UAT-NAV-001: Core Navigation](#sd-uat-nav-001-core-navigation)
  - [SD-UAT-VENTURE-001: Ventures & 25-Stage](#sd-uat-venture-001-ventures-25-stage)
  - [SD-UAT-DASHBOARD-001: Dashboard](#sd-uat-dashboard-001-dashboard)
  - [SD-UAT-AI-001: AI/EVA](#sd-uat-ai-001-aieva)
  - [SD-UAT-PORTFOLIO-001: Portfolio](#sd-uat-portfolio-001-portfolio)
  - [SD-UAT-REPORTS-001: Reports](#sd-uat-reports-001-reports)
  - [SD-UAT-SETTINGS-001: Settings](#sd-uat-settings-001-settings)
  - [SD-UAT-GOVERNANCE-001: Governance](#sd-uat-governance-001-governance)
- [Session Management](#session-management)
  - [Starting a New Session](#starting-a-new-session)
  - [Pausing/Resuming](#pausingresuming)
  - [Tracking Progress](#tracking-progress)
- [Defect Routing](#defect-routing)
  - [High-Risk Patterns](#high-risk-patterns)
- [Quality Gates](#quality-gates)
- [Tips for Effective Testing](#tips-for-effective-testing)
- [After All Areas Complete](#after-all-areas-complete)
- [Commands Reference](#commands-reference)
- [Troubleshooting](#troubleshooting)
  - [Servers Not Running](#servers-not-running)
  - [Database Connection Issues](#database-connection-issues)
  - [/uat Command Not Working](#uat-command-not-working)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-18
- **Tags**: database, api, testing, schema

**Created**: 2026-01-18
**Campaign**: SD-UAT-CAMPAIGN-001

## Overview

This guide documents how to run the comprehensive UAT campaign for the EHG application. The campaign tests 8 functional areas with 18 user stories using the `/uat` command.

## Prerequisites

1. **LEO Stack Running**: Both frontend and backend servers must be running
2. **Database Access**: Connection to Supabase database
3. **Test User Account**: Valid credentials for the application

## Quick Start

```bash
# 1. Start the LEO stack
bash scripts/leo-stack.sh restart

# 2. Verify servers are running
bash scripts/leo-stack.sh status
# Expected: Engineer on 3000, App on 8080

# 3. Run UAT for the first area
/uat SD-UAT-NAV-001
```

## Campaign Structure

### Orchestrator SD

**SD-UAT-CAMPAIGN-001**: Comprehensive Application UAT Campaign

This is the parent orchestrator that tracks overall campaign progress.

### Child SDs (Test in Order)

| # | SD Key | Area | Stories | Est. Time |
|---|--------|------|---------|-----------|
| 1 | SD-UAT-NAV-001 | Core Navigation | 4 | 1-2 hours |
| 2 | SD-UAT-VENTURE-001 | Ventures & 25-Stage | 6 | 2-3 hours |
| 3 | SD-UAT-DASHBOARD-001 | Dashboard & Analytics | 2 | 1 hour |
| 4 | SD-UAT-AI-001 | AI/EVA Assistant | 2 | 1 hour |
| 5 | SD-UAT-PORTFOLIO-001 | Portfolio Management | 1 | 1 hour |
| 6 | SD-UAT-REPORTS-001 | Reports & Insights | 1 | 1 hour |
| 7 | SD-UAT-SETTINGS-001 | Settings & Admin | 1 | 1 hour |
| 8 | SD-UAT-GOVERNANCE-001 | Governance | 1 | 1 hour |

**Total Estimated Time**: 9-12 hours (spread across multiple sessions)

## Running Each Area

### Step 1: Start UAT Session

```bash
/uat SD-UAT-<AREA>-001
```

### Step 2: Execute Test Scenarios

The `/uat` command will:
1. Generate scenarios from user stories
2. Present each scenario in Given/When/Then format
3. Prompt you to record results (PASS/FAIL/BLOCKED/SKIP)

### Step 3: Record Results

For each scenario:
- **PASS**: Feature works as expected
- **FAIL**: Feature doesn't work (you'll be prompted for details)
- **BLOCKED**: Can't test due to dependency/prerequisite
- **SKIP**: Not applicable or defer for now

### Step 4: Review Quality Gate

After all scenarios, you'll see:
- **GREEN**: Ready to ship (0 failures, >=85% pass)
- **YELLOW**: Review needed (some failures, >=85% pass)
- **RED**: Must fix (<85% pass rate)

### Step 5: Handle Defects

For any FAIL results:
- `/quick-fix` - For small issues (<50 LOC)
- Create SD - For larger issues
- Document for later - Add to backlog

## Area-Specific Test Focus

### SD-UAT-NAV-001: Core Navigation

**Stories:**
1. Sidebar menu navigation - Click all menu items
2. Header user menu - Profile/settings/logout
3. Page routing - Back/forward, direct URL
4. Breadcrumb navigation - Location display

**What to Look For:**
- All menu items lead to valid pages
- No console errors on page transitions
- Consistent highlighting of current page
- Mobile responsive behavior (if applicable)

### SD-UAT-VENTURE-001: Ventures & 25-Stage

**Stories:**
1. Venture list display
2. Stages 1-5 (Ideation)
3. Stages 6-10 (Validation)
4. Stages 11-15 (Growth)
5. Stages 16-20 (Scale)
6. Stages 21-25 (Exit)

**What to Look For:**
- All 25 stages accessible
- Stage-specific content loads
- Stage transitions work
- No missing data or broken UI

### SD-UAT-DASHBOARD-001: Dashboard

**Stories:**
1. Dashboard load - Metrics display
2. Dashboard widgets - Interactivity

**What to Look For:**
- Page loads within 3 seconds
- Charts/graphs render
- Data appears accurate
- Widgets respond to interaction

### SD-UAT-AI-001: AI/EVA

**Stories:**
1. EVA chat interface
2. AI agent configuration

**What to Look For:**
- Chat loads and accepts input
- Responses arrive (or loading state shows)
- Agent list displays

### SD-UAT-PORTFOLIO-001: Portfolio

**Stories:**
1. Portfolio management

**What to Look For:**
- Portfolio list displays
- Details are accessible
- Ventures within portfolios show

### SD-UAT-REPORTS-001: Reports

**Stories:**
1. Reports functionality

**What to Look For:**
- Report types available
- Generation works
- Export functions

### SD-UAT-SETTINGS-001: Settings

**Stories:**
1. Settings functionality

**What to Look For:**
- Settings page loads
- Changes can be made
- Changes persist

### SD-UAT-GOVERNANCE-001: Governance

**Stories:**
1. Governance functionality

**What to Look For:**
- Policies display
- Compliance status shows
- Details accessible

## Session Management

### Starting a New Session

Each `/uat SD-XXX` call creates a new test run in the database.

### Pausing/Resuming

If you need to pause:
1. Complete the current scenario
2. Note which SD and scenario you stopped at
3. When resuming, run `/uat SD-XXX` again

### Tracking Progress

Check orchestrator progress:
```bash
npm run sd:status SD-UAT-CAMPAIGN-001
```

## Defect Routing

The `/uat` command automatically routes defects:

| Risk Level | Routing | Action |
|------------|---------|--------|
| LOW (<25 points) | `/quick-fix` | Fix immediately |
| MEDIUM (25-49) | Review | Consider quick-fix vs SD |
| HIGH (>=50) | Create SD | Requires full LEO workflow |

### High-Risk Patterns

These areas automatically get HIGH risk:
- Authentication/security
- Database/schema
- Payment/billing
- Infrastructure/API

## Quality Gates

| Gate | Criteria | Action |
|------|----------|--------|
| GREEN | 0 failures, >=85% pass | Ready to proceed |
| YELLOW | Has failures, >=85% pass | Review before next area |
| RED | <85% pass | Fix critical issues first |

## Tips for Effective Testing

1. **Test with fresh browser**: Clear cache before starting
2. **Check console**: Open DevTools to catch JS errors
3. **Try unexpected inputs**: Test empty fields, special characters
4. **Note performance**: Flag slow-loading pages
5. **Screenshot issues**: Use browser screenshot tools
6. **Be thorough but timely**: Don't rabbit-hole on minor issues

## After All Areas Complete

1. Review overall campaign status
2. Prioritize defects for fixing
3. Run `/quick-fix` for low-risk items
4. Create SDs for high-risk items
5. Document learnings with `/learn`

## Commands Reference

```bash
# Start LEO stack
bash scripts/leo-stack.sh restart

# Run UAT for specific area
/uat SD-UAT-NAV-001
/uat SD-UAT-VENTURE-001
# ... etc

# Check SD status
npm run sd:status SD-UAT-CAMPAIGN-001

# Quick-fix a defect
/quick-fix

# Capture learnings
/learn
```

## Troubleshooting

### Servers Not Running

```bash
bash scripts/leo-stack.sh restart
bash scripts/leo-stack.sh status
```

### Database Connection Issues

Check `.env` file has correct Supabase credentials.

### /uat Command Not Working

Ensure you're in the EHG_Engineer directory and Claude Code is active.

---

**Campaign Created**: 2026-01-18
**Documentation Version**: 1.0
