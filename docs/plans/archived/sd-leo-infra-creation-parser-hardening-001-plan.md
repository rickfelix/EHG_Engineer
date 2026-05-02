<!-- Archived from: docs/plans/sd-creation-parser-hardening-plan.md -->
<!-- SD Key: SD-LEO-INFRA-CREATION-PARSER-HARDENING-001 -->
<!-- Archived at: 2026-04-24T13:31:06.388Z -->

# SD-creation parser hardening — word-boundary matching and explicit-header precedence in plan and QF parsers

## Type

infrastructure

## Priority

high

## Target Application

EHG_Engineer (SD creation pipeline: `scripts/modules/plan-parser.js`, `scripts/leo-create-sd.js`, `scripts/create-quick-fix.js`)

## Summary

Five defects surfaced across two session-level SD creations on 2026-04-24. All five are a single family: **lazy string matching without word boundaries, and silent fall-through from explicit authored intent to heuristic inference**. The plan parser ignores explicit `## Type` and `## Priority` headers and falls through to keyword inference; the summary extractor truncates multi-paragraph summaries to first-paragraph / 500 chars; the dependency display mapper falls through to `[object Object]` when the shape doesn't include an `.sd_id` field; and the quick-fix risk-keyword matcher uses `.includes('auth')` on raw text, false-matching on "authored", "authoritative", "authentic", and any string containing that substring.

**Concrete evidence from this session:**
- SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001 was authored with explicit `## Type\ninfrastructure` and `## Priority\nhigh`. Parser ignored both, inferred `sd_type=bugfix` from the word "fix" in an incident description, set `priority=medium`. Wrong gate profile (85% vs 80%), wrong handoff count (5 vs 4). Required a LEAD governance bypass with explanatory `bypass_reason` to correct post-creation.
- Description parsed down to 42 words (first paragraph only), fell below the 50-word bugfix quality threshold, triggered auto-enrichment instead of using authored content.
- Dependency display output showed `Dependencies: [object Object]` — the mapper at `leo-create-sd.js:1470` is `(d.sd_id || d)` but our dependency shape uses `.dependency` / `.dependency_id`.
- QF-20260424-336 (attempting to file these exact bugs) was ESCALATED to full SD because the phrase "authored content" in the description contained the substring "auth". That escalation is this SD.

Single pattern. Five manifestations. Consistent root cause.

## Depends On

None. This SD can ship independently of `SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001` and `SD-LEO-INFRA-FIX-CLAUDE-CODE-001`. No runtime coupling; these are creation-time parsers.

## Success Criteria

- **AC1**: Given a plan file with `## Type\n\ninfrastructure` header, `parsePlanFile()` returns `type='infrastructure'`. Heuristic `inferSDType()` is NOT invoked when the explicit header is present and parses to a valid sd_type value.
- **AC2**: Given a plan file with `## Priority\n\nhigh` header, `parsePlanFile()` returns `priority='high'`. Accepts `critical`, `high`, `medium`, `low` (case-insensitive). Unknown values fall back to `'medium'` with a warning on stderr.
- **AC3**: Given a plan file with a `## Summary` section spanning 3+ paragraphs and 1500 chars, `extractSummary()` returns the full section (up to 2000-char cap), not just the first paragraph or first 500 chars.
- **AC4**: Given a dependency object of shape `{type:'sd', dependency:'SD-X-001', dependency_id:'<uuid>'}`, the display mapper at `leo-create-sd.js:1470` prints `SD-X-001` — it reads `.dependency` first, then `.sd_key`, then `.sd_id`, then `.id`, with a JSON stringification fallback instead of `[object Object]`.
- **AC5**: Given a quick-fix description containing the word `authored` (or `authoritative`, `authentic`, `author`), the risk-keyword matcher in `create-quick-fix.js` does NOT flag it as a security risk. The matcher uses word-boundary regex (`\bauth\b` style) or a curated token list, not `.includes()`.
- **AC6**: Given a quick-fix description that legitimately contains `auth` as a whole word (e.g., "fix auth token rotation"), the matcher DOES flag it → Tier 3 escalation, preserving the existing anti-gaming intent.
- **AC7**: Same word-boundary fix applied to all other risk keywords currently using `.includes()` — `migration`, `schema`, `security`, `RLS`, `credentials`. Audit `create-quick-fix.js` end-to-end for substring-match bugs and convert to word-boundary checks in one pass.
- **AC8**: Unit tests cover each of the 5 bugs (6 for AC7): explicit-header precedence, summary full-section extraction, dependency display mapper fallback chain, authored/authoritative/authentic do not escalate, "auth" as word does escalate, all other risk keywords have word-boundary coverage.
- **AC9**: Integration test: round-trip a plan file through `parsePlanFile()` → `leo-create-sd.js` → DB. Assert `sd_type`, `priority`, `description`, `dependencies` match authored intent exactly. No governance-bypass workaround required.

## Scope

### FR1 — Explicit Type/Priority header precedence in plan-parser.js

In `scripts/modules/plan-parser.js`:
- Add `extractExplicitType(content)` — matches `/^##\s+Type\s*\n+\s*([a-z_-]+)/mi`, returns trimmed lowercase value if it is one of `feature|bugfix|infrastructure|database|security|refactor|documentation|orchestrator`, else null.
- Add `extractExplicitPriority(content)` — matches `/^##\s+Priority\s*\n+\s*([a-z]+)/mi`, returns value if in `critical|high|medium|low`, else null (warn on unknown values).
- Update `parsePlanFile()` to return `type: extractExplicitType(content) ?? inferSDType(content)` and add `priority: extractExplicitPriority(content) ?? null` to the returned object.
- Default export map updated to include the new functions.

### FR2 — Full-summary extraction

In `scripts/modules/plan-parser.js:42-60`:
- Change `extractSummary()` to return the full `## Summary` / `## Goal` / `## Executive Summary` section content (joining paragraphs with `\n\n`), capped at 2000 chars (raise from 500). Preserve the markdown-stripping pass.
- If total exceeds 2000 chars, truncate at a paragraph boundary near 2000 with `...` suffix — don't mid-sentence-cut.

### FR3 — Dependency display mapper hardening

In `scripts/leo-create-sd.js:1470`:
- Change the mapper from `(d.sd_id || d)` to a fallback chain: `d.dependency ?? d.sd_key ?? d.sd_id ?? d.id ?? JSON.stringify(d)`.
- Same fix for the console log at line 1497 where `depScan.findings.flatMap(f => f.sdKeys)` is used — verify no similar raw-object fall-through exists.
- Consider extracting a module helper `formatDependencyForDisplay(dep)` so this logic is testable in isolation.

### FR4 — Surface parsed priority in leo-create-sd.js

In `scripts/leo-create-sd.js` (the `--from-plan` handler around line 540-560):
- When `parsed.priority` is set from FR1, pass it through to the SD creation payload. Today the script defaults priority to `'medium'` regardless of plan content.
- Display line at ~559: `console.log(...Type${overrides.typeOverride ? '' : ' (inferred)'}: ${parsed.type})` — mirror for priority: `console.log(...Priority${parsed.priority ? ' (from plan)' : ' (default)'}: ${parsed.priority ?? 'medium'})`.
- Honor `--priority` CLI override if present (parallel to existing `--type` override).

### FR5 — Word-boundary risk-keyword matching in create-quick-fix.js

In `scripts/create-quick-fix.js`:
- Locate the risk-keyword scanner (likely near where it builds the escalation decision). Current pattern is `.includes('auth')`-style substring match.
- Replace with a word-boundary regex: `new RegExp('\\b(' + keywords.join('|') + ')\\b', 'i').test(text)`. Keywords from the existing list (security, auth, schema, migration, RLS, credentials, etc.).
- Concurrent sweep: any other `.includes(keyword)` substring matches in the same scanner → convert to word-boundary regex in one pass.
- Preserve existing escalation behavior for legitimate matches; the test that proves this is AC6.

### FR6 — Unit and integration tests

- `scripts/modules/plan-parser.test.js` — add 4 cases: `extractExplicitType`, `extractExplicitPriority`, `extractSummary` multi-paragraph, updated `parsePlanFile` explicit-over-inferred.
- `scripts/leo-create-sd.test.js` (create or extend) — dependency display mapper fallback chain with 5 different dependency shapes including `[object Object]`-triggering shape from this incident.
- `scripts/create-quick-fix.test.js` (create or extend) — "authored", "authoritative", "authentic" do NOT escalate; "auth token" DOES escalate; repeat for all other risk keywords.
- Integration test `scripts/__tests__/sd-creation-roundtrip.test.js` — temp plan file with explicit `## Type\n\ninfrastructure` + `## Priority\n\nhigh` + multi-paragraph `## Summary`, run through `leo-create-sd.js --from-plan --yes`, assert DB row has exact authored values with no governance_metadata.bypass_reason needed.

## Non-Goals

- NOT changing the plan-file format. The `## Type` / `## Priority` headers are a natural convention already used in several existing plans (and in `docs/plans/cross-signal-claim-liveness-plan.md` from this session). This SD adds parser support for what operators already write.
- NOT changing the anti-gaming semantics on type-change after SD creation. That trigger (blocking type changes to lower thresholds) remains intact. FR1's scope is plan-file → creation-time type, not post-creation mutation.
- NOT modifying `inferSDType()` keyword lists. Heuristic inference stays exactly as-is; it's the fallback when no explicit header. This SD only changes precedence.
- NOT re-opening QF-20260424-336. That QF is marked ESCALATED and links to this SD as the escalation destination — audit trail preserved.
- NOT sweeping the rest of the codebase for `.includes()` substring matches. FR5 is scoped to `create-quick-fix.js` only. A broader audit may be warranted later; out of scope here.
- NOT changing sd_key generation. The generated key for this SD will be whatever the generator produces; we're not touching that logic.

## Key Technical Decisions

**Why explicit-header precedence instead of "always ask"**: operators who author a plan file have already made the decision. Keyword inference is for plans that don't declare type. Current code inverts this: inference runs always, and there's no way to declare. Precedence is the correct default.

**Why 2000-char summary cap instead of unlimited**: description quality-gates have a max length; unlimited lets a rambling summary blow past it and fail a different gate. 2000 chars handles all observed plans including the 195-word description for SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001. If we hit the cap, truncate at paragraph boundary so the reader isn't cut mid-sentence.

**Why the fallback chain order `.dependency → .sd_key → .sd_id → .id`**: matches actual field usage. `.dependency` is the human-readable key used by `dependencies` column today (seen in SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001). `.sd_key` is the alternative canonical name. `.sd_id` was the mapper's existing assumption. `.id` is the UUID fallback. `JSON.stringify(d)` as last resort so the reader sees raw shape on malformed input, not `[object Object]`.

**Why word-boundary regex instead of token list**: word-boundary regex is a single-line fix that preserves the existing keyword list and its governance intent. A curated token list would be an API refactor and would need its own SD.

**Why bundle all 5 bugs in one SD**: shared root cause (lazy string matching + silent fall-through), shared test file pattern, shared review cycle. Five separate QFs would be higher handoff overhead with no isolation benefit. Ironically, QF-20260424-336 already attempted to bundle 4 of them as a QF and was escalated by bug #5 — proving the bundling judgment.

## Supporting Evidence

- **Primary incident (this session, 2026-04-24)**: all 5 bugs reproduced live while creating `SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001`. See session transcript and DB row `strategic_directives_v2.id=18677532-73ff-487a-b9e4-0110231df1f8` for the post-creation governance bypass that corrected the parser's mis-inference.
- **Seed record**: `QF-20260424-336` (status=ESCALATED) — the quick-fix that tried to file bugs 1-4 as a Tier 2 QF but was auto-escalated by bug #5. Its description field contains the detailed reproduction steps.
- **Existing parser source**: `scripts/modules/plan-parser.js` lines 42-60 (summary truncation), lines 129-178 (inferSDType with no explicit-header check), `parsePlanFile()` at lines 300-326 (returns inferred type only, no priority field).
- **Existing display bug**: `scripts/leo-create-sd.js:1470` — mapper `(d.sd_id || d)` falls through to raw-object stringification.
- **Plan file convention already exists**: `docs/plans/cross-signal-claim-liveness-plan.md`, `docs/plans/retrospective-gates-hard-fail-plan.md`, `docs/plans/qf-lifecycle-reconciliation-plan.md`, and multiple archived plans all use `## Type` / `## Priority` headers. The convention is established; only the parser ignores it.
- **Related pattern in memory**: `feedback_learn_creates_duplicate_sds.md` and `feedback_uat_agent_creates_duplicate_qfs.md` document other SD/QF creation-path quality gaps. This SD focuses on the parser layer specifically.

## Vision Alignment

Supports **O-GOV-1 (Foundation Cleanup)** and **O-GOV-2 (LEO Intelligence Integration)**. SD creation is the upstream boundary of every downstream LEO workflow. When parsers drop authored intent and fall through to heuristics, every downstream gate (quality thresholds, handoff counts, sub-agent requirements) operates on wrong premises. Fixing this upstream eliminates a class of LEAD governance bypasses required purely to correct parser drift — improving trust in the automated creation path and reducing manual intervention.

## Risks

- **Risk**: FR1 could break plans that accidentally include `## Type` headers with non-sd_type values (e.g., `## Type of change`). **Mitigation**: `extractExplicitType()` validates against the allowed sd_type enum; unknown values fall through to `inferSDType()`. Existing plans without the header are unaffected.
- **Risk**: FR5 word-boundary regex may false-negative on hyphenated forms like `re-authentication` or `auth-token` (word boundary inside hyphenated compound). **Mitigation**: add `-` to word-boundary regex: `[\s\W][-\s\W]*(auth|security|...)[\-\s\W]` OR use a token-aware tokenizer. Tests in AC5/AC6 explicitly cover this.
- **Risk**: Increased parsing surface area in plan-parser.js raises the chance of future regressions. **Mitigation**: FR6 adds unit tests for every new function. The round-trip integration test catches composite failures.
- **Risk**: FR4 (honor `--priority` CLI override) changes the CLI contract slightly. **Mitigation**: additive flag, backward-compatible. Existing invocations without `--priority` continue to default to `'medium'`.
- **Risk**: This SD touches the SD-creation path itself, so a regression here could block future SD creation. **Mitigation**: the round-trip integration test runs as part of CI; any regression blocks merge. Also: canary the changes by creating 1-2 test SDs immediately post-merge on a dedicated branch before main.

## Estimated Scope

~150-200 LOC across:
- `scripts/modules/plan-parser.js` — +60 LOC (two extract functions, parsePlanFile wiring, extractSummary expansion)
- `scripts/leo-create-sd.js` — +15 LOC (dependency mapper fix, priority pass-through, display updates, --priority CLI flag)
- `scripts/create-quick-fix.js` — +20 LOC (word-boundary regex replacement, any parallel fixes)
- `scripts/modules/plan-parser.test.js` — +50 LOC tests
- `scripts/create-quick-fix.test.js` — +30 LOC tests
- `scripts/__tests__/sd-creation-roundtrip.test.js` — +50 LOC integration test

Tier 3 per CLAUDE.md Work Item Routing (>75 LOC and touches creation hot path). Infrastructure workflow: 4 handoffs (skip EXEC-TO-PLAN), 80% gate threshold. DOCMON not strictly required (no CLAUDE_CORE.md invariants changed); REGRESSION sub-agent recommended given the breadth of test coverage.
