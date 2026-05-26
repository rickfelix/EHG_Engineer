# EVA Lifecycle — Analysis Steps

**Audience:** future contributors maintaining lifecycle stage analysis modules.
**SSOT for stage names:** `stage_config` table (see `lib/eva/stage-governance.js`).

## Filename ≠ Served Stage Number

The filenames in this directory follow `stage-NN-<slug>.js`, but the **production
stage_number a module currently serves is NOT necessarily NN**. Why:

- The venture lifecycle was renumbered at the **2026-04-21 redesign** (commit
  series ending in `20260421_redesign_s18_s26_lifecycle_stage_config.sql`).
- Filenames were preserved across that redesign to keep `git log -- <file>` intact.
- The **canonical stage_number a module serves is declared inside its module
  exports** (typically via `TEMPLATE.id` / `TEMPLATE.stageNumber` / loader meta),
  not inferred from the filename prefix.

## Duplicate filename prefixes

Several stage numbers have multiple analysis-step files (e.g. `stage-20-*.js`,
`stage-21-*.js`). Each file represents a distinct concern that historically lived
at that stage number:

| Filename                            | Concern                       |
| ----------------------------------- | ----------------------------- |
| `stage-19-sprint-planning.js`       | Sprint planning logic         |
| `stage-19-acquirability.js`         | Acquirability scoring        |
| `stage-19-visual-convergence.js`    | Visual / design convergence  |
| `stage-20-build-execution.js`       | Legacy "Build Execution"     |
| `stage-20-code-quality.js`          | Code Quality Gate (current)  |
| `stage-20-acquirability.js`         | Acquirability scoring        |
| `stage-21-quality-assurance.js`     | Legacy "QA & Testing"        |
| `stage-21-visual-assets.js`         | Visual Assets (current)      |
| `stage-21-acquirability.js`         | Acquirability scoring        |
| `stage-22-build-review.js`          | Build Review                  |
| `stage-22-distribution-setup.js`    | Distribution Setup (current) |
| `stage-22-acquirability.js`         | Acquirability scoring        |

When a stage is renamed in the SSOT (`stage_config.stage_name`), update the
**module's internal `TEMPLATE.title`** to match — leave the filename alone.

## Why we don't bulk-rename

A historical bulk-rename was rejected at LEAD review because:
1. `git blame` continuity matters more than filename freshness for legacy analysis.
2. Filenames are not the canonical name source — `stage_config.stage_name` is.
3. CI guard `scripts/generate-stage-config.cjs --check` enforces name parity at the
   DB level (cross-table parity assertion added by
   `SD-LEO-INFRA-RECONCILE-VENTURE-LIFECYCLE-001 / FR-6`); filename drift cannot
   silently produce wrong UI labels.

## Adding a new analysis step

1. Pick a filename matching the **current** stage name (slug form).
2. Set `TEMPLATE.id = 'stage-NN'` where `NN` is the served stage_number.
3. Confirm the stage_number you serve appears in `stage_config` and
   `lifecycle_stage_config` with matching `stage_name` (FR-6 check enforces this).

## Cross-references

- DB SSOT: `database/migrations/20260421_redesign_s18_s26_lifecycle_stage_config.sql`,
  `database/migrations/20260512_stage_config_v2_parity_and_publication.sql`
- Stage name arbitration: `lib/eva/stage-governance.js`
- Generated stage config: `lib/proving-companion/stage-config.js`
  (generated via `node scripts/generate-stage-config.cjs --write`)
