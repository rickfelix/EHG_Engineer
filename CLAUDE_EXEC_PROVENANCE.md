<!-- file_content_hash: 58f339174fd0a4b4 -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_EXEC_PROVENANCE.md — EXEC Provenance (dated evidence and rationale)

**Generated**: 2026-09-13 9:29:54 PM
**Protocol**: LEO 4.4.1
**Purpose**: Why each EXEC rule exists — retrospective evidence, incident narratives, measured costs
**Load when**: When you need to know WHY a rule exists, or before proposing to change one

> Every rule in CLAUDE_EXEC.md is IN FORCE regardless of whether its history is read here. This file explains; it does not govern.

---

## EXEC Provenance — dated evidence and rationale (companion)

The retrospective evidence, incident narratives and measured costs behind the EXEC rules. Every rule in CLAUDE_EXEC.md is in force regardless of whether its history is read here; this file explains, it does not govern.

---

### Retrospective anti-patterns — evidence quotes (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-3/FR-4 carve)

**Evidence**: SD-VENTURE-UNIFICATION-001
> "Manual test creation wasted 2-3 hours instead of delegating to testing-agent"

**Evidence**: SD-VENTURE-UNIFICATION-001
> "Zero consultation of retrospectives before implementation (research_confidence_score = 0.00)"

**Evidence**: SD-2025-1020-E2E-SELECTORS (Score: 100)
> "Time spent on workarounds >> time to follow protocol"
> "Multiple workarounds instead of fixing root causes"

**Evidence**: SD-VENTURE-UNIFICATION-001
> "Environmental issues treated as blockers rather than investigation opportunities"

**Evidence**: SD-RECONNECT-014 (Score: 90)
> "Manual: 75% confidence. Tool: 60% confidence (-15% delta)"
> "Manual sub-agent simulation is an anti-pattern"

**Evidence**: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-143 (PAT-LES-947b3fca46cc)
> "US-007's first design (junction + a fresh raw rmSync) reintroduced a hazard class lib/worktree-manager.js's safeRecursiveRm already carries a header dated 2026-05-09 documenting -- a symlink/junction near a worktree deletion, witnessed wiping a repo-root once already. The fix (routing both deletes through safeRecursiveRm) landed only after a pre-existing static guard flagged it as a break in the ONLY required check on main at the time."

---

### Branch hygiene gate — originating incident, health-check script, why-this-matters (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-3/FR-4 carve)

**Evidence from Retrospectives**: SD-STAGE4-UX-EDGE-CASES-001 revealed a feature branch with 14 commits, 450 files, and 13 days of divergence became unsalvageable due to accumulated unrelated changes.

### Why This Matters

- **Prevents unsalvageable branches**: 13-day divergence = 450 file conflicts
- **Isolates SD work**: One SD per branch = clean merges and rollbacks
- **Catches conflicts early**: Regular syncing = smaller conflict resolution
- **Maintains velocity**: Fresh branches = fast PRs and reviews

---

### Multi-instance coordination — worktree commands, quick reference, incident evidence (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-3/FR-4 carve)

**Evidence**: SD-LEO-INFRA-FIX-SESSION-REGISTER-001 retrospective — all 3 fix files were
initially edited at the shared root instead of the SD's worktree, caught only indirectly
when a require-time test loaded the (still-unedited) worktree copy and produced
unexpected results.

**Evidence**: SD-STAGE-09-001 + SD-EVA-DECISION-001 collision - parallel instances caused branch switch during commit, resulting in mixed changes and failed operations.

---

### Dual test requirement — evidence, common mistakes, why-this-matters (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-3/FR-4 carve)

**Evidence**: SD-EXPORT-001 - Tests existed but weren't executed. 30-minute gap between "complete" and validation. SD-EVA-MEETING-002 - 67% E2E failure rate when finally run.

**Common Mistakes** (from SD-EXPORT-001):
- ❌ "Tests exist" ≠ "Tests passed"
- ❌ Running only E2E tests and claiming "all tests passed"
- ❌ Marking SD complete before running any tests
- ❌ Creating handoff without test evidence documentation
- ✅ Run BOTH unit AND E2E tests explicitly
- ✅ Document pass/fail counts in handoff
- ✅ Include screenshots for visual evidence

### Why This Matters
- **SD-EXPORT-001**: 30-minute gap between marking "complete" and discovering tests weren't run
- **SD-EVA-MEETING-002**: 67% E2E failure rate revealed only when tests finally executed

- **Impact**: Testing enforcement prevents claiming "done" without proof


---

*Generated from database: 2026-09-13*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=exec_provenance). Do not hand-edit — edit the DB section and regenerate.*
