# Golden Fixture Corpus

Per-script golden fixtures for the replay test framework (`scripts/__tests__/replay/`).

PRs #2–5 of `SD-LEO-INFRA-OPUS-HARNESS-PHASE-3-INLINE-SCRIPTS-001` populate this directory with one subdirectory per target script:

```
golden/
  quality-checker/        # PR #2
  ai-quality-judge/       # PR #3
  eva-intake-pipeline/    # PR #4
  prd-sd-041c/            # PR #5
```

Each subdirectory contains ≥10 fixtures (per PRD FR-2 AC-1) named `fixture-<seq>.json`, conforming to `../replay/fixture-schema.json`. Fixtures are real production invocations, sanitized of secrets per `../replay/sanitization-checker.mjs`. The loader rejects any fixture missing `sanitized: true`.
