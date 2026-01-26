<!-- ARCHIVED: 2026-01-26T16:26:35.991Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-01\01_overview.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 1: Draft Idea — Operating Dossier


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, e2e, migration

**Generated**: 2025-11-05
**Version**: 1.0
**Protocol**: Stage Operating Dossier v1.0

---

## Venture Selection

**Active Venture Detected**:
- **ID**: `45a8fd77-96f7-4f83-9e28-385d3ef4c431`
- **Name**: E2E Direct Access Test 1762206208294
- **Status**: active
- **Current Workflow Stage**: 1
- **Created**: 2025-11-03T21:43:35.469572+00:00

**Selection Rule**: Highest `current_workflow_stage` among ventures WHERE `status = 'active'` ORDER BY `current_workflow_stage` DESC, `created_at` DESC LIMIT 1

---

## Executive Summary

**Stage ID**: 1
**Title**: Draft Idea
**Phase**: Ideation (Stages 1-10)
**Depends On**: None (entry point)
**Next Stage**: 2 (AI Review)

Stage 1 captures raw venture ideas through text input with AI assistance. Chairman provides feedback. This is the entry point to the 40-stage workflow.

**Maturity**: 🚧 Partially Implemented (~85% complete - see Implementation Gaps section below)
**Automation Level**: Manual → Assisted (from stages.yaml notes)
**Critical Path**: Yes (entry point blocks all downstream stages)
**Implementation Notes**: Core features complete in EHG app; substages 1.2-1.3 not implemented as documented

**Key Metrics**: Idea quality score, Validation completeness, Time to capture
**Primary Exit Gates**: Title validated (3-120 chars), Description validated (20-2000 chars), Category assigned

---

## Quick Reference

| Attribute | Value |
|-----------|-------|
| **ID** | 1 |
| **Dependencies** | None |
| **Substages** | 3 documented (1.1 Idea Brief ✅, 1.2 Assumptions ❌, 1.3 Success Criteria ❌) |
| **Inputs** | Text input ✅, Chairman feedback ✅ |
| **Outputs** | Structured idea document, Initial validation, Risk assessment |
| **Overall Score** | 3.4/5.0 (from critique) |
| **Recursion Support** | ❌ None |

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| stages.yaml | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1-42 | Canonical stage definition |
| critique | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-01.md | 1-71 | Assessment & rubric scores |
| ventures schema | EHG | 0d80dac | supabase/migrations/20250828094259_*.sql | N/A | Database table structure |
| active venture | EHG | 0d80dac | ventures table (query result) | N/A | Current active venture data |

---

## Regeneration Notes

**Commands Used** (read-only; no DB writes):

```bash
# 1. Detect current active venture stage
node scripts/detect-current-stage.mjs

# Output: Stage 1 (venture ID: 45a8fd77-96f7-4f83-9e28-385d3ef4c431)

# 2. Extract stage definition
head -n 42 docs/workflow/stages.yaml

# 3. Read critique assessment
cat docs/workflow/critique/stage-01.md

# 4. Scan for agent/crew references
ls /mnt/c/_EHG/EHG/agent-platform/app/agents/
ls /mnt/c/_EHG/EHG/agent-platform/app/crews/

# 5. Generate dossier files (this document and 10 others)
```

**Evidence Extraction**: All facts sourced from repo files with commit SHAs (EHG_Engineer@6ef8cf4, EHG@0d80dac).

**Reproducibility**: Run commands above at specified commits to verify all claims.

---

## Implementation Gaps

**What IS Implemented** (~85% complete):
- ✅ Core idea capture form (title, description, category) - `/mnt/c/_EHG/EHG/src/components/stages/Stage1DraftIdea.tsx`
- ✅ Comprehensive quality scoring algorithm (100-point scale) - `/mnt/c/_EHG/EHG/src/services/evaValidation.ts`
- ✅ Database schema with validation constraints - `ideas` and `ventures` tables
- ✅ Frontend validation logic (3-120 chars title, 20-2000 chars description)
- ✅ API endpoints for venture creation
- ✅ API-level character validation (completed)
- ✅ E2E test coverage

**What is NOT Implemented** (~15% missing):
- ❌ Substage 1.2 (Assumptions) fields in UI
- ❌ Substage 1.3 (Success Criteria) fields in UI

**Descoped Features**:
- 🔕 Voice recording for Stage 1 (component exists and is used in Chairman Feedback, but not required for Stage 1)

**Alternative Implementation**: Strategic Context fields implemented instead of Assumptions/Success Criteria (Vision Alignment slider, Strategic Focus selection, Performance Drive Phase).

**For detailed gap analysis**, see `09_implementation-gaps.md`.

---

**Next**: See `02_stage-map.md` for dependency graph and workflow position.
