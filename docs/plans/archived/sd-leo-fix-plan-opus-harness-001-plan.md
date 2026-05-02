<!-- Archived from: docs/plans/opus47-harness-alignment-plan.md -->
<!-- SD Key: SD-LEO-FIX-PLAN-OPUS-HARNESS-001 -->
<!-- Archived at: 2026-04-24T18:52:07.475Z -->

# SD Plan — Opus 4.7 Harness Alignment (Modules B, A-partial, F, G-CLAUDE.md)

## Type
infra

## Priority
high

## Problem

Migration from Claude Opus 4.6 → 4.7 introduced documented behavioral shifts (Anthropic source: *"A prompt and harness review may be especially helpful for migration to Claude Opus 4.7"*). Specifically:

- **Literal instruction adherence** — hedges ("typically", "ideal", "consider", "should") now weaken rules
- **Implicit conventions don't carry** — "user approved SD at LEAD" no longer implies pre-authorized phase transitions
- **Fewer sub-agent spawns by default** — prompt-level "use sub-agents" guidance is opt-out under 4.7 literalism
- **Strict effort calibration** — phases without explicit effort tags under-think on 4.7 medium default

In a 48-hour window (2026-04-22 → 2026-04-24), 5 confirmation-fishing incidents (Category A) and 5 sub-agent skip incidents (Category B) were observed, directly attributable to these shifts against the current protocol wording.

**Previous session (2026-04-24) analyzed the problem and prepared exact replacement language, but applied edits directly to generated files (`CLAUDE.md`, `CLAUDE_CORE/LEAD/PLAN/EXEC.md`), violating the DB-is-source-of-truth invariant.** Those direct edits were reverted. This SD migrates the intended changes through the correct path: DB row updates + generator code changes + regeneration.

## Scope Context

The CLAUDE.md family is assembled by `scripts/generate-claude-md-from-db.js`, which:

1. Queries `leo_protocols` (active row) and `leo_protocol_sections` (ordered by `order_index`, keyed by `protocol_id`)
2. Maps section slugs → target files via `scripts/section-file-mapping.json`
3. For some router-level summary content, inlines assembly logic in `scripts/modules/claude-md-generator/file-generators.js` (and `digest-generators.js`)

**Source of each required change:**

| Change | Source |
|---|---|
| Module B (Canonical Pause Points at top of CLAUDE.md) | Router code in `file-generators.js::generateRouter()` — condensed summaries are inlined (per `_removed_sections_note` in section-file-mapping.json). Requires code change. |
| Module G (Session Mode Declaration in CLAUDE.md) | New addition — add new `leo_protocol_sections` row OR inline in `generateRouter()`. Prefer inline to stay consistent with adjacent auto-proceed-mode content. |
| Module A CLAUDE.md fixes (`typically 85%`, `Use sub-agents`, `≤100 LOC ideal`) | `session_prologue` section row in `leo_protocol_sections` — UPDATE content |
| Module A CLAUDE_LEAD.md fix (`Consider using /quick-fix`) | LEAD section row (likely `sd_evaluation` or `lead_operations` — verify via SELECT) |
| Module A CLAUDE_PLAN.md fix (`consider launching multiple Plan agents`) | `plan_multi_perspective` section row in `leo_protocol_sections` |
| Module F (Effort tags in phase file headers) | Inlined in `file-generators.js` file-header generation for each phase generator (`generateCore`, `generateLead`, `generatePlan`, `generateExec`) |

## Functional Requirements

### FR-1 — Module B: Canonical Pause Points at top of CLAUDE.md

Insert the following section in CLAUDE.md immediately after Prime Directive and before Issue Resolution. Implement via `file-generators.js::generateRouter()` by adding a new block after the Prime Directive emit and before Issue Resolution emit.

**Exact content:**

```markdown
## Canonical Pause Points — THE ONLY REASONS TO STOP

AUTO-PROCEED is ON by default. You continue through phase transitions, PRD creation, decomposition, refactors, scope-lock boundaries, and anything else NOT on this list:

1. **Orchestrator completion** — after all children complete, pause for /learn review (only when Chaining is OFF; see SD Continuation Truth Table)
2. **Blocking error requiring human decision** — merge conflicts, ambiguous requirements escalated from EXEC
3. **Test failures after 2 retry attempts** — auto-retry exhausted, RCA sub-agent invoked before pause
4. **All children blocked** — no ready work remains, human decision required
5. **Critical security or data-loss scenario** — includes DB/code status mismatch (code shipped but DB shows incomplete)

**NOT pause triggers — reasoning about any of these as a pause justification is a protocol violation:**
- Scope size, "substantial upcoming work", decomposition into children
- PRD creation, large refactors, phase boundaries
- Context or conversation length ("context is getting long")
- Any "warrants confirmation" / "want me to continue?" rationalization
- Numbered menu presentations at decision points
- Intent to provide a "status checkpoint" after a successful handoff

If your reason for pausing is not on the five-point list above, KEEP WORKING. When in doubt: pick the highest-value option, state it in one sentence, and execute.

> Why: Opus 4.7 interprets instructions literally — implicit "the user approved the SD at LEAD" inferences do not auto-extend across downstream phase boundaries unless enumerated. Confirmation-fishing is the most common AUTO-PROCEED failure mode. This section is canonical; any other doc that conflicts defers to the five-point list here.
```

**Simultaneously**, in the AUTO-PROCEED Mode section (also in `generateRouter()`), REPLACE the existing inlined pause-points block with this pointer:

```markdown
**Canonical Pause Points**: see the enumerated list near the top of this file (section "Canonical Pause Points — THE ONLY REASONS TO STOP"). Those five points are the complete set; all other transitions continue under AUTO-PROCEED.
```

### FR-2 — Module G: Session Mode Declaration in CLAUDE.md

Insert the following section in CLAUDE.md between the AUTO-PROCEED Mode section and the SD Continuation section. Implement via `file-generators.js::generateRouter()`.

**Exact content:**

```markdown
## Session Mode Declaration

Sessions operate in one of two modes that govern how you treat harness bugs (LEO-INFRA issues, gate bugs, session lifecycle drift, tooling constraints) encountered mid-work:

- **`[MODE: product]`** — Shipping product work (features, marketing, research, domain code). Harness bugs found mid-session are captured one-line to `docs/harness-backlog.md` and deferred. Do NOT file `SD-LEO-INFRA-*` / `SD-LEARN-FIX-*` / `SD-MAN-INFRA-*` / `QF-*` during product sessions.
- **`[MODE: campaign]`** — Running a harness-hardening sweep. Harness bugs ARE the work; file SDs/QFs and fix inline as they surface. High meta-to-product SD ratios are expected campaign output, not pathology.

**Default mode when the user has not declared:**
- Current SD matches `SD-LEO-*` / `SD-LEARN-FIX-*` / `SD-MAN-INFRA-*` / `QF-*` → **campaign mode**
- Current SD is any other type → **product mode**
- No SD claimed and user intent is ambiguous → ask the user once; otherwise default to **product mode**

> Why: Opus 4.7 reads instructions literally and resists rationalizing around countable rules. Without a declared mode, implicit "is this harness work or product work" inference drifts, causing product sessions to get consumed by opportunistic meta-work. The mode declaration turns user intent into a literal switch — product sessions defer, campaign sessions fix inline, no judgment calls in between.

User may override at any point by stating `[MODE: product]` or `[MODE: campaign]` in the conversation. Most recent declaration wins. If mode is unclear at the start of substantive work, state the mode you've inferred in one sentence before proceeding (e.g., *"Treating this as [MODE: product] — current SD is SD-EHG-MARKETING-..."*).
```

Plus create `docs/harness-backlog.md` as an empty/placeholder file with a header explaining its purpose (referenced by `[MODE: product]`).

### FR-3 — Module F: Phase Effort Tags

Modify the file-header generation in `scripts/modules/claude-md-generator/file-generators.js` to append an `**Effort**:` line after the `**Purpose**:` line in each phase-file generator.

**Exact additions:**

| Generator | After Purpose line, add |
|---|---|
| `generateCore` | `**Effort**: medium (core context; phase-specific files tag their own effort for phase work)` |
| `generateLead` | `**Effort**: high (strategic framing, scope bounding, and sub-agent routing require full reasoning depth)` |
| `generatePlan` | `**Effort**: high (architecture decisions and PRD rubrics require full reasoning depth)` |
| `generateExec` | `**Effort**: xhigh (implementation + testing require maximum reasoning for agentic coding per Opus 4.7 guidance)` |

Also apply the same additions in `digest-generators.js` for the corresponding `*Digest` generators, to keep DIGEST and FULL outputs consistent.

### FR-4 — Module A: Hedge Audit (first-pass, 5 targets)

UPDATE specific rows in `leo_protocol_sections` (or inline router code, as source requires). Each replacement is surgical — match the old text exactly, replace with new.

**Replacement pairs:**

**A1 — Session Prologue, gate pass rate:**
- Find: `1. **Follow LEAD→PLAN→EXEC** - Target gate pass rate varies by SD type (60-90%, typically 85%)`
- Replace: `1. **Follow LEAD→PLAN→EXEC** - Target gate pass rate: 85%. SD-type overrides (60-90% range) require documented justification per CLAUDE_LEAD.md.`
- Source: `session_prologue` section

**A2 — Session Prologue, sub-agent rule:**
- Find:
  ```
  2. **Use sub-agents** - Architect, QA, Reviewer - summarize outputs
  > Why: Sub-agents run formal, database-backed gate checks stored in `sub_agent_execution_results`. Handoff gates query this table — without sub-agent runs, gates block regardless of actual code quality.
  ```
- Replace:
  ```
  2. **Sub-agent evidence required at every handoff** - Invoke required agents via the Task tool before running `handoff.js execute`. Each agent writes to `sub_agent_execution_results`; handoff blocks with `SUBAGENT_EVIDENCE_MISSING` if no fresh row exists for the current phase. Manual DB checks are not evidence.
  > Why: Gates query `sub_agent_execution_results` for formal, database-backed validation. Opus 4.7 defaults to fewer sub-agent spawns — this rule makes invocation a hard requirement, not a best practice. Prompt-level "should use sub-agents" is not enforceable; the row is.
  ```
- Source: `session_prologue` section

**A3 — Session Prologue, PR size:**
- Find: `5. **Small PRs** - ≤100 LOC ideal; up to 400 LOC with justification per tiered PR Size Guidelines`
- Replace: `5. **Small PRs** - ≤100 LOC target. Exceed only with documented justification (max 400 LOC) per tiered PR Size Guidelines.`
- Source: `session_prologue` section

**A4 — LEAD Quick Fix suggestion:**
- Find: `Consider using /quick-fix to reduce overhead.`
- Replace: `Use /quick-fix to reduce overhead.`
- Source: LEAD section row (likely `sd_evaluation` or `lead_operations`; verify via `SELECT section_slug, content FROM leo_protocol_sections WHERE content ILIKE '%Consider using /quick-fix%'`)

**A5 — PLAN multi-perspective preamble:**
- Find: `Before creating a PRD, consider launching multiple \`Plan\` agents to explore different approaches:`
- Replace: `Before creating a PRD, launch \`Plan\` agents to explore different approaches when the criteria below apply. Skip only for trivial bug fixes, typo changes, or single-approach tasks where the design is unambiguous:`
- Source: `plan_multi_perspective` section

## Technical Approach

1. **Pre-flight DB introspection:**
   ```sql
   SELECT id, section_slug, section_title, order_index
   FROM leo_protocol_sections
   WHERE protocol_id = (SELECT id FROM leo_protocols WHERE status = 'active')
   AND (
     section_slug IN ('session_prologue', 'plan_multi_perspective')
     OR content ILIKE '%Consider using /quick-fix%'
   );
   ```

2. **Write a migration script** `database/migrations/YYYYMMDD_opus47_harness_alignment.sql` (or `.mjs`) that:
   - UPDATEs each matched row with the new content (using multi-line parameterized strings)
   - INSERTs new section rows for Module G mode declaration (if we decide DB-row rather than inline)
   - Logs each change with before/after content hashes

3. **Modify `scripts/modules/claude-md-generator/file-generators.js`:**
   - Add Module B pause-points block emission in `generateRouter()` after Prime Directive and before Issue Resolution
   - Replace the original inlined pause-points block in AUTO-PROCEED Mode with the pointer
   - Add Module G mode declaration block emission between AUTO-PROCEED Mode and SD Continuation
   - Add `**Effort**:` lines in each of `generateCore`, `generateLead`, `generatePlan`, `generateExec`

4. **Mirror the generator-code changes in `digest-generators.js`** for consistency with DIGEST variants.

5. **Create `docs/harness-backlog.md`** as a new top-level backlog file.

6. **Run regen + diff-review:**
   ```bash
   # Before regen: stash any unrelated working-tree changes
   git stash push -m "pre-regen stash" --include-untracked

   # Regenerate
   node scripts/generate-claude-md-from-db.js

   # Diff-review — reset unrelated files to origin/main per feedback_claude_md_regen_bundles_db_drift.md
   git diff CLAUDE.md CLAUDE_CORE.md CLAUDE_LEAD.md CLAUDE_PLAN.md CLAUDE_EXEC.md
   git checkout origin/main -- <any-file-with-unrelated-drift>
   ```

7. **Verify:**
   - `CLAUDE.md` contains `## Canonical Pause Points — THE ONLY REASONS TO STOP` near the top
   - `CLAUDE.md` contains `## Session Mode Declaration`
   - `CLAUDE_LEAD.md`, `CLAUDE_PLAN.md`, `CLAUDE_EXEC.md`, `CLAUDE_CORE.md` all have `**Effort**:` lines
   - All 5 Module A old-strings are absent from the generated files
   - All 5 Module A new-strings are present

## Scope

**in_files:**
- `scripts/modules/claude-md-generator/file-generators.js`
- `scripts/modules/claude-md-generator/digest-generators.js`
- `database/migrations/YYYYMMDD_opus47_harness_alignment.sql` (new)
- `docs/harness-backlog.md` (new)
- `tests/claude-md-generator/opus47-alignment.test.mjs` (new regression test)

**Expected regenerated (by running the script):**
- `CLAUDE.md`, `CLAUDE_CORE.md`, `CLAUDE_LEAD.md`, `CLAUDE_PLAN.md`, `CLAUDE_EXEC.md` (and DIGEST variants)

**out_files:**
- Any file outside the above list
- Memory files in `~/.claude/...` (do not modify as part of this SD; those are session-owned)

## Acceptance Criteria

1. Migration script runs cleanly on a fresh snapshot; no rows duplicated or content lost.
2. `node scripts/generate-claude-md-from-db.js` produces the expected CLAUDE.md family with all FRs satisfied.
3. Regression test `opus47-alignment.test.mjs` asserts all Module A, B, F, G invariants hold on the generated output.
4. No unrelated drift committed — only the 5 files above + new migration + new test.
5. `node scripts/hooks/protocol-compaction-hook.cjs record` runs successfully post-merge (harness re-read signal).
6. `docs/harness-backlog.md` exists as a referenced target for `[MODE: product]` backlog captures.

## Non-Goals

- Full hedge-audit pass across all sections (this SD covers 5 targets only; the full pass is a follow-up SD).
- Modules C, D, E (sub-agent evidence gate, memory validation frontmatter, scope gate pre-commit) — those are separate SDs.
- The `/learn` noise filter (`docs/plans/learn-noise-filter-plan.md`) — separate SD.
- The MEMORY.md re-index (`docs/plans/memory-reindex-plan.md`) — separate SD.

## References

- Prior session state: `.claude/session-module-refactor-opus47.md` (full 7-module analysis)
- Anthropic migration guidance: https://claude.com/blog/best-practices-for-using-claude-opus-4-7-with-claude-code
- Memory: `feedback_claude_md_generated_from_db.md` (the rule this SD upholds)
- Memory: `feedback_claude_md_regen_bundles_db_drift.md` (drift mitigation procedure)
- Memory: `user_auto_proceed_intent.md` (user's intent around Module B pause points)

## Size Estimate

250–350 LOC across migration + generator code + test. Tier 3 — full SD workflow per CLAUDE.md Work Item Routing.
