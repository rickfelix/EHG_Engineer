# EVA Logging Standard

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-145
**Last Updated**: 2026-09-12
**Tags**: eva, logging, lint

## The standard

Any `lib/eva/**/*.js` (or `.mjs`) file with executable logic (a function or class) MUST use
one of these two mechanisms — bare `console.*` calls do not satisfy this standard:

1. **`lib/logger.js`'s `createLogger(module, context)`** — the default choice for ordinary
   module-level logging.
2. **`lib/eva/observability.js`'s `OrchestratorTracer` / `createOrchestratorTracer`** — for
   files that already instrument themselves via the existing orchestration-tracing mechanism
   (from SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-E). A file using the tracer is not also required
   to add `createLogger` — EVA does not need two competing, mandatory logging mechanisms.

## Adoption pattern (createLogger)

```js
import { createLogger } from '../logger.js'; // path relative to your file's depth under lib/eva/

const logger = createLogger('YourModuleName');

logger.info('Processing event', { eventId, eventType });
logger.warn('Handler failed', { error: err.message, attempt: 2 });
```

`createLogger` returns `{ debug, info, warn, error, child, log }` — JSON-line structured output,
filtered by the `LOG_LEVEL` env var, plus a console-compatible `.log()` shim for dependency
injection. See `lib/logger.js`'s own docblock for the full API.

## Why not console.\*?

`lib/logger.js`'s own header states it "Replaces direct console.\* calls." Bare `console.*` has no
level filtering, no structured JSON output, and no trace correlation — it is exactly what this
standard exists to move away from. `scripts/lint/eva-logger-required-lint.mjs` enforces this: a
file with `console.*` calls but no `createLogger`/`logger.*` usage is still flagged.

## Scope: new/modified files only, never a backfill

As of 2026-09-12, 332 of 637 non-test `lib/eva/**/*.js` files (52.1%) have zero logging of any
kind, and 437 (68.6%) have zero structured-logger usage. **This standard is not a mandate to
retrofit those files.** `scripts/lint/eva-logger-required-lint.mjs` is diff-scoped: it only
evaluates files added or modified in the current branch/PR against the merge-base with `main`. A
pre-existing file you did not touch is never scanned.

## Escape hatch

A file that genuinely needs no logging (e.g. a thin re-export with a single trivial helper) may
carry a documented exemption:

```js
// eva-logger-lint-ignore: pure formatting helper, no side effects worth logging
```

A blank reason is rejected — the lint still flags the file. See
`scripts/lint/eva-logger-required-lint.mjs`'s own header for the full detection rules, known
limitations, and the `LEO_DISABLE_EVA_LOGGER_LINT` emergency kill-switch.

## Enforcement

CI workflow: `.github/workflows/eva-logger-required-lint.yml` (required `pull_request` check).
Local run: `npm run lint:eva-logger`.
