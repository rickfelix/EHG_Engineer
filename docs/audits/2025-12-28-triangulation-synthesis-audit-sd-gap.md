# Triangulation Synthesis: Audit-to-SD Gap Analysis

**Date**: 2025-12-28
**Models**: Claude Code (Opus 4.5), OpenAI ChatGPT, Google Antigravity (Gemini)
**Issue**: 79 audit issues → only 6 became Strategic Directives (~92% loss)

---

## Consensus Matrix: Root Causes

| Root Cause | Claude | OpenAI | Antigravity | Consensus |
|------------|--------|--------|-------------|-----------|
| **No triage ledger / lossy handoff** | ✓ (Transformation Loss) | ✓ (RC1: No enforced triage ledger) | ✓ (RC2: No automated pipeline) | **HIGH - 3/3** |
| **ID re-indexing breaks traceability** | ✓ (NAV→A mismatch) | ✓ (RC2: Re-parsing, not mapping) | ✓ (RC3: Semantic re-identification) | **HIGH - 3/3** |
| **Category filtering excludes UX/Ideas** | ✓ (Critical-only selection) | ✓ (RC4: Implicit policy) | ✓ (RC5: Infrastructure-first bias) | **HIGH - 3/3** |
| **No verbatim text preservation** | ✓ (Traceability gap) | ✓ (RC6: Summarization + polish bias) | ✓ (RC4: Schema doesn't enforce) | **HIGH - 3/3** |
| **No container for architectural themes** | ✓ (Cross-cutting themes lost) | ✓ (RC5: No "Theme SD" type) | ✓ (RC5: Infrastructure bias) | **HIGH - 3/3** |
| **Triangulation causes convergence on "objective" bugs** | - | - | ✓ (RC1: Lossy filter on consensus) | **UNIQUE - Antigravity** |
| **Hardcoded script, no file parsing** | - | - | ✓ (RC2: Script doesn't read file) | **UNIQUE - Antigravity** |

---

## Consensus Root Causes (All 3 Agree)

### 1. No Mandatory Triage Ledger (Lossy Handoff)

**Claude**: "There appears to have been an intermediate analysis/triage session where the 79 NAV issues were distilled down to 9 'A-series' issues."

**OpenAI**: "Your process appears to jump from 'captured issues' → 'some SDs created' without a mandatory intermediate artifact that lists all NAV-01…NAV-79 with an explicit disposition."

**Antigravity**: "There is no code that parses `docs/audits/2025-12-26-navigation-audit.md`. The script contains hardcoded objects for the 4 SDs it creates."

**Synthesis**: The pipeline lacks a **zero-loss gate** - a step that forces explicit disposition of every captured issue before SD creation.

---

### 2. ID Re-indexing Breaks Traceability Chain

**Claude**: "Your navigation audit captured 79 issues (NAV-01 through NAV-79), but the SD creation script references a different issue numbering system (A-01 through A-09)."

**OpenAI**: "The appearance of A-01…A-09 strongly suggests the SD creation step didn't reference NAV IDs; it likely re-parsed the audit into a new internal issue list. This is a classic ETL anti-pattern: generating new primary keys without maintaining a stable source key."

**Antigravity**: "The shift from NAV-xx to A-xx IDs indicates a semantic break... The mapping exists only in the lost context of the chat conversation that generated the script."

**Synthesis**: The system created **surrogate keys** without preserving **source keys**, breaking the audit trail.

---

### 3. Category Filtering Excludes UX/Ideas

**Claude**: "The SD creation script explicitly chose 'Critical Infrastructure Fixes' as the scope, filtering out everything except infrastructure-breaking bugs... 28 UX issues (excluded), 26 Brainstorm/Ideas (completely excluded)."

**OpenAI**: "A zero capture rate for UX and Brainstorm/Ideas indicates a hard filter or strong selection bias: only 'bugs' became SD inputs. That's a governance flaw if your definition of SD includes product strategy and experience design."

**Antigravity**: "The generated Strategic Directive was explicitly titled 'Critical Infrastructure Fixes'. The filtering logic applied by the AI agents prioritized unblocking the application over strategic improvements."

**Synthesis**: An **implicit policy** treated only "bugs" as SD-worthy, excluding strategic and UX feedback by design.

---

### 4. No Verbatim Text Preservation

**Claude**: "Your verbatim comments like 'needs first principles rethink' don't appear in any SD... The SDs have no back-reference to your original comments."

**OpenAI**: "AI systems commonly rewrite inputs into cleaner abstractions unless explicitly constrained. Phrases like 'first principles rethink' are exactly the kind of language that gets compressed into neutral summaries."

**Antigravity**: "The schema doesn't require it, and the AI, prioritizing 'clean' summaries, opted to rewrite descriptions rather than preserve your raw quotes."

**Synthesis**: Without a **schema-enforced verbatim field**, AI naturally summarizes/compresses original language.

---

### 5. No Container for Architectural/Strategic Themes

**Claude**: "Cross-cutting themes (5 architectural patterns) were documented but not converted to SDs."

**OpenAI**: "Cross-cutting themes don't map well to single bug tickets. If the SD template expects 'root_cause' + 'fix,' architectural insights become 'too big,' get labeled 'non-actionable,' and are dropped."

**Antigravity**: "Your 'Brainstorm/Ideas' are not 'bugs' and often get dropped by engineering-focused agents. Create a specific SD category."

**Synthesis**: The SD schema is **bug-centric** and lacks templates for **Theme/Architecture/Discovery** work items.

---

## Unique Insights (Single Model)

### Antigravity: Triangulation Itself Causes Loss

> "The 'Triangulation' methodology asks multiple AIs to reach consensus. In doing so, the AIs naturally converge on 'objective' errors (bugs, crashes) where consensus is high, and discard 'subjective' observations (UX, 'first principles' rethinking) where consensus is lower or harder to verify."

**Implication**: The very methodology designed to improve accuracy may be **filtering out strategic insights** because they can't be "verified" by multiple models.

### Antigravity: Script is Hardcoded, Not Data-Driven

> "The script `create-sd-runtime-audit-fixes-001.mjs` contains hardcoded objects for the 4 SDs it creates. This means the transfer of data happened entirely 'in context' (in the chat window), subject to the AI's context window limits."

**Implication**: The script was a **point solution**, not an **ingestion pipeline**. It was written to create 4 specific SDs, not to process the audit file systematically.

---

## Recommendations Comparison

| Recommendation | Claude | OpenAI | Antigravity | Priority |
|----------------|--------|--------|-------------|----------|
| **Create triage ledger with 100% coverage** | - | ✓ (P1) | ✓ (via ingestion) | **CRITICAL** |
| **Add traceability fields to SD metadata** | ✓ | ✓ (P2) | ✓ (P2) | **CRITICAL** |
| **Stop re-indexing; preserve source IDs** | ✓ | ✓ (P3) | ✓ (P3: original_source_id) | **HIGH** |
| **Expand SD types (Theme, Discovery, UX)** | ✓ | ✓ (P4) | ✓ (P3: strategic_observation) | **HIGH** |
| **Create Theme SDs for cross-cutting issues** | ✓ | ✓ (P5) | - | **HIGH** |
| **Enforce verbatim text by contract** | ✓ | ✓ (P6) | ✓ (P2: verbatim_feedback) | **HIGH** |
| **Build automated ingestion pipeline** | - | - | ✓ (P1) | **HIGH** |
| **Restore the 73 lost items now** | - | - | ✓ (P4: Immediate fix) | **MEDIUM** |
| **Add audit-to-SD mapping table** | ✓ | ✓ (join table) | - | **MEDIUM** |

---

## Synthesized Action Plan

### Phase 1: Immediate (Fix the Gap)

1. **Create ingestion script** that parses `docs/audits/*.md` and creates a triage entry for EVERY row
2. **Run recovery script** for `2025-12-26-navigation-audit.md` to import the 73 missing items as Draft SDs
3. **Add mapping table**: `audit_finding_sd_mapping` with `audit_file`, `original_id`, `sd_id`, `verbatim_text`, `disposition`

### Phase 2: Schema Updates

4. **Add required metadata fields** to SD creation:
   - `original_source_id` (NAV-xx)
   - `chairman_verbatim_text` (exact quote)
   - `source_audit_file` (path)
   - `triage_disposition` (SD / defer / discard / discovery)

5. **Create new SD types**:
   - `architectural_review` - for cross-cutting themes
   - `strategic_observation` - for Chairman insights
   - `discovery_spike` - for "first principles" investigations
   - `ux_debt` - for UX issues

### Phase 3: Process Updates

6. **Implement zero-loss gate**: No SD batch can be created until 100% of audit items have explicit dispositions
7. **Modify triangulation process**: Separate "verification consensus" (for bugs) from "strategic preservation" (for Chairman insights)
8. **Add validation rule**: Reject SD creation if `chairman_verbatim_text` is missing for audit-derived SDs

---

## Risk Assessment (Consensus)

| Risk | Claude | OpenAI | Antigravity |
|------|--------|--------|-------------|
| **Strategic drift** | Implicit | ✓ | ✓ "Strategic Drift" |
| **Feedback loop breakage / trust loss** | Implicit | ✓ | ✓ "Disengagement from LEO Protocol" |
| **Compounding technical/UX debt** | ✓ | ✓ "product drift" | ✓ "UX Debt accumulation" |
| **Governance erosion** | ✓ | ✓ "cannot audit what was ignored" | - |

**Bottom Line**: All three models agree that if unfixed, this creates a **systematic loss of strategic feedback** that compounds over time.

---

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `scripts/ingest-audit-file.ts` | Parse audit markdown → triage entries |
| CREATE | `database/migrations/xxx_audit_sd_mapping.sql` | Mapping table schema |
| CREATE | `scripts/recover-missing-audit-items.js` | Import 73 lost items |
| MODIFY | `scripts/create-sd-*.mjs` | Add required metadata fields |
| MODIFY | `database/schema/strategic_directives.sql` | Add new SD types |
| CREATE | `docs/reference/audit-to-sd-pipeline.md` | Document the process |

---

*Synthesis completed: 2025-12-28*
*Triangulation confidence: HIGH (5/5 root causes with 3/3 consensus)*
