---
category: reference
status: published
version: 1.0.0
last_updated: 2026-04-24
tags: [reference, handoff-gates, parallel-sessions]
---
# Branch-Aware Gate File Reads

**SD**: SD-LEO-INFRA-FIX-GATE-FILE-001

## Rule

Any LEO handoff gate that reads source files from a cross-repo checkout (e.g. the shared `ehg` frontend tree) **MUST** read them from `origin/<sd_branch>`, never directly from the local checkout.

## Why

The shared `ehg` checkout has its branch flipped by whichever parallel Claude Code session is active. When a gate reads via `fs.readFileSync(path.join(EHG_REPO_PATH, file))`, its verdict depends on which branch happens to be checked out at gate-run time — not the SD under review. This produces:

- False-fails on SDs whose content is correct but absent from the current checkout.
- False-passes on SDs whose issues exist on their own branch but not in the checkout.
- A compensation pattern of `--bypass-validation`, which masks real gate signal.

Evidence: three consecutive `--bypass-validation` uses on SD-PROTOCOL-LINTER-DASHBOARD-001 (2026-04-24), all for this exact class.

## Canonical Pattern

Use `createBranchFileReader` from `scripts/modules/handoff/lib/branch-file-reader.js`:

```js
import { createBranchFileReader } from '../../../lib/branch-file-reader.js';

const reader = createBranchFileReader(EHG_REPO_PATH);
const content = reader.readFile(branchName, 'src/components/Foo.tsx');
```

The helper routes each read through `git show origin/<branch>:<path>`, retries with `git fetch origin <branch>` on first-miss, and caches `(branch, path) → content` per instance so repeat reads (common in `/heal` and batch precheck) do not pay the git-show cost twice.

For gates that must build or execute against branch contents (not just read them), use a disposable worktree:

```js
execSync(`git -C "${repoRoot}" worktree add --detach "${tempDir}" origin/${branch}`);
// ... run build / script in tempDir ...
execSync(`git -C "${repoRoot}" worktree remove --force "${tempDir}"`); // in finally{}
```

`lib/gates/cross-repo-build-check.js` is the reference implementation.

## Anti-Pattern

```js
// ❌ DO NOT DO THIS in any cross-repo gate
const content = fs.readFileSync(path.join(EHG_REPO_PATH, file), 'utf8');
```

Reading via `fs.readFileSync` against a shared checkout couples the gate verdict to parallel-session state. If you find this pattern in a new gate, migrate it to `createBranchFileReader` (or a temp worktree for execution paths) before shipping.

## Scope of the Rule

This rule applies only to **cross-repo** reads — gates that look at files outside the EHG_Engineer repo. Within-repo reads (e.g. `scripts/modules/handoff/*` reading other EHG_Engineer files on its own branch) are unaffected, because the worktree is already scoped to the SD.

## References

- Helper: `scripts/modules/handoff/lib/branch-file-reader.js`
- Unit tests: `tests/unit/branch-file-reader.test.js`
- Consumer 1: `scripts/modules/handoff/executors/exec-to-plan/gates/ui-interactivity-check.js`
- Consumer 2: `lib/gates/cross-repo-build-check.js`
- Regression tests: `tests/unit/handoff/cross-repo-build-check-branch-aware.test.js`
