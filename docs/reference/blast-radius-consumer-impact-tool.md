---
category: reference
status: approved
version: 1.0.0
author: Claude (EXEC, SD-LEO-INFRA-FIRST-PARTY-CODEBASE-STRUCTURAL-ANALYSIS-001)
last_updated: 2026-07-01
tags: [reference, static-analysis, code-review, gates]
---
# Blast-Radius Consumer-Impact Tool

First-party (no third-party pre-built binary) codebase structural-analysis tool for the LEO harness. Phase 1 scope: given a diff, find every cross-file consumer of a modified or removed exported symbol, and flag any consumer that was NOT touched in the same diff — the "did you forget to update a caller?" check.

## Why this exists

A modified or renamed exported function can silently break callers that were not part of the same PR. This tool answers "what would this change actually affect?" by resolving the real consumer graph from a single AST pass over the repo's tracked source, rather than relying on a reviewer's memory of who calls what.

## Usage

```bash
npm run blast-radius              # analyzes the current branch vs the resolved main ref
npm run blast-radius -- --ref <gitRef>   # analyze against an explicit base ref
npm run blast-radius -- --json    # machine-readable output
```

Exit code is non-zero when at least one untouched consumer was flagged — useful for scripting, though the tool itself is advisory everywhere it's wired in.

## What it does

1. **`lib/static-analysis/symbol-diff.js`** — `detectModifiedExports(mainRef, changedFiles, rootDir)` compares each changed file's exported declarations (via `git show <ref>:path` for "before", the working tree for "after") using AST-identified declaration boundaries, not a line diff. This means an unrelated formatting change elsewhere in the file never causes a false positive on an untouched export.
2. **`lib/static-analysis/consumer-index.js`** — `buildConsumerIndex(filePaths, rootDir)` / `findConsumers(...)` build a reverse (symbol → consumer) index from a single AST pass over the repo's tracked `lib/`, `scripts/`, `server/` source, extending the existing forward dependency-analysis pass with named-import-specifier capture.
3. **`lib/static-analysis/blast-radius.js`** — `computeBlastRadius(mainRef, rootDir)` combines the two: for each modified/removed export, list every real consumer and flag which ones were not touched in the same diff.
4. **`scripts/blast-radius.js`** — the CLI entry point.

The index is rebuilt fresh on every invocation (no persistent cache), matching the same freshness pattern used by `WIRE_CHECK_GATE` — a stale cache would reintroduce exactly the class of bug this tool exists to prevent.

## Gate integration

`CONSUMER_IMPACT_ADVISORY` (`scripts/modules/handoff/executors/exec-to-plan/gates/consumer-impact-gate.js`) runs this analysis automatically at the `EXEC-TO-PLAN` handoff. It is **advisory only** (`required: false`, and its validator always returns `passed: true`) — a bug or a hostile/pathological file in a PR can, at worst, degrade to a clean pass; it can never block a handoff. Findings surface as warnings in the handoff output. It mirrors the existing `WIRE_CHECK_ADVISORY` gate's structure (venture-repo opt-out, fail-open on any tool error).

## Phase 1 scope and known limitations

- Consumer scope is `lib/`, `scripts/`, `server/` (this repo's own convention, matching `WIRE_CHECK_GATE`) — a consumer living outside that tree is not resolved.
- Namespace imports (`import * as X`), `require(...)`, and side-effect-only imports (`import './x'`) are attributed conservatively to the *whole module*, not a specific export, since static analysis alone cannot rule out a property-access reference to any given export.
- A handful of real repo files that redeclare the same identifier twice in one module scope (a pattern this tool's hardcoded parser config does not accept) are skipped with a warning rather than aborting the whole run — see the DoS-hardening notes below.
- `.ts`/`.tsx` resolution was added to `lib/static-analysis/module-resolver.js`, but no end-to-end test currently exercises real TypeScript syntax through the full pipeline (tracked as a follow-up, not a blocker — the tool is advisory).

## Security hardening

- All git subprocess calls use `execFileSync` with an argv array (`shell: false`) — never shell-string interpolation — since this tool parses PR-influenceable file content.
- Per-file byte cap (`MAX_ANALYZABLE_BYTES`, 2MB) plus per-file `try`/`catch` isolation, so one oversized or malformed file cannot hang or crash the analysis.
- Parser configuration (`lib/static-analysis/ast-parse.js`) is a hardcoded literal — the tool never auto-loads or evaluates the target repo's own `babel.config.js` / `tsconfig.json` / eslint config, since config resolution can execute arbitrary code.
- Zero new npm dependencies — built entirely on the already-installed `@babel/parser` / `@babel/traverse`.

## Related files

| File | Role |
|------|------|
| `lib/static-analysis/ast-parse.js` | Shared hardened parser helper |
| `lib/static-analysis/consumer-index.js` | Reverse symbol→consumer index |
| `lib/static-analysis/symbol-diff.js` | Modified/removed export detection |
| `lib/static-analysis/blast-radius.js` | Combines both into the review report |
| `lib/static-analysis/module-resolver.js` | Import/require path resolution (`.js`/`.mjs`/`.cjs`/`.ts`/`.tsx`) |
| `scripts/blast-radius.js` | CLI entry point |
| `scripts/modules/handoff/executors/exec-to-plan/gates/consumer-impact-gate.js` | Advisory gate wiring |

Delivered by SD-LEO-INFRA-FIRST-PARTY-CODEBASE-STRUCTURAL-ANALYSIS-001.
