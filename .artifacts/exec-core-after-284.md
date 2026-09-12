## Branch Hygiene Gate (MANDATORY)

**Evidence**: the SD-STAGE4-UX-EDGE-CASES-001 unsalvageable-branch incident, in PROVENANCE. (procedure: MANUAL § Branch hygiene gate — originating incident, health-check script, why-this-matters)

### MANDATORY Before PLAN-TO-EXEC Handoff

EXEC MUST verify these branch hygiene requirements BEFORE starting implementation:

### 1. Branch Freshness (≤7 Days Stale)

```bash
# Check days since branch diverged from main
git log main..HEAD --oneline | wc -l  # Should be reasonable
git log --oneline main..HEAD --format="%ar" | tail -1  # Check age
```

**Threshold**: Feature branch must be ≤7 days stale at PLAN-TO-EXEC handoff
**Action**: If exceeded, rebase or merge main before proceeding
> Why: Branches older than 7 days accumulate merge conflicts at an accelerating rate. Beyond 14 days, the conflict surface area exceeds what an LLM can safely resolve in one session — the SD-STAGE4 incident demonstrated that a 13-day branch became unsalvageable.

### 2. Single-SD Branch Rule (No Mixing)

```bash
# All commits should reference the same SD-ID
git log main..HEAD --oneline | grep -E "SD-[A-Z0-9-]+"
```

**Rule**: One SD per branch - no mixing unrelated work
**Anti-Pattern**: "Kitchen sink" branches that accumulate work from multiple SDs
**Action**: If multiple SDs detected, create separate branches
> Why: Mixed-SD branches make rollbacks impossible and confuse the review-gate risk scorer. A single-SD branch means any revert is safe — reverting a mixed branch would silently undo unrelated shipped work.

### 3. Merge Main at Phase Transitions

**At PLAN-TO-EXEC**:
```bash
git fetch origin main
git merge origin/main --no-edit  # Or rebase if preferred
```

**Rule**: Sync with main at each phase transition (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN)
> Why: Phase transitions are natural synchronization points — the branch is stable, tests are passing, and a PR review window just occurred. Syncing here keeps conflict resolution small and predictable rather than deferred to an explosive final merge.
**Benefit**: Catches conflicts early, prevents accumulation

### 4. Maximum Branch Lifetime (14 Days)

| Age | Action |
|-----|--------|
| 0-7 days | ✅ Proceed normally |
| 7-10 days | ⚠️ Warning - sync with main |
| 10-14 days | 🔴 Must sync before any handoff |
| >14 days | ❌ Create fresh branch, cherry-pick changes |

### 5. When a PR Goes CONFLICTING (Post-Push)

QF-20260904-004: `git push --force-with-lease` is denied by the Claude Code auto-mode classifier
before any repo-side check runs -- a worker seat cannot complete a REBASE-and-force-push cycle on
its own branch, so a CONFLICTING PR strands until a bypass-permissions seat pushes for it.

**DEFAULT (no force-push ever needed): merge-from-main on the SAME branch.**
```bash
git fetch origin main
git merge origin/main   # resolve any conflicts locally, then:
git add -A && git commit
git push   # plain push -- the branch's existing commits are untouched, so this is a fast-forward for origin, never a force-push
```
This is why item 3 above ("Merge Main at Phase Transitions") already says `git merge`, not
`rebase`, as the primary form -- a merge commit is the tradeoff (non-linear branch history), and
it is accepted here specifically because it keeps the worker unblocked without any human seat.

**ESCAPE HATCH (only if a genuine rebase/linear-history is required, or the merge itself cannot
be resolved cleanly): replay as a new branch.**
```bash
git rebase origin/main   # resolve conflicts locally
git checkout -b <branch>-r2
git push -u origin <branch>-r2   # plain push of a NEW branch -- never force
gh pr create --title "..." --body "Replaces #<original-PR>, rebased for a clean merge."
gh pr close <original-PR> --comment "Superseded by #<new-PR> (rebased, replay-as-new-branch per QF-20260904-004)"
```
The original branch/PR is closed, never force-pushed. Used precedent: PR #8189, #8190.

**Do not attempt** `git push --force-with-lease` (or `--force`) on an existing branch from a
worker seat -- it is denied by the classifier before any repo check runs, and retrying the
identical command does not change the outcome. If a human operator wants worker seats to
force-push their own `qf/`/`feat/` branches, that is a Bash permission-rule decision for the
chairman, not something a worker session can grant itself.

### Branch Health Check Script

The script lives in MANUAL.

### EXEC Agent Action

When starting implementation:
1. Run branch health check
2. If >7 days stale → merge main first
3. If multiple SDs detected → split branches
4. If >100 files changed → assess scope creep
5. Document branch health in handoff notes