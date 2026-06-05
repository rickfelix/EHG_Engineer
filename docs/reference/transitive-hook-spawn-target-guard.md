# Transitive Hook Spawn-Target Guard

| Field | Value |
|-------|-------|
| **Category** | Reference |
| **Status** | Approved |
| **Version** | 1.0.0 |
| **Author** | SD-FDBK-INFRA-FLEET-WIDE-TRANSITIVE-001 |
| **Last Updated** | 2026-06-05 |
| **Tags** | hooks, ci, static-analysis, archive-orphan |

## What it is

A fleet-wide **static** guard that asserts every *transitive* Node-fork target reachable
from a wired `.claude/settings.json` hook either **resolves to an existing file** or is
**protected by a proximate `fs.existsSync` guard**. It is the transitive sibling to the
SETTINGS-4 test (`tests/unit/settings-claude-project-dir.test.js`, QF-20260604-729).

- **Analyzer**: `lib/hooks/transitive-spawn-target-guard.js` (pure, acorn AST — never executes hook code)
- **Suite**: `tests/unit/hook-transitive-spawn-targets.test.js` (runs in the default `vitest --project unit`)

## Why it exists

SETTINGS-4 only validates the **directly-wired hook command files**. It cannot see the
script files a hook forks *internally*. A bulk-archive sweep once moved
`scripts/auto-learning-capture.js` (the spawn target of `auto-learning-capture.cjs`)
without updating the spawn; because the spawn used `stdio:'ignore'`+detached+`unref()`,
the `MODULE_NOT_FOUND` was swallowed and the hook still printed a success banner — a
**silent false success** (RCA `acde2541` / `PAT-HOOK-ARCHIVE-ORPHAN-001`). This guard is
the "layer with teeth" that fails CI on that class. It also surfaced (and this SD fixed) a
stray-`});` syntax error that had left the wired `session-state-sync.cjs` SessionStart hook
silently dead.

## The rule

For each detected Node-fork target:

| Situation | Verdict |
|-----------|---------|
| Resolvable + file exists | **PASS** |
| Resolvable + file missing + proximate `existsSync` guard on the forked variable | **PASS** |
| Resolvable + file missing + no guard | **FAIL** (orphan) |
| Unresolvable base (computed var) + guard | **PASS** (teeth satisfied) |
| Unresolvable base + no guard | **FAIL** (teeth) |
| Unparseable hook / dynamic `require(var)` / untokenizable `node`-string | **fail-loud / surfaced** (never silently dropped) |

A guard counts **only** when `fs.existsSync()` tests the *same identifier* that is forked —
an unrelated `existsSync` elsewhere in the file does not mark a site guarded.

## What it detects

- **spawn family**: `spawn`, `spawnSync`, `fork`, `execFile`, `execFileSync` of `node` / `process.execPath`
- **exec family**: `execSync` / `exec` shell strings of the form `node "<path>"` (including the call split across lines, and `node a && node b` multi-targets)
- The fork callee must resolve to a `child_process` binding, so `regexVar.exec()` / `str.match()` are ignored.
- **External binaries** (`git`, `gh`, `npm`, `npx`, `powershell`, `wmic`, `ps`, …) are out of scope.

## Mixed resolution bases

The script-path target is resolved by **in-file assignment tracing** (mirroring the
convention — the analyzer never imports a runtime resolver):

- `__dirname` → the hook file's directory
- a local const = `path.resolve(__dirname, '..', …)` → repo root
- a var = `process.env.CLAUDE_PROJECT_DIR || detectProjectDir()` → repo root
- `lib/repo-paths.cjs` `ENGINEER_ROOT` → repo root (the canonical static constant)
- `path.join` / `path.resolve` of the above + string literals → composed

## How to run

```bash
npx vitest run --project unit tests/unit/hook-transitive-spawn-targets.test.js
```

Programmatically:

```js
import { analyzeFleet } from './lib/hooks/transitive-spawn-target-guard.js';
const r = analyzeFleet();           // defaults to ENGINEER_ROOT + .claude/settings.json
// r.ok === false → inspect r.failures (orphaned/unguarded) and r.unanalyzable (unparseable)
```

## Extending it

- **New external binary** → add it to `EXTERNAL_BINARIES`.
- **New base-name convention** → extend `resolveBase` / `resolveBaseFromInit`.
- A legitimately-missing-but-guarded target needs no allowlist — add the proximate
  `fs.existsSync(<forkedVar>)` guard and the analyzer passes it.

## Related

- `docs/reference/auto-learning-capture-hooks.md` — the original archive-orphan incident (QF-20260604-729)
- `tests/unit/settings-claude-project-dir.test.js` — SETTINGS-1..4 (the direct-command layer)
