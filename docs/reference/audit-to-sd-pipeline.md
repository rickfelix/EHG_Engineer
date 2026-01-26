# Audit-to-SD Pipeline


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, testing, schema, protocol

**Version**: 1.0
**Date**: 2025-12-28
**Status**: Active

---

## Overview

The Audit-to-SD Pipeline transforms runtime audit findings into Strategic Directives with full traceability. It addresses the "92% feedback loss" problem where verbatim Chairman observations were being lost between audit capture and SD creation.

### Key Principles

1. **Zero Loss**: Every audit finding gets an explicit disposition
2. **Verbatim Preservation**: Chairman's exact words are stored immutably
3. **Full Traceability**: NAV-xx IDs link to SD-xx IDs throughout
4. **Two-Track Triangulation**: Bugs need consensus, strategic observations get Chairman authority

---

## Pipeline Stages

```
                    ┌──────────────────┐
                    │  Manual Testing  │
                    │  (Phase 1-2)     │
                    └────────┬─────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│                       AUDIT FILE                                   │
│  docs/audits/YYYY-MM-DD-name.md                                   │
│  - Markdown tables with ID, Route, Type, Severity, Description    │
│  - NAV-xx issue IDs                                               │
└───────────────────────────────────────────────────────────────────┘
                             │
                             │ npm run audit:validate
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│                       VALIDATION                                   │
│  scripts/validate-audit-file.mjs                                  │
│  - Format check (filename, columns, IDs)                          │
│  - Type/Severity enum validation                                  │
│  - Duplicate ID detection                                         │
└───────────────────────────────────────────────────────────────────┘
                             │
                             │ npm run audit:ingest
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│                   AUDIT_FINDING_SD_MAPPING                         │
│  Database table storing all findings                              │
│  - original_issue_id (NAV-xx, immutable)                          │
│  - verbatim_text (Chairman's exact words)                         │
│  - disposition (pending → sd_created/deferred/wont_fix/etc)       │
│  - audit_content_hash (fingerprint)                               │
└───────────────────────────────────────────────────────────────────┘
                             │
                             │ Manual triage via Supabase Studio
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│                        TRIAGE                                      │
│  Each finding gets explicit disposition:                          │
│  - sd_created: Will create SD                                     │
│  - deferred: Valid but not now                                    │
│  - wont_fix: Decided not to address                               │
│  - duplicate: Points to another finding                           │
│  - needs_discovery: Requires spike first                          │
└───────────────────────────────────────────────────────────────────┘
                             │
                             │ npm run audit:generate-sds
                             │ (requires 100% triage coverage)
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│                  STRATEGIC_DIRECTIVES_V2                           │
│  SDs created from triaged findings                                │
│  - metadata.original_issue_ids: ["NAV-xx", ...]                   │
│  - metadata.chairman_verbatim_text: "exact quote"                 │
│  - sd_type: implementation/ux_debt/discovery_spike/etc            │
└───────────────────────────────────────────────────────────────────┘
                             │
                             │ audit_finding_sd_links (join table)
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│                   AUDIT_FINDING_SD_LINKS                           │
│  Many-to-many relationship:                                       │
│  - primary: 1 finding → 1 SD                                      │
│  - supporting: N findings → 1 Theme SD                            │
│  - theme: N findings → 1 Theme SD                                 │
└───────────────────────────────────────────────────────────────────┘
                             │
                             │ npm run audit:retro
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│                    RETROSPECTIVES                                  │
│  Audit retrospective with:                                        │
│  - retro_type: 'AUDIT'                                            │
│  - coverage_analysis                                              │
│  - triangulation_divergence_insights                              │
│  - verbatim_citations                                             │
│  - action_items                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## Commands

| Command | Purpose | Input | Output |
|---------|---------|-------|--------|
| `npm run audit:validate -- --file <path>` | Validate format | Markdown file | Errors/Warnings |
| `npm run audit:ingest -- --file <path>` | Ingest to database | Markdown file | Mapping rows |
| `npm run audit:generate-sds -- --file <path>` | Create SDs | Triaged mappings | SDs + Links |
| `npm run audit:retro -- --file <path>` | Generate retrospective | All above | Retrospective |

---

## Database Schema

### audit_finding_sd_mapping

```sql
CREATE TABLE audit_finding_sd_mapping (
  id UUID PRIMARY KEY,

  -- Source (immutable)
  audit_file_path TEXT NOT NULL,
  original_issue_id VARCHAR(20) NOT NULL,  -- NAV-xx
  audit_date DATE NOT NULL,
  source_line_number INTEGER,
  audit_content_hash VARCHAR(64),

  -- Chairman's exact words (immutable)
  verbatim_text TEXT NOT NULL,
  issue_type VARCHAR(20) NOT NULL,
  severity VARCHAR(20),
  route_path TEXT,

  -- Triage (mutable)
  disposition audit_disposition NOT NULL DEFAULT 'pending',
  disposition_reason TEXT,
  disposition_by VARCHAR(100),
  disposition_at TIMESTAMPTZ,

  UNIQUE(audit_file_path, original_issue_id)
);
```

### audit_finding_sd_links

```sql
CREATE TABLE audit_finding_sd_links (
  id UUID PRIMARY KEY,
  mapping_id UUID REFERENCES audit_finding_sd_mapping(id),
  sd_id VARCHAR(50) NOT NULL,
  link_type VARCHAR(20) NOT NULL DEFAULT 'primary',
  -- 'primary': Direct 1:1 mapping
  -- 'supporting': Finding supports larger SD
  -- 'theme': Finding grouped under Theme SD
  UNIQUE(mapping_id, sd_id)
);
```

### audit_coverage_report (View)

```sql
CREATE VIEW audit_coverage_report AS
SELECT
  audit_file_path,
  audit_date,
  COUNT(*) as total_issues,
  COUNT(*) FILTER (WHERE disposition = 'pending') as pending,
  COUNT(*) FILTER (WHERE disposition = 'sd_created') as sd_created,
  ROUND(100.0 * COUNT(*) FILTER (WHERE disposition != 'pending')
    / NULLIF(COUNT(*), 0), 1) as coverage_pct
FROM audit_finding_sd_mapping
GROUP BY audit_file_path, audit_date;
```

---

## SD Types

| SD Type | When to Use | Output |
|---------|-------------|--------|
| `implementation` | Bugs that need code fixes | Working code |
| `ux_debt` | UX issues that aren't bugs | Improved UX |
| `discovery_spike` | "First principles rethink" items | Decision document |
| `architectural_review` | Cross-cutting themes | Architecture decision |
| `strategic_observation` | Chairman insights about direction | Product decision |
| `product_decision` | Decisions needed before implementation | Decision record |

---

## Two-Track Triangulation

### Track A: Verification (Consensus Required)

For bugs, errors, technical issues:

1. Send diagnostic prompt to Claude, ChatGPT, Antigravity
2. Each investigates independently
3. Compare findings for consensus (2/3 minimum)
4. If consensus → proceed with fix
5. If divergent → escalate to Chairman

### Track B: Preservation (Chairman Authority)

For UX feedback, strategic observations:

1. Preserve Chairman's exact words
2. No consensus required (Chairman decides)
3. Create appropriate SD type
4. Apply 2x weighting in retrospective

---

## Coverage Gate

The SD generator enforces 100% triage coverage:

```bash
# This will FAIL if any items are 'pending'
npm run audit:generate-sds -- --file docs/audits/2025-12-26-navigation-audit.md

# Override with justification
npm run audit:generate-sds -- --file docs/audits/2025-12-26-navigation-audit.md \
  --allow-partial --justification "Emergency fix for critical bug"
```

---

## Retrospective Quality Criteria

| Criterion | Weight | Threshold |
|-----------|--------|-----------|
| Triage coverage | 25% | 100% |
| Verbatim citations | 20% | >= 3 quotes |
| Evidence-linked lessons | 20% | All lessons cite NAV-xx |
| SMART action items | 15% | Owner + deadline + criteria |
| Divergence analysis | 10% | >= 1 insight |
| Process/product split | 10% | Separate learnings |

Target quality score: >= 70 for auto-publish

---

## Related Documentation

- [Audit Format Spec](./audit-format-spec.md) - Markdown file format
- [Researcher Agent Workflow](./researcher-agent-workflow.md) - For non-coding SDs
- Runtime Audit Protocol (database) - Full 7-phase process

---

*Created: 2025-12-28*
*Based on triangulated recommendations (Claude + OpenAI + Antigravity)*
