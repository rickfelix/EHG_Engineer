# Triangulation Follow-Up: Proposed Action Plan for Audit-to-SD Pipeline Fix

## Context

We completed a triangulated root cause analysis across Claude Code, OpenAI ChatGPT, and Google Antigravity on the problem of **92% feedback loss** in our runtime audit-to-Strategic Directive pipeline (79 issues captured → only 6 became SDs).

### Consensus Root Causes (All 3 Models Agreed)

1. **No Triage Ledger**: Issues can silently disappear without explicit disposition
2. **ID Re-indexing**: NAV-xx → A-xx breaks traceability chain (ETL anti-pattern)
3. **Category Filtering**: UX/Ideas implicitly excluded by "bug-only" policy
4. **No Verbatim Preservation**: AI rewrites Chairman language into "clean" summaries
5. **No Architectural SD Type**: Strategic themes have no container in the schema

### Unique Insight (Antigravity)

The triangulation methodology itself may cause loss - AIs converge on "objective" bugs and discard "subjective" observations where consensus is harder to verify.

---

## Proposed Comprehensive Action Plan

I've organized this into 6 workstreams. Please review and provide feedback on:
- Completeness (what's missing?)
- Prioritization (should order change?)
- Feasibility (any blockers or dependencies?)
- Risks (what could go wrong?)

---

## Workstream 1: Database Schema Updates

### 1.1 Create Audit Finding Mapping Table

```sql
CREATE TABLE audit_finding_sd_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source tracking (immutable)
  audit_file_path TEXT NOT NULL,           -- e.g., 'docs/audits/2025-12-26-navigation-audit.md'
  original_issue_id VARCHAR(20) NOT NULL,  -- e.g., 'NAV-17' (NEVER changes)
  audit_date DATE NOT NULL,

  -- Chairman's exact words (immutable)
  verbatim_text TEXT NOT NULL,             -- Exact quote from audit
  issue_type VARCHAR(20) NOT NULL,         -- 'bug', 'ux', 'brainstorm', 'theme'
  severity VARCHAR(20),                    -- 'critical', 'major', 'minor', 'idea'
  route_path TEXT,                         -- e.g., '/analytics/profitability'

  -- Triage decision (mutable)
  disposition VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- 'pending', 'sd_created', 'deferred', 'wont_fix', 'duplicate', 'needs_discovery'
  disposition_reason TEXT,                 -- Why this decision was made
  disposition_by VARCHAR(100),             -- Who made the decision
  disposition_at TIMESTAMPTZ,

  -- SD linkage (if disposition = 'sd_created')
  linked_sd_id VARCHAR(50) REFERENCES strategic_directives_v2(id),
  linked_sd_ids TEXT[],                    -- For many-to-one mappings

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(audit_file_path, original_issue_id)
);

-- Index for coverage reporting
CREATE INDEX idx_audit_mapping_disposition ON audit_finding_sd_mapping(disposition);
CREATE INDEX idx_audit_mapping_file ON audit_finding_sd_mapping(audit_file_path);
```

### 1.2 Add New SD Types to Strategic Directives

Add to `strategic_directives_v2.category` enum:
- `architectural_review` - Cross-cutting themes requiring holistic analysis
- `strategic_observation` - Chairman insights about product direction
- `discovery_spike` - "First principles" investigations (time-boxed research)
- `ux_debt` - UX issues that aren't bugs but degrade experience
- `product_decision` - Decisions needed before implementation can proceed

### 1.3 Add Required Metadata Fields

Update SD creation to require these fields for audit-derived SDs:

```typescript
interface AuditDerivedSDMetadata {
  // Required for audit-derived SDs
  source_type: 'runtime_audit' | 'uat_test' | 'user_feedback';
  source_audit_file: string;           // Path to audit markdown
  original_issue_ids: string[];        // ['NAV-17', 'NAV-22'] - supports many-to-one
  chairman_verbatim_text: string;      // Exact quote(s)

  // Standard fields
  triangulation_consensus?: 'HIGH' | 'MEDIUM' | 'LOW';
  root_cause?: string;
  affected_files?: string[];
}
```

### 1.4 Create Coverage View

```sql
CREATE VIEW audit_coverage_report AS
SELECT
  audit_file_path,
  COUNT(*) as total_issues,
  COUNT(*) FILTER (WHERE disposition = 'pending') as pending,
  COUNT(*) FILTER (WHERE disposition = 'sd_created') as sd_created,
  COUNT(*) FILTER (WHERE disposition = 'deferred') as deferred,
  COUNT(*) FILTER (WHERE disposition = 'wont_fix') as wont_fix,
  COUNT(*) FILTER (WHERE disposition = 'needs_discovery') as needs_discovery,
  ROUND(100.0 * COUNT(*) FILTER (WHERE disposition != 'pending') / COUNT(*), 1) as coverage_pct
FROM audit_finding_sd_mapping
GROUP BY audit_file_path;
```

---

## Workstream 2: Ingestion Pipeline

### 2.1 Create Audit File Parser

**File**: `scripts/ingest-audit-file.ts`

**Functionality**:
- Parse markdown tables from `docs/audits/*.md`
- Extract: ID, Route, Type, Severity, Description (verbatim)
- Create one row per issue in `audit_finding_sd_mapping`
- Set all dispositions to 'pending'
- Preserve exact text - NO summarization

**Command**:
```bash
npm run audit:ingest -- --file docs/audits/2025-12-26-navigation-audit.md
```

### 2.2 Create Bulk Triage Interface

**File**: `scripts/audit-triage.ts`

**Functionality**:
- Interactive CLI to review pending items
- Allow bulk operations (e.g., "defer all Minor UX issues")
- Require disposition reason for each decision
- Track who made the decision

**Commands**:
```bash
npm run audit:triage                    # Interactive mode
npm run audit:triage --file <path>      # Triage specific audit
npm run audit:triage --pending          # Show all pending across audits
```

### 2.3 Create SD Generator from Triaged Items

**File**: `scripts/audit-to-sd.ts`

**Functionality**:
- Query `audit_finding_sd_mapping` for items with `disposition = 'sd_created'` but no `linked_sd_id`
- Generate SDs with required metadata fields
- Update mapping table with SD linkage
- Support grouping (multiple NAV issues → one SD)

**Command**:
```bash
npm run audit:generate-sds -- --file docs/audits/2025-12-26-navigation-audit.md
```

---

## Workstream 3: Zero-Loss Gate Enforcement

### 3.1 Pre-Commit Hook for SD Creation

Block SD creation scripts from running unless:
- All audit items have dispositions (coverage = 100%)
- OR explicit `--allow-partial` flag with justification

### 3.2 Coverage Dashboard

Add to LEO Protocol dashboard:
- List all audit files with coverage percentage
- Highlight audits with pending items
- Show aging (days since audit with unresolved items)

### 3.3 Session Start Check

When starting a new session, if there are audits with <100% coverage:
- Display warning with count of pending items
- Suggest running `npm run audit:triage --pending`

---

## Workstream 4: Theme/Architecture SD Creation

### 4.1 Theme Extraction Process

For cross-cutting themes identified in audits:
1. Create parent "Theme SD" with type `architectural_review`
2. Link all supporting NAV issues via `original_issue_ids[]`
3. Preserve Chairman's exact framing of the theme
4. Define success criteria appropriate to themes (decision doc, not code)

### 4.2 Create Theme SDs for December 26 Audit

The 5 themes that need SDs:

| Theme | Chairman's Words | Supporting Issues |
|-------|------------------|-------------------|
| Mock Data Strategy | "Some pages show mock data, others show empty real data. Need central strategy." | NAV-14, NAV-18, NAV-19, NAV-25, NAV-28, NAV-41, NAV-51, NAV-54 |
| Stage Count Alignment | "Multiple routes reference outdated 40-stage workflow. Should be 25." | NAV-11, NAV-12, NAV-15, NAV-37 |
| AI-First Team Model | "Solo entrepreneur with AI agent team. Team/attendee concepts should reflect human + AI agents." | NAV-33, NAV-42, NAV-44, NAV-78, NAV-79 |
| Route Consolidation | "Too many sidebar routes. Consider consolidating into single pages with tabs." | NAV-01, NAV-45, NAV-71 |
| LEO Protocol Section | "No dedicated section for LEO Protocol dashboard. QA, Testing, Workflow should be under LEO Protocol." | NAV-57, NAV-58, NAV-59, NAV-60, NAV-61 |

### 4.3 Discovery Spike Template

For "first principles rethink" items, create Discovery Spike SDs with:
- Time-box (e.g., 2-4 hours)
- Output: Decision document, not code
- Options to evaluate
- Recommendation

---

## Workstream 5: Immediate Recovery

### 5.1 Ingest December 26 Audit

```bash
npm run audit:ingest -- --file docs/audits/2025-12-26-navigation-audit.md
```

Expected: 79 rows in `audit_finding_sd_mapping` with `disposition = 'pending'`

### 5.2 Triage All 79 Items

Go through each item and set disposition:
- `sd_created` - Will create SD
- `deferred` - Valid but not now (with reason)
- `wont_fix` - Not going to address (with reason)
- `duplicate` - Already covered by another SD
- `needs_discovery` - Requires investigation first

### 5.3 Generate Missing SDs

For items marked `sd_created`, generate SDs with proper metadata.

### 5.4 Create 5 Theme SDs

Generate the Theme SDs from Workstream 4.2.

---

## Workstream 6: Process Documentation

### 6.1 Update CLAUDE_EXEC.md

Add section on Audit-to-SD Pipeline:
- Ingestion requirements
- Triage process
- Zero-loss gate
- Theme extraction

### 6.2 Create Reference Guide

**File**: `docs/reference/audit-to-sd-pipeline.md`

Contents:
- Pipeline diagram
- Schema documentation
- Command reference
- Examples

### 6.3 Add to LEO Protocol Sections

Insert new protocol section for "Audit Ingestion & Triage" in database.

---

## Workstream 7: Triangulation Process Update

### 7.1 Separate Verification from Preservation

**Current Problem**: Triangulation optimizes for consensus, which filters out "subjective" Chairman observations.

**Proposed Fix**: Two-track process:
1. **Verification Track** (3-model consensus): For bugs, errors, technical issues
2. **Preservation Track** (Chairman authority): For UX, architecture, strategy - no consensus needed, Chairman's word is final

### 7.2 Update Triangulation Protocol

Modify `scripts/add-runtime-audit-protocol-section.mjs` to include:
- Explicit preservation of non-consensus items
- Chairman override for strategic observations
- Different handling for different issue types

---

## Implementation Sequence

| Phase | Workstream | Duration | Dependencies |
|-------|------------|----------|--------------|
| **1** | 1.1 - Mapping table | Day 1 | None |
| **1** | 5.1 - Ingest Dec 26 audit | Day 1 | 1.1 |
| **2** | 2.1 - Parser script | Day 2 | 1.1 |
| **2** | 1.2, 1.3 - Schema updates | Day 2 | None |
| **3** | 5.2 - Triage all items | Day 3 | 5.1 |
| **3** | 4.2 - Create Theme SDs | Day 3 | 1.2 |
| **4** | 2.2, 2.3 - Triage & generator | Day 4-5 | 2.1 |
| **4** | 5.3, 5.4 - Generate SDs | Day 4-5 | 5.2, 4.2 |
| **5** | 3.x - Zero-loss gates | Day 6 | 2.x |
| **5** | 6.x - Documentation | Day 6 | All |
| **6** | 7.x - Triangulation update | Day 7 | 6.x |

---

## Questions for Your Feedback

1. **Completeness**: Are there any gaps in this plan? What's missing?

2. **Prioritization**: Should any workstream be moved up or down in priority?

3. **Schema Design**: Any concerns with the `audit_finding_sd_mapping` table design?

4. **Theme SDs**: Is the approach for handling cross-cutting themes appropriate?

5. **Two-Track Triangulation**: Does separating "verification" from "preservation" make sense, or does it undermine the triangulation methodology?

6. **Feasibility**: Any technical blockers or dependencies I'm not seeing?

7. **Risks**: What could go wrong with this plan?

8. **Alternatives**: Are there simpler approaches that would achieve the same goals?

---

## Your Task

Please review this action plan and provide:

1. **Validation**: Which parts look solid?
2. **Concerns**: What worries you about this plan?
3. **Additions**: What's missing that should be added?
4. **Modifications**: What would you change?
5. **Priority Reordering**: Would you sequence things differently?

Be specific and direct. I want your independent assessment, not agreement for agreement's sake.

---

*This is the second phase of our triangulation. The first phase identified root causes; this phase validates the remediation plan.*
