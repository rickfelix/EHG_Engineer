# scripts/archive — dead-script cold storage

Scripts that are superseded, one-shot-completed, or verified-unreachable live here so
the active `scripts/` estate stays navigable. Archived files are EXCLUDED from the
reachability gauge's candidate set (`npm run sre:scripts-reachability`) and from npm
alias resolution — landing here is what takes a script out of the liveness ledger.

## Convention

- **`git mv` only — never copy, never delete.** History stays attached; restoration is
  `git mv` back (plus re-adding a liveness anchor, e.g. an npm alias).
- **Reachability-sweep batches** go in a dated subdir preserving the original subpath:
  `scripts/archive/<yyyymm>-reachability-sweep/<original/sub/path>` — so a restore is a
  mechanical reverse move and provenance (which sweep, which scan) is the dirname.
- **Category dirs** (pre-existing): `codex-integration/`, `handoffs/`, `migrations/`,
  `one-time/`, `prd-scripts/`, `sd-scripts/`, `timeline-attempts/` — use these for
  topic-driven archiving outside a sweep batch.
- **Before archiving**, verify nothing references the file: the pre-commit hook runs
  `scripts/validate-script-references.js --staged` and blocks moves that would break a
  live reference — but also screen the blind spots it can't see (DB-stored cron prompt
  strings, dynamically built paths, the EHG sibling repo).

See `docs/03_protocols_and_standards/scripts-estate-liveness.md` for the liveness norm
(SD-LEO-INFRA-SCRIPTS-ESTATE-RECONCILIATION-001).
