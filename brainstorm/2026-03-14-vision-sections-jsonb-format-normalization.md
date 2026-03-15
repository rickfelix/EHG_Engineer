# Brainstorm: Vision Sections JSONB Format Normalization

## Metadata
- **Date**: 2026-03-14
- **Domain**: Architecture
- **Phase**: Decide
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Board of Directors (6/6 seats)
- **Related Ventures**: None (infrastructure/protocol improvement)
- **Chairman Review**: 2 items reviewed, 2 accepted, 0 flagged, 0 research-needed

---

## Problem Statement
The `vision-command.mjs` auto-parser stores vision document sections in a JSONB column using keys derived from markdown headings. The database quality trigger (`auto_validate_vision_quality`) validates against 10 standard snake_case keys. When the parser's 3-level mapping system (exact→fuzzy→auto-slug) fails to match a heading, the auto-slug produces subtly wrong keys (e.g., `uiux_wireframes` instead of `ui_ux_wireframes`). The quality trigger then reports "0 of 10 standard sections present" with zero diagnostic information about what keys ARE present — making it look like a content problem when it's actually a format problem.

## Discovery Summary

### Current Architecture
- **Parser**: `markdown-to-sections-parser.mjs` — 3-level mapping: (1) exact lookup from `document_section_schemas` DB table, (2) fuzzy substring match, (3) auto-slug regex
- **Schema registry**: `document-section-registry.mjs` — queries DB for canonical mappings, with hardcoded fallback
- **Quality trigger**: `auto_validate_vision_quality()` — checks sections against 10 hardcoded snake_case keys
- **Downstream consumers**: `leo-create-sd.js`, `backfill-uncovered-phases.js`, `create-orchestrator-from-plan.js`, `translation-fidelity-gate.js` — all expect snake_case keys

### Root Cause
The auto-slug (Level 3 fallback) uses a regex that strips special characters and replaces spaces with underscores, but doesn't handle cases like:
- `UI/UX` → `uiux` (slash stripped, no separator inserted) instead of `ui_ux`
- Heading supersets (e.g., "Key Decision Points and Tradeoffs") → auto-slug doesn't match `key_decision_points`

### Fix Options Evaluated
- **Option A**: Fix parser only (normalize at write time)
- **Option B**: Fix trigger only (normalize at validate time)
- **Option C**: Both — parser guarantees snake_case output, trigger provides diagnostic error messages (board recommendation)

## Analysis

### Arguments For (Option C: Both Parser + Trigger Diagnostics)
- Defense in depth — parser prevents bad data from entering; trigger catches anything that slips through
- Diagnostic error messages eliminate 30-minute investigations — "found keys: X, Y; expected: A, B" vs. "0 of 10 present"
- Low cost (~50 LOC) with high leverage — affects every vision document registration
- Already-built infrastructure — 3-level mapping exists, just needs the auto-slug edge cases fixed

### Arguments Against
- Trigger normalization risks masking upstream bugs (mitigated: trigger diagnoses but doesn't normalize keys)
- DB migration required for trigger change — adds deployment step (mitigated: small, well-scoped migration)

## Architecture: Tradeoff Matrix

| Dimension | Weight | Option A (Parser Only) | Option B (Trigger Only) | Option C (Both) |
|-----------|--------|----------------------|------------------------|----------------|
| Complexity | 20% | 8/10 — Simple | 6/10 — Conflates validation/mutation | 7/10 — Two small changes |
| Maintainability | 25% | 6/10 — Single defense layer | 5/10 — Trigger masks upstream bugs | 9/10 — Clear separation of concerns |
| Performance | 20% | 9/10 — No trigger change | 7/10 — Trigger does extra work | 8/10 — Minimal overhead |
| Migration effort | 15% | 9/10 — Code-only | 6/10 — DB migration | 7/10 — Code + small migration |
| Future flexibility | 20% | 5/10 — Other write paths unprotected | 7/10 — Catches all sources | 9/10 — Defense in depth |

**Weighted Scores**: A: 7.25 | B: 6.15 | **C: 8.10** (Winner)

## Board of Directors Deliberation

### Round 1: Board Positions

| Seat | Standing Question | Position Summary |
|------|------------------|-----------------|
| CSO | Does this move EHG forward or sideways? | Forward — systemic reliability defect in LEO pipeline. Option C delivers defense in depth. Tier 2 fix. |
| CRO | What's the blast radius if this fails? | Cascading — wrong keys silently poison 4+ downstream consumers. Option C is the only defensible choice. |
| CTO | What do we already have? What's the real build cost? | 25-35 LOC total. Auto-slug needs special char handling. Sequence: parser first, trigger second. |
| CISO | What attack surface does this create? | Silent quality bypass = data integrity vulnerability. Defense in depth non-negotiable. |
| COO | Can we actually deliver this given current load? | Tier 2 QF, 30-50 LOC. Leaving unfixed = every brainstorm→vision run is a coin flip. |
| CFO | What does this cost and what's the return? | ~50 LOC with outsized ROI. NOT fixing = recurring tax on every vision registration. |

### Expertise Gaps Flagged
- **CSO**: Audit of existing malformed records — one-time backfill migration may be needed
- **CRO**: Other write paths beyond vision-command.mjs could produce non-snake_case keys
- **CTO**: PL/pgSQL trigger modification should use database sub-agent (trigger ordering documented in MEMORY.md)
- **CISO**: Check if RLS policies consume section keys in access-control decisions

### Judiciary Verdict
- **Board Consensus**: 6/6 seats agree on Option C (both parser + trigger diagnostics)
- **Key Tensions**: None — unanimous
- **Constitutional Citations**: DB-first principle (PROTOCOL) supports fixing at both layers
- **Recommendation**: Proceed as Tier 2 QF, Option C
- **Escalation**: No — no chairman override needed

## Open Questions
- How many existing vision documents have malformed section keys? (one-time audit needed)
- Are there write paths beyond `vision-command.mjs` that produce sections JSONB? (CRO concern)
- Does `archplan-command.mjs` have the same auto-slug bug? (CTO flagged for consistency)

## Suggested Next Steps
1. Create SD for Option C implementation (~50 LOC)
2. Parser fix: improve auto-slug in `markdown-to-sections-parser.mjs` to handle `/` and other special chars
3. Trigger fix: add actual-vs-expected key comparison in `auto_validate_vision_quality()` error message
4. One-time backfill: audit and fix existing malformed records
5. Apply same fix to `archplan-command.mjs` for consistency
