---
category: feature
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [feature, auto-generated]
---
# Stage 20 Compliance Gate



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Purpose](#purpose)
- [Architecture](#architecture)
  - [Components](#components)
  - [Database Tables](#database-tables)
  - [Database Functions](#database-functions)
- [How It Works](#how-it-works)
  - [1. Checklist Assignment](#1-checklist-assignment)
  - [2. Item Types](#2-item-types)
  - [3. Evidence Tracking](#3-evidence-tracking)
  - [4. Gate Evaluation](#4-gate-evaluation)
  - [5. Stage Transition Enforcement](#5-stage-transition-enforcement)
- [User Interface](#user-interface)
  - [Compliance Gate Tab](#compliance-gate-tab)
  - [Checklist UI](#checklist-ui)
  - [Example](#example)
- [Workflow](#workflow)
  - [For Venture Teams](#for-venture-teams)
  - [For Chairman/CEO Agent](#for-chairmanceo-agent)
- [Configuration](#configuration)
  - [Adding/Modifying Checklists](#addingmodifying-checklists)
  - [Archetype Mapping](#archetype-mapping)
- [Testing](#testing)
  - [E2E Tests](#e2e-tests)
  - [Manual Testing](#manual-testing)
- [Metrics](#metrics)
- [Related Documentation](#related-documentation)
- [Change History](#change-history)

## Metadata
- **Category**: Feature
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-19
- **Tags**: database, testing, e2e, unit

**SD-LIFECYCLE-GAP-002: Security & Compliance Certification Gate**

## Overview

The Stage 20 Compliance Gate is a hard gate that blocks venture progression from Stage 20 (Security & Performance) to Stage 21 (Pricing Strategy) until all required compliance and security certification items are complete.

This ensures ventures have an enterprise-ready security posture before scaling to larger customers.

## Purpose

Ventures often reach scaling phase without proper security certifications (SOC2, GDPR, HIPAA), which blocks enterprise sales opportunities. This gate enforces compliance readiness before advancing to pricing and GTM stages.

## Architecture

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Database Schema** | `database/migrations/20260118_stage20_compliance_gate.sql` | 6 tables, functions, RLS policies |
| **ComplianceChecklist** | `ehg/src/components/stages/compliance/ComplianceChecklist.tsx` | Main UI component with categories and items |
| **ComplianceGateStatus** | `ehg/src/components/stages/compliance/ComplianceGateStatus.tsx` | Gate summary (PASS/BLOCKED) |
| **useComplianceChecklist** | `ehg/src/hooks/useComplianceChecklist.ts` | React hook for data management |
| **Stage 20 Integration** | `ehg/src/components/stages/v2/Stage20SecurityPerformance.tsx` | 3-tab layout with Compliance Gate tab |

### Database Tables

| Table | Purpose |
|-------|---------|
| `stage20_compliance_checklists` | Template definitions per archetype |
| `stage20_checklist_items` | Individual compliance items (REQUIRED/RECOMMENDED) |
| `stage20_venture_compliance` | Venture progress tracking |
| `stage20_compliance_evidence` | Evidence attachments (document, link, screenshot) |
| `stage20_compliance_history` | Audit trail of status changes |
| `stage20_compliance_gate_log` | Gate passage logging |

### Database Functions

| Function | Purpose |
|----------|---------|
| `evaluate_stage20_compliance_gate(venture_id, user_id)` | Evaluates gate status (PASS/FAIL) |
| `record_compliance_gate_passed(venture_id, user_id)` | Records successful gate passage |
| `fn_advance_venture_stage()` | Updated to enforce gate at Stage 20→21 |

## How It Works

### 1. Checklist Assignment

When a venture reaches Stage 20, a compliance checklist is automatically assigned based on the venture's **archetype**:

| Archetype | Items | Focus |
|-----------|-------|-------|
| **B2B_ENTERPRISE** | 15 items | SOC2, SSO, Data Residency, GDPR, Legal Review |
| **B2B_SMB** | 12 items | Basic SOC2, HTTPS, Data Encryption, Privacy Policy |
| **B2C** | 12 items | COPPA, Data Privacy, CCPA, Cookie Consent |

### 2. Item Types

Each checklist item has a **requirement level**:

- **REQUIRED**: Must be completed to pass the gate (blocks Stage 21)
- **RECOMMENDED**: Best practice, tracked but doesn't block

### 3. Evidence Tracking

Items can have evidence attachments:

| Evidence Type | Example |
|---------------|---------|
| `document` | SOC2 audit report (PDF) |
| `link` | Privacy policy URL |
| `screenshot` | SSO configuration screenshot |

### 4. Gate Evaluation

The gate evaluates compliance in real-time:

**PASS Criteria:**
- All REQUIRED items are marked COMPLETE
- Evidence provided for items requiring evidence

**FAIL (BLOCKED):**
- Any REQUIRED item is NOT_STARTED or IN_PROGRESS
- Missing evidence for items requiring evidence

### 5. Stage Transition Enforcement

When attempting to advance from Stage 20 to Stage 21:

```sql
-- fn_advance_venture_stage() calls:
v_gate_result := evaluate_stage20_compliance_gate(p_venture_id, v_user_id);

IF (v_gate_result->>'outcome') = 'FAIL' THEN
  -- BLOCK transition, return detailed error
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Compliance gate blocked: X required item(s) incomplete',
    'missing_required_items', v_gate_result->'missing_required_items'
  );
END IF;
```

## User Interface

### Compliance Gate Tab

The Stage 20 page has a 3-tab layout:

1. **Compliance Gate** (new)
2. Security Checks
3. Performance

### Checklist UI

The compliance checklist displays:

- **Categories**: Collapsible sections (e.g., "Security Certifications", "Data Privacy")
- **Items**: Checkboxes with status indicators
- **Badges**: REQUIRED vs RECOMMENDED, Evidence Required
- **Evidence Dialog**: Attach documents, links, screenshots
- **Gate Status Card**: Real-time PASS/BLOCKED summary

### Example

```
┌─────────────────────────────────────────────┐
│ Stage 20 Compliance Gate          [BLOCKED] │
├─────────────────────────────────────────────┤
│ Required Items: 7/10 (70%)                  │
│ Recommended Items: 3/5 (60%)                │
│                                             │
│ ⚠️ Complete all required items before       │
│    advancing to Stage 21                    │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Security Certifications (2/3)               │
├─────────────────────────────────────────────┤
│ ☑️ SOC2 Type 2 Audit         [REQUIRED]     │
│ ☑️ ISO 27001 Certification    [RECOMMENDED] │
│ ☐ PCI DSS Compliance         [REQUIRED]     │
│     ⚠️ Evidence Required                    │
└─────────────────────────────────────────────┘
```

## Workflow

### For Venture Teams

1. Navigate to **Stage 20: Security & Performance**
2. Click **Compliance Gate** tab
3. Review checklist items (archetype-specific)
4. Complete each REQUIRED item:
   - Check the box when complete
   - Attach evidence if required (document/link/screenshot)
   - Add notes (optional)
5. Monitor gate status card (updates in real-time)
6. When all REQUIRED items are complete, gate shows **PASS**
7. Advance to Stage 21 (no longer blocked)

### For Chairman/CEO Agent

The gate status is visible in:
- Stage 20 overview card (shows PASS/BLOCKED badge)
- Venture detail pages
- Advancement validation (CEO agent cannot advance if gate fails)

## Configuration

### Adding/Modifying Checklists

Checklists are defined in the database:

```sql
-- Add new checklist for archetype
INSERT INTO stage20_compliance_checklists (archetype, version, created_by)
VALUES ('NEW_ARCHETYPE', '1.0', auth.uid());

-- Add items to checklist
INSERT INTO stage20_checklist_items (
  checklist_id, category, title, description,
  requirement_level, evidence_required
) VALUES (
  '<checklist-id>', 'Security Certifications',
  'SOC2 Type 2 Audit', 'Complete independent SOC2 audit',
  'REQUIRED', true
);
```

### Archetype Mapping

Ventures are assigned archetypes based on their **target market**:

| Target Market | Archetype |
|---------------|-----------|
| Enterprise customers (Fortune 500) | B2B_ENTERPRISE |
| Small/Medium businesses | B2B_SMB |
| Individual consumers | B2C |

## Testing

### E2E Tests

Location: `ehg/tests/e2e/stage20-compliance-gate.spec.ts`

Test suites:
- Gate Status Display (PASS/BLOCKED)
- Checklist Items (categories, badges, status)
- Evidence Attachments
- Status Updates
- Tab Navigation

Run tests:
```bash
cd ehg
npx playwright test tests/e2e/stage20-compliance-gate.spec.ts
```

### Manual Testing

1. Create test venture in Stage 20
2. Verify compliance checklist assigned
3. Complete some REQUIRED items → Gate should show BLOCKED
4. Complete all REQUIRED items → Gate should show PASS
5. Attempt to advance to Stage 21 → Should succeed

## Metrics

The system tracks:

- **Gate passage rate**: % of ventures that pass on first attempt
- **Time to compliance**: Days from Stage 20 entry to gate passage
- **Incomplete items**: Most commonly incomplete items
- **Evidence quality**: Items with vs without evidence

View metrics:
```sql
SELECT
  archetype,
  COUNT(*) FILTER (WHERE passed) AS passed_count,
  AVG(EXTRACT(EPOCH FROM passed_at - created_at) / 86400) AS avg_days_to_pass
FROM stage20_compliance_gate_log
GROUP BY archetype;
```

## Related Documentation

- **Parent Initiative**: [Venture Lifecycle Gap Remediation Overview](./venture-lifecycle-gap-remediation-overview.md)
- **Database Schema**: [stage20-compliance-schema.md](../database/stage20-compliance-schema.md)
- **RLS Policies**: [database-agent-patterns.md](../reference/database-agent-patterns.md)
- **Stage 20 Overview**: [stages/stage-20-security-performance.md](../guides/workflow/stages/stage-20-security-and-performance.md)

## Change History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-18 | 1.0 | Initial implementation (SD-LIFECYCLE-GAP-002) |

---

**Owner**: Chairman
**Maintainer**: Database Agent, Design Agent
**Last Updated**: 2026-01-18
