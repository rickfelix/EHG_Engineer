# Session State — SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001

Worker session 9a78de7f-f379-460a-8a47-b2e5e5c5618f. Worktree branch
feat/SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001.

## LEAD phase

As-submitted premise: parallel fleet worker sessions hand-edit the single CHANGELOG.md at merge
time, colliding nearly every merge. LEAD independently corroborated this firsthand — resolving
PR #7502 (the prior SD's CHANGELOG entry) required a manual git conflict resolution against a
concurrent session's entry, same day.

But the as-submitted PLAN (a new per-SD changelog-fragment-file + assembler subsystem) was
re-scoped after measurement: a VALIDATION sub-agent (dispatched at LEAD) built an isolated git
fixture and found `.gitattributes CHANGELOG.md merge=union` resolves the exact reported conflict
shape cleanly, with zero new infrastructure. LEAD independently reproduced this before accepting
it. Scope corrected from a multi-file new subsystem down to a 1-line git config change + a
regression fixture + a light doc note (scripts/one-off/changelog-contention-parallel-001-lead-*.mjs).

## PLAN phase

PLAN-phase TESTING sub-agent ran 12 real isolated-repo git scenarios and found LEAD's own
precondition claim was WRONG: LEAD wrote "the attribute must be in the git merge-base commit,"
but the real mechanism is "git reads .gitattributes from the CHECKED-OUT (ours) side's working
tree/history AT MERGE TIME, not the merge-base." PLAN independently re-verified this with its own
decisive reproduction (two isolated experiments, both confirming the correction) before accepting
it and correcting the SD record + PRD content
(scripts/one-off/changelog-contention-parallel-001-plan-precondition-correction.mjs,
-prd-testing-corrections.mjs). Also corrected: TS-3 split into TS-3a (theirs-only still
conflicts) / TS-3b (ours-only resolves cleanly) since the original single TS-3 was ambiguous
between two readings with opposite expected outcomes.

## EXEC phase

Implemented all 3 FRs:
- FR-1: `.gitattributes` — `/CHANGELOG.md merge=union` (anchored to root per SECURITY finding),
  documented with the corrected precondition and the accepted residual risk (same-entry-reword
  silent duplication).
- FR-2: `tests/unit/changelog-merge-union.test.js` — 5 tests using real isolated temp git repos
  (mkdtempSync + realpathSync + scrubGitEnv from lib/fleet/source-tree-refresh.cjs), reusing the
  repo's existing realgit fixture pattern.
- FR-3: one-line note in `.claude/commands/document.md` confirming the protection is in place, no
  fragment-path migration needed.

**EXEC-phase TESTING sub-agent (mutation testing, not just reading)**: deleted the real
.gitattributes line and reran the suite — all 4 original tests still passed, since none of them
read the real repo's .gitattributes, only their own isolated fixture repos. Independently
re-verified this gap myself before fixing. Added a 5th test (`git check-attr merge -- CHANGELOG.md`
against the real repo) that genuinely fails when the real line is removed (re-verified). Also
fixed: TS-3a's assertion strengthened from a bare throw-check to the specific `UU CHANGELOG.md`
status (it was previously satisfiable by any merge failure); removed a dangerous unused
`cwd = root` default on the test's git() helper (root was never assigned, so an omitted cwd would
have fallen back to process.cwd() — the live repo — though no call site actually omitted it).

**EXEC-phase SECURITY sub-agent (PASS, confidence 93, zero CRITICAL/HIGH/MEDIUM)**: verified
scrubGitEnv coverage empirically (ran the suite under a poisoned env with a negative control
proving the poison was potent and the scrub neutralized it), verified no command/argument
injection risk (array-form execFileSync throughout, zero shell interpolation), verified the 5
LEAD/PLAN one-off correction scripts scope their UPDATEs to a single row by primary key. Two LOW
findings, both fixed: (1) the `.gitattributes` pattern was unanchored (`CHANGELOG.md` matches any
depth, not just root) — anchored to `/CHANGELOG.md`; (2) temp-dir cleanup registration happened
after `initRepo()` returned rather than immediately after `mkdtempSync` succeeded, leaving a
window where a throw during repo setup could leak an unregistered dir — moved the registration
inside `initRepo()`.

## Pending follow-up (route via capture-completion-flags at post-completion, NOT in this SD's
## scope — do not silently fold into this diff)
- TESTING's W3/W4/W5 (non-blocking test-coverage polish: near-tautological heading-count
  assertion in TS-2; missing coverage for ".gitattributes exists but doesn't reference
  CHANGELOG.md"; missing coverage for the both-sides-add-a-new-date-section shape /document
  actually produces) — deferred as a possible future QF, not urgent enough to reopen this SD's
  already-corrected minimal scope.
- document.md's note doesn't mention the accepted same-entry-reword silent-duplication risk that
  the .gitattributes comment discloses — small doc-completeness gap, low priority.
- SECURITY's residual note: the scrub deliberately does not neutralize global git hooks config
  (documented, pre-existing, unrelated to this SD).
- Pre-existing, unrelated stale doc found during LEAD's Explore evidence: `.claude/commands/document.md`'s
  "Release Documentation (GStack Patterns)" example block uses `## [Unreleased] / ### Features`
  format, which does not match this repo's real live CHANGELOG.md format (`## YYYY-MM-DD` /
  `### Category`). Not touched by this SD (out of scope, unrelated to the merge=union fix).
