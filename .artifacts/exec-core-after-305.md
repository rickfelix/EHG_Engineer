## 🔀 Multi-Instance Coordination (MANDATORY)

**Root Cause**: Multiple Claude Code instances operating in the same git working directory causes branch conflicts, stash collisions, and interrupted operations. (provenance: PROVENANCE § Multi-instance coordination — worktree commands, quick reference, incident evidence) (procedure: MANUAL § Multi-instance coordination — worktree commands, quick reference, incident evidence)

### MANDATORY: Git Worktrees for Parallel SD Work

When multiple Claude Code instances may run concurrently on different SDs:

Worktree creation and cleanup commands: MANUAL (`node scripts/session-worktree.js --sd-key <SD> --branch <branch>` is the recommended entry point; work ONLY in the worktree by absolute path, never `cd`).

### Forbidden Operations (Multi-Instance)

| Operation | Why Forbidden | Alternative |
|-----------|---------------|-------------|
| `git stash pop` across SDs | Mixes changes between instances | Use worktrees |
| `git checkout` to different SD branch | Switches shared directory | Use worktrees |
| Working in `C:/Users/rickf/Projects/_EHG/ehg` during parallel execution | Shared state conflicts | Use worktree path |
| Branch switching mid-operation | Interrupts other instance | Complete or stash first |

### Verify After Every Edit (When In Doubt)

If there is ANY ambiguity about which working tree an Edit landed in — multi-session
fleet, worktree-per-SD convention, a prior command that may have changed `cwd` — run
`git status` (or `git diff --stat`) immediately after the Edit, not after a downstream
symptom surfaces. Checking proactively is cheap; discovering a stray shared-root edit
indirectly (e.g. via an unexpected test result loading stale worktree code) costs far
more time to trace back.

