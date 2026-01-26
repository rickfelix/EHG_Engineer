# BLOCKING ISSUE: SD-VIDEO-VARIANT-001 LEAD→PLAN Handoff


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, e2e

**Date**: 2025-10-10  
**Severity**: BLOCKING  
**Phase**: LEAD → PLAN Transition  

---

## Problem Summary

Cannot create LEAD→PLAN handoff for SD-VIDEO-VARIANT-001 due to:
1. Database trigger error blocking SD field updates
2. Handoff verifier requires populated fields (empty arrays = validation failure)

---

## Root Cause

### Issue 1: Database Trigger Error
```
❌ Error: record "new" has no field "progress_percentage"
```

**Cause**: LEO Protocol Enhancement #7 created trigger `auto_calculate_progress_trigger` that references `progress_percentage` column, but this column was never added to `strategic_directives_v2` table.

**Impact**: ANY update to strategic_directives_v2 table fails with this error.

### Issue 2: Empty Arrays Fail Validation
Current SD field values:
```javascript
strategic_objectives: []
key_principles: []
risks: []
success_criteria: []
```

**Handoff Verifier Logic** (verify-handoff-lead-to-plan.js:190-197):
```javascript
if (!sd[field] || !sd[field].toString().trim()) {
  validation.errors.push(`Missing required field: ${field}`);
}
```

**Result**:
- `[].toString()` = `""`
- `"".trim()` = `""`
- `!""` = `true`
- Validation fails: "Missing required field: strategic_objectives"

**Minimum Requirements**:
- strategic_objectives: 2+ items OR 100+ character string
- success_criteria: 3+ items
- key_principles: Non-empty
- risks: Non-empty

---

## Required Manual Fix

### Option A: Add Missing Column (Recommended)

Execute in **Supabase Dashboard → SQL Editor**:

```sql
-- Add the missing progress_percentage column
ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS progress_percentage INTEGER
  CHECK (progress_percentage >= 0 AND progress_percentage <= 100);

-- Set default value for existing rows
UPDATE strategic_directives_v2
  SET progress_percentage = 0
  WHERE progress_percentage IS NULL;
```

**Then** run this script to populate SD fields:
```bash
node scripts/populate-sd-video-variant-fields.cjs
```

### Option B: Disable Trigger Temporarily

Execute in **Supabase Dashboard → SQL Editor**:

```sql
-- Disable the problematic trigger
ALTER TABLE strategic_directives_v2 
  DISABLE TRIGGER auto_calculate_progress_trigger;
```

**Then** run populate script, **then re-enable**:
```sql
ALTER TABLE strategic_directives_v2 
  ENABLE TRIGGER auto_calculate_progress_trigger;
```

### Option C: Manual Field Population

Execute in **Supabase Dashboard → Table Editor**:

Navigate to: strategic_directives_v2 → SD-VIDEO-VARIANT-001 → Edit

**Populate strategic_objectives** (JSON array):
```json
[
  "Automate video variant testing and optimization for venture content teams",
  "Enable data-driven video performance optimization with statistical confidence (>70%)",
  "Support 21 predefined use cases with templated prompt generation workflows",
  "Reduce video testing friction through manual workflow automation (until API available)"
]
```

**Populate key_principles** (JSON array):
```json
[
  "Component sizing discipline: All components <600 LOC with mandatory extraction if exceeded",
  "Testing-first approach: 80%+ test coverage required for all business logic",
  "Database-first architecture: All state in Supabase tables, zero markdown files",
  "Manual workflow resilience: Support non-API workflow until Sora 2 API becomes available",
  "Extend existing infrastructure: Reuse VideoPromptStudio, video_prompts table, Edge Functions (60% code reuse)"
]
```

**Populate risks** (JSON array):
```json
[
  {
    "risk": "Sora 2 API not accessible (404 Not Found)",
    "severity": "HIGH",
    "status": "CONFIRMED (Phase 0)",
    "mitigation": "Proceed with manual workflow scope ($1,004/test budget). Defer API integration 6 months."
  },
  {
    "risk": "Complex UI architecture (9 components with integration complexity)",
    "severity": "MEDIUM",
    "mitigation": "Enforce <600 LOC component sizing. Systems Analyst confirmed 60% code reuse possible."
  },
  {
    "risk": "Database circular foreign key (variant_groups.winner_variant_id → video_variants.id)",
    "severity": "MEDIUM",
    "mitigation": "Two-phase migration: Create tables first, add circular FK second. Database Architect approved."
  },
  {
    "risk": "Scope creep from Round 2 iteration engine (+230 LOC)",
    "severity": "LOW",
    "mitigation": "Clarified mutation strategies (hill climbing, genetic algorithms). Explicitly in scope per SD."
  },
  {
    "risk": "Manual workflow cost vs automated ($1,004 vs $120 per test)",
    "severity": "MEDIUM",
    "mitigation": "Phase 0 decision: Accept manual workflow cost until API available. Document TODO for future API integration."
  }
]
```

**Populate success_criteria** (JSON array):
```json
[
  "Venture teams can generate 12-20 video variants in <10 minutes via manual workflow",
  "Performance data tracked across 5 platforms (Instagram, TikTok, YouTube, LinkedIn, X) with complete metrics",
  "Winner identification with >70% statistical confidence using hypothesis testing",
  "Component sizing maintained at <600 LOC per component (enforced in code review)",
  "80%+ test coverage achieved for all business logic (unit + E2E tests)",
  "4 database tables created with proper foreign keys and RLS policies",
  "Round 2 iteration engine supports mutation strategies (hill climbing + genetic algorithms)",
  "Week 4 checkpoint completed with LEAD review of MVP progress"
]
```

---

## Verification After Fix

Run handoff verification:
```bash
node scripts/unified-handoff-system.js execute LEAD-to-PLAN SD-VIDEO-VARIANT-001
```

**Expected Result**: ✅ HANDOFF APPROVED (85%+ completeness score)

---

## Context

**Phase 0 Results**: /mnt/c/_EHG/phase-0-results.json
- Sora 2 API test: FAIL (404 Not Found)
- Decision: Manual workflow scope ($1,004/test)

**Sub-Agent Assessments**:
- Systems Analyst: APPROVE (60% code reuse, no duplicates)
- Database Architect: APPROVE (4-table schema, 95% confidence)
- Design Sub-Agent: APPROVE (9 components, <600 LOC sizing, 90% confidence)

**Clarifications**:
- API access verification: /mnt/c/_EHG/EHG_Engineer/temp-api-access-and-clarifications.md
- Backlog exception: /mnt/c/_EHG/EHG_Engineer/temp-backlog-exception-sd-video-variant-001.md
- Issues resolved: /mnt/c/_EHG/EHG_Engineer/temp-subagent-issues-to-fix.md

---

## Next Steps After Fix

1. ✅ Verify SD completeness (85%+ score)
2. ✅ Execute LEAD→PLAN handoff
3. → Proceed to PLAN Phase (PRD creation)

---

**Status**: AWAITING MANUAL DATABASE FIX
**Priority**: BLOCKING - Cannot proceed to PLAN phase without this fix
