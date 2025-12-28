# Action Plan Synthesis: Triangulated Feedback

**Date**: 2025-12-28
**Models**: Claude Code, OpenAI ChatGPT, Google Antigravity

---

## Verdict Summary

| Model | Overall Assessment |
|-------|-------------------|
| **OpenAI** | Validated with modifications - concerns about schema tension, parser brittleness, enforcement points |
| **Antigravity** | VALIDATED (with minor refinements) - critical endorsement of Two-Track Triangulation |

---

## Consensus Validations (Both Agree)

| Element | OpenAI | Antigravity |
|---------|--------|-------------|
| Zero-loss gate + triage ledger | "The real fix" | "High Value" |
| Source traceability (verbatim + original_id) | "Exactly the right invariants" | "Essential" |
| Many-to-one support (Theme SDs) | "Correct model" | "Excellent - properly represents data structure" |
| Two-Track Triangulation | "Matches how information actually behaves" | "CRITICAL ENDORSEMENT - most important process fix" |
| Implementation sequence | Implicit approval | "Only logical path" |

---

## Concerns & Refinements

### Schema Issues

| Issue | OpenAI | Antigravity | Resolution |
|-------|--------|-------------|------------|
| `linked_sd_id` vs `linked_sd_ids` dual fields | "Invites drift - pick one or use join table" | "Keep both but clarify usage" | **Use join table** (OpenAI's recommendation - cleaner) |
| `category` vs `sd_type` for new types | "Consider reference table instead of enum" | "`sd_type` drives behavior; `category` is flexible - add to `sd_type` constraint" | **Add to `sd_type`** for workflow-affecting types |
| `disposition` as ENUM | - | "Use ENUM in Postgres for data integrity" | **Use ENUM** |

### Process Issues

| Issue | OpenAI | Antigravity | Resolution |
|-------|--------|-------------|------------|
| Pre-commit hooks as enforcement | "Wrong point - enforce in generator + CI" | "Aggressive - consider CI check or session warning first" | **Enforce in generator primarily, CI secondary** |
| Interactive CLI triage | - | "Over-engineering risk - use Supabase Studio for Phase 1" | **Skip CLI for now, use Studio** |
| Parser brittleness | "Fragile unless format standardized" | "Regex/markdown parsing can be finicky" | **Create format spec + validator FIRST** |

### Missing Elements

| Gap | Source | Resolution |
|-----|--------|------------|
| Ingestion fingerprint (prevent duplicate/changed audits) | OpenAI | Add `audit_content_hash`, `ingested_at`, `ingested_by` |
| Duplicate/supersedes mechanism | OpenAI | Add `duplicate_of_original_issue_id` field |
| Status sync (SD completion → mapping update) | OpenAI | Add trigger or sync script |
| Acceptance criteria per SD type | OpenAI | Define for `discovery_spike`, `architectural_review` |
| "Researcher Agent" workflow for non-coding SDs | Antigravity | Create workflow for "write decision doc" |
| PowerShell equivalents | OpenAI | Add PS commands alongside npm |

---

## Priority Reordering (Consensus)

Both models suggest pulling format standardization forward:

| Original | Revised |
|----------|---------|
| 1. Mapping table | 1. Mapping table |
| 2. Parser script | **2. Format spec + validator** |
| 3. Schema updates | 3. Parser script |
| 4. Triage CLI | **4. Schema updates (sd_type constraint)** |
| 5. Generate SDs | 5. Ingest Dec 26 audit |
| 6. Zero-loss gates | 6. Triage via Supabase Studio (skip CLI) |
| 7. Documentation | 7. Generate SDs (start with 1 Theme SD) |

---

## Critical Additions

### 1. Audit Format Spec (NEW - Priority P0)

Create `/docs/reference/audit-format-spec.md`:
- Define markdown table structure
- Required columns: ID, Route, Type, Severity, Description
- ID format: `{PREFIX}-{NN}` (e.g., NAV-01)
- Validation rules

### 2. Join Table for SD Links (Schema Change)

Replace dual fields with:
```sql
CREATE TABLE audit_finding_sd_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id UUID REFERENCES audit_finding_sd_mapping(id),
  sd_id VARCHAR(50) REFERENCES strategic_directives_v2(id),
  link_type VARCHAR(20) DEFAULT 'primary',  -- 'primary', 'supporting', 'theme'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. Researcher Agent Workflow (NEW)

For `discovery_spike` and `architectural_review` SDs:
- Output: Decision document (not code)
- Time-box: 2-4 hours
- Deliverable: Options evaluated, recommendation made
- No PRD required

### 4. Ingestion Fingerprint Fields

Add to `audit_finding_sd_mapping`:
```sql
audit_content_hash VARCHAR(64),      -- SHA256 of source content
ingested_at TIMESTAMPTZ DEFAULT NOW(),
ingested_by VARCHAR(100),
source_line_number INTEGER,          -- Line in markdown file
duplicate_of_issue_id VARCHAR(20)    -- If this is a duplicate
```

---

## Risks Identified

| Risk | Source | Mitigation |
|------|--------|------------|
| Process bypass (creating SDs outside generator) | OpenAI | "One blessed path" - make generator the only way |
| Overhead backlash (79-item triage feels heavy) | OpenAI | Bulk rules, good UX, or start with Supabase Studio |
| Theme SD ambiguity (infinite scope, stalls) | OpenAI | Crisp acceptance criteria per type |
| Data rot (links break if files move) | Antigravity | Use immutable `original_issue_id` as anchor |

---

## Minimum Viable Fix (Antigravity's "PROCEED" Path)

If time-constrained, do ONLY:

1. **Create mapping table** (with ingestion fingerprint fields)
2. **Create join table** for SD links
3. **Update `sd_type` constraint** (add `strategic_observation`, `architectural_review`)
4. **Write ingestion parser** (after format spec)
5. **Ingest December 26 audit**
6. **Triage via Supabase Studio** (skip CLI)
7. **Generate 1 Theme SD** end-to-end to validate template

Everything else (dashboards, gates, documentation) can follow.

---

## Final Consensus

| Aspect | Verdict |
|--------|---------|
| Plan validity | **VALIDATED** by both models |
| Two-Track Triangulation | **CRITICAL ENDORSEMENT** - proceed immediately |
| Schema design | Minor refinements (join table, ENUMs, fingerprints) |
| Process | Simplify Phase 1 (skip CLI, use Studio) |
| Sequence | Pull format spec forward, start with 1 Theme SD |

**Bottom Line**: Execute now. The plan is sound. Start with schema + ingestion.
