# Refined Action Plan: Audit-to-SD Pipeline Fix


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, api, migration, schema

**Date**: 2025-12-28
**Status**: VALIDATED by triangulation (Claude + OpenAI + Antigravity)
**Confidence**: HIGH

---

## Executive Summary

All three models validated the core approach. Key refinements:
- Use **join table** instead of dual SD link fields
- Add **ingestion fingerprint** for audit trail integrity
- Create **format spec + validator** before parser
- Skip CLI triage for Phase 1 - use **Supabase Studio**
- Add **`sd_type` constraint** for new workflow types
- Start with **1 Theme SD** to validate template before creating 5

---

## Phase 1: Foundation (Day 1)

### 1.1 Create Audit Format Specification

**File**: `docs/reference/audit-format-spec.md`

```markdown
# Audit File Format Specification

## Required Structure
- Markdown file in `docs/audits/`
- Filename: `YYYY-MM-DD-{audit-name}.md`
- Contains markdown tables with required columns

## Table Columns (Required)
| Column | Type | Example |
|--------|------|---------|
| ID | {PREFIX}-{NN} | NAV-01, UAT-15 |
| Route | Path string | /chairman/decisions |
| Type | Enum | Bug, UX, Brainstorm |
| Severity | Enum | Critical, Major, Minor, Idea |
| Description | Text | Chairman's verbatim observation |

## ID Format Rules
- Prefix: 2-5 uppercase letters (e.g., NAV, UAT, API)
- Number: 2+ digits, zero-padded (e.g., 01, 99, 100)
- Unique within file
```

**Acceptance**: Spec exists, reviewed, approved

---

### 1.2 Create Audit Finding Mapping Table

**Migration**: `database/migrations/YYYYMMDD_audit_finding_mapping.sql`

```sql
-- Disposition enum
CREATE TYPE audit_disposition AS ENUM (
  'pending',
  'sd_created',
  'deferred',
  'wont_fix',
  'duplicate',
  'needs_discovery'
);

-- Main mapping table
CREATE TABLE audit_finding_sd_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source tracking (immutable after ingestion)
  audit_file_path TEXT NOT NULL,
  original_issue_id VARCHAR(20) NOT NULL,
  audit_date DATE NOT NULL,
  source_line_number INTEGER,

  -- Ingestion fingerprint (immutable)
  audit_content_hash VARCHAR(64),
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  ingested_by VARCHAR(100),

  -- Chairman's exact words (immutable)
  verbatim_text TEXT NOT NULL,
  issue_type VARCHAR(20) NOT NULL,
  severity VARCHAR(20),
  route_path TEXT,

  -- Duplicate tracking
  duplicate_of_issue_id VARCHAR(20),

  -- Triage decision (mutable)
  disposition audit_disposition NOT NULL DEFAULT 'pending',
  disposition_reason TEXT,
  disposition_by VARCHAR(100),
  disposition_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(audit_file_path, original_issue_id)
);

-- Indexes
CREATE INDEX idx_audit_mapping_disposition ON audit_finding_sd_mapping(disposition);
CREATE INDEX idx_audit_mapping_file ON audit_finding_sd_mapping(audit_file_path);
CREATE INDEX idx_audit_mapping_hash ON audit_finding_sd_mapping(audit_content_hash);
```

**Acceptance**: Migration applied, table exists in Supabase

---

### 1.3 Create SD Link Join Table

**Migration**: `database/migrations/YYYYMMDD_audit_finding_sd_links.sql`

```sql
CREATE TABLE audit_finding_sd_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  mapping_id UUID NOT NULL REFERENCES audit_finding_sd_mapping(id) ON DELETE CASCADE,
  sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

  link_type VARCHAR(20) NOT NULL DEFAULT 'primary',
    -- 'primary': Direct 1:1 mapping (bug -> fix SD)
    -- 'supporting': This finding supports a larger SD
    -- 'theme': This finding is grouped under a Theme SD

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(mapping_id, sd_id)
);

CREATE INDEX idx_sd_links_mapping ON audit_finding_sd_links(mapping_id);
CREATE INDEX idx_sd_links_sd ON audit_finding_sd_links(sd_id);
```

**Acceptance**: Migration applied, join table exists

---

### 1.4 Update sd_type Constraint

**Migration**: `database/migrations/YYYYMMDD_add_sd_types.sql`

```sql
-- Add new sd_type values for non-coding work
ALTER TABLE strategic_directives_v2
DROP CONSTRAINT IF EXISTS strategic_directives_v2_sd_type_check;

ALTER TABLE strategic_directives_v2
ADD CONSTRAINT strategic_directives_v2_sd_type_check
CHECK (sd_type IN (
  -- Existing types
  'orchestrator',
  'implementation',
  'documentation',

  -- New types (from triangulation)
  'strategic_observation',   -- Chairman insights about product direction
  'architectural_review',    -- Cross-cutting themes requiring holistic analysis
  'discovery_spike',         -- Time-boxed "first principles" investigation
  'ux_debt',                 -- UX issues that aren't bugs
  'product_decision'         -- Decisions needed before implementation
));
```

**Acceptance**: Constraint updated, new types available

---

## Phase 2: Ingestion (Day 2)

### 2.1 Create Format Validator

**File**: `scripts/validate-audit-file.ts`

```typescript
// Validates audit markdown against format spec
// Usage: npx ts-node scripts/validate-audit-file.ts docs/audits/2025-12-26-navigation-audit.md

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  issueCount: number;
}

// Checks:
// - File exists and is markdown
// - Contains at least one table
// - Table has required columns (ID, Route, Type, Severity, Description)
// - IDs match format: {PREFIX}-{NN}
// - IDs are unique within file
// - Types are valid enum values
// - Severities are valid enum values
```

**Acceptance**: Validator runs, catches malformed files

---

### 2.2 Create Ingestion Parser

**File**: `scripts/ingest-audit-file.ts`

```typescript
// Parses audit markdown and creates mapping table entries
// Usage: npx ts-node scripts/ingest-audit-file.ts --file docs/audits/2025-12-26-navigation-audit.md

// Process:
// 1. Validate file first (fail fast)
// 2. Calculate content hash (SHA256)
// 3. Check if already ingested (by hash)
// 4. Parse all tables
// 5. Create one row per issue
// 6. Set all dispositions to 'pending'
// 7. Report: X issues ingested, Y skipped (duplicates)

// Key invariants:
// - NEVER summarize or modify verbatim_text
// - PRESERVE exact ID format
// - STORE line numbers for traceability
```

**Acceptance**: Parser ingests Dec 26 audit, creates 79 rows

---

### 2.3 Ingest December 26 Audit

```bash
# Validate first
npx ts-node scripts/validate-audit-file.ts docs/audits/2025-12-26-navigation-audit.md

# Ingest
npx ts-node scripts/ingest-audit-file.ts --file docs/audits/2025-12-26-navigation-audit.md
```

**Acceptance**: 79 rows in `audit_finding_sd_mapping` with `disposition = 'pending'`

---

## Phase 3: Triage (Day 3)

### 3.1 Triage All Items via Supabase Studio

Use Supabase Studio (not CLI) to triage each item:

**Triage Rules**:
| Issue Type | Default Disposition | Notes |
|------------|---------------------|-------|
| Critical Bug | `sd_created` | Always create SD |
| Major Bug | `sd_created` or `deferred` | Assess impact |
| Minor Bug | `deferred` or `wont_fix` | Low priority |
| UX Issue | `sd_created` (as `ux_debt`) | Preserve all |
| Brainstorm/Idea | `needs_discovery` or `sd_created` (as `discovery_spike`) | Chairman authority |
| Cross-cutting theme | `sd_created` (as `architectural_review`) | Group supporting issues |

**Acceptance**: 79/79 items have non-pending disposition (100% coverage)

---

### 3.2 Create ONE Theme SD (Validation)

Before creating all 5 Theme SDs, create ONE to validate the template:

**Theme**: Mock Data Strategy
**Supporting Issues**: NAV-14, NAV-18, NAV-19, NAV-25, NAV-28, NAV-41, NAV-51, NAV-54
**Chairman's Words**: "Some pages show mock data, others show empty real data. Need central strategy."

**SD Structure**:
```javascript
{
  id: 'SD-THEME-MOCKDATA-001',
  sd_type: 'architectural_review',
  title: 'Mock Data Strategy - Central Data Policy',

  description: `Cross-cutting architectural review for mock data consistency.

Chairman's observation: "Some pages show mock data, others show empty real data. Need central strategy."

This theme affects 8+ routes across the application and requires a unified approach.`,

  success_criteria: [
    'Decision document produced',
    'Central mock data policy defined',
    'Implementation approach chosen',
    'Affected routes identified'
  ],

  metadata: {
    source_type: 'runtime_audit',
    source_audit_file: 'docs/audits/2025-12-26-navigation-audit.md',
    original_issue_ids: ['NAV-14', 'NAV-18', 'NAV-19', 'NAV-25', 'NAV-28', 'NAV-41', 'NAV-51', 'NAV-54'],
    chairman_verbatim_text: 'Some pages show mock data, others show empty real data. Need central strategy.',
    sd_output_type: 'decision_document'
  }
}
```

**Acceptance**:
- Theme SD created with proper metadata
- Links created in `audit_finding_sd_links` for all 8 supporting issues
- Mapping rows updated with `disposition = 'sd_created'`

---

## Phase 4: SD Generation (Days 4-5)

### 4.1 Create SD Generator Script

**File**: `scripts/audit-to-sd.ts`

```typescript
// Generates SDs from triaged audit findings
// Usage: npx ts-node scripts/audit-to-sd.ts --file docs/audits/2025-12-26-navigation-audit.md

// Enforcement (OpenAI recommendation):
// - REFUSE to generate if coverage < 100%
// - Unless --allow-partial --justification "reason"

// Process:
// 1. Check coverage (fail if < 100% and no override)
// 2. Query items with disposition = 'sd_created' and no linked SD
// 3. Group by theme if applicable
// 4. Generate SDs with required metadata
// 5. Create link records
// 6. Update mapping disposition_at
```

**Acceptance**: Generator enforces coverage, creates SDs with proper metadata

---

### 4.2 Generate Remaining Theme SDs

Create the 4 remaining Theme SDs:

| Theme | SD Type | Supporting Issues |
|-------|---------|-------------------|
| Stage Count Alignment (40→25) | `architectural_review` | NAV-11, NAV-12, NAV-15, NAV-37 |
| AI-First Team Model | `strategic_observation` | NAV-33, NAV-42, NAV-44, NAV-78, NAV-79 |
| Route Consolidation | `architectural_review` | NAV-01, NAV-45, NAV-71 |
| LEO Protocol Section | `strategic_observation` | NAV-57, NAV-58, NAV-59, NAV-60, NAV-61 |

**Acceptance**: 5 Theme SDs exist, all supporting issues linked

---

### 4.3 Generate Individual SDs

For remaining `sd_created` items that aren't part of a theme:
- Critical/Major bugs → `implementation` SDs
- UX issues → `ux_debt` SDs
- "First principles" items → `discovery_spike` SDs

**Acceptance**: All `sd_created` items have linked SDs

---

## Phase 5: Coverage & Sync (Day 6)

### 5.1 Create Coverage Report View

**Migration**: `database/migrations/YYYYMMDD_audit_coverage_view.sql`

```sql
CREATE VIEW audit_coverage_report AS
SELECT
  audit_file_path,
  audit_date,
  COUNT(*) as total_issues,
  COUNT(*) FILTER (WHERE disposition = 'pending') as pending,
  COUNT(*) FILTER (WHERE disposition = 'sd_created') as sd_created,
  COUNT(*) FILTER (WHERE disposition = 'deferred') as deferred,
  COUNT(*) FILTER (WHERE disposition = 'wont_fix') as wont_fix,
  COUNT(*) FILTER (WHERE disposition = 'duplicate') as duplicate,
  COUNT(*) FILTER (WHERE disposition = 'needs_discovery') as needs_discovery,
  ROUND(100.0 * COUNT(*) FILTER (WHERE disposition != 'pending') / NULLIF(COUNT(*), 0), 1) as coverage_pct
FROM audit_finding_sd_mapping
GROUP BY audit_file_path, audit_date
ORDER BY audit_date DESC;
```

**Acceptance**: View exists, shows 100% coverage for Dec 26 audit

---

### 5.2 Create SD Completion Sync Trigger

When an SD is marked complete, update linked mapping rows:

```sql
CREATE OR REPLACE FUNCTION sync_sd_completion_to_audit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE audit_finding_sd_mapping m
    SET
      updated_at = NOW()
    FROM audit_finding_sd_links l
    WHERE l.sd_id = NEW.id
      AND l.mapping_id = m.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sd_completion_sync
AFTER UPDATE ON strategic_directives_v2
FOR EACH ROW
EXECUTE FUNCTION sync_sd_completion_to_audit();
```

**Acceptance**: Trigger fires on SD completion

---

## Phase 6: Process Updates (Day 7)

### 6.1 Update Triangulation Protocol

Add Two-Track process to `CLAUDE_EXEC.md`:

```markdown
## Two-Track Triangulation (Audit Processing)

### Track A: Verification (Consensus Required)
- For: Bugs, errors, technical issues
- Process: 3-model consensus
- Threshold: 2/3 agreement minimum
- Output: Verified/Not Verified

### Track B: Preservation (Chairman Authority)
- For: UX feedback, strategic observations, "first principles" items
- Process: Chairman's word is final
- No consensus required
- Output: Preserved verbatim, SD created or explicitly deferred with reason
```

**Acceptance**: Protocol updated, reviewed

---

### 6.2 Create Researcher Agent Workflow

For `discovery_spike` and `architectural_review` SDs:

**File**: `docs/reference/researcher-agent-workflow.md`

```markdown
# Researcher Agent Workflow

## When to Use
- sd_type = 'discovery_spike'
- sd_type = 'architectural_review'
- sd_type = 'product_decision'

## Output (NOT code)
- Decision document
- Options evaluated (pros/cons)
- Recommendation with rationale
- Next steps

## Time-Box
- Discovery Spike: 2-4 hours
- Architectural Review: 4-8 hours
- Product Decision: 1-2 hours

## Deliverable Template
1. Context (what prompted this)
2. Options Considered
3. Analysis per Option
4. Recommendation
5. Implementation Path (if applicable)
```

**Acceptance**: Workflow documented, usable

---

### 6.3 Document Pipeline

**File**: `docs/reference/audit-to-sd-pipeline.md`

Contents:
- Pipeline diagram
- Schema documentation (tables, views, triggers)
- Command reference
- Format spec link
- Examples

**Acceptance**: Documentation complete, reviewed

---

## Deliverables Checklist

### Database Objects
- [ ] `audit_finding_sd_mapping` table
- [ ] `audit_finding_sd_links` table
- [ ] `audit_disposition` enum
- [ ] Updated `sd_type` constraint
- [ ] `audit_coverage_report` view
- [ ] `sync_sd_completion_to_audit` trigger

### Scripts
- [ ] `scripts/validate-audit-file.ts`
- [ ] `scripts/ingest-audit-file.ts`
- [ ] `scripts/audit-to-sd.ts`

### Documentation
- [ ] `docs/reference/audit-format-spec.md`
- [ ] `docs/reference/researcher-agent-workflow.md`
- [ ] `docs/reference/audit-to-sd-pipeline.md`
- [ ] Updated `CLAUDE_EXEC.md` (Two-Track process)

### Data
- [ ] 79 items ingested from Dec 26 audit
- [ ] 79/79 items triaged (100% coverage)
- [ ] 5 Theme SDs created
- [ ] All individual SDs created
- [ ] All links established

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Audit coverage | 100% (all items have disposition) |
| Verbatim preservation | 100% (no summarization) |
| ID traceability | 100% (NAV-xx preserved, linked to SDs) |
| Theme capture | 5/5 themes have SDs |
| Chairman feedback loss | 0% (down from 92%) |

---

## Risk Mitigations (From Triangulation)

| Risk | Mitigation |
|------|------------|
| Process bypass | Generator is the only blessed path |
| Overhead backlash | Use Supabase Studio for Phase 1, bulk rules later |
| Theme SD ambiguity | Crisp acceptance criteria, time-boxed |
| Data rot | Immutable `original_issue_id` as anchor |
| Parser brittleness | Format spec + validator BEFORE parser |

---

*Plan validated by: Claude Code, OpenAI ChatGPT, Google Antigravity*
*Execution ready: 2025-12-28*
