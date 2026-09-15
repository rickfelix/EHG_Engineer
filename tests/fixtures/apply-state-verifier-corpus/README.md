# Apply-state verifier regression corpus

SD-LEO-INFRA-APPLY-STATE-VERIFIER-002.

## What this is

A frozen, DB-free regression corpus for `scripts/verify-migration-apply-state.mjs`'s body
normalizer (`normalizeSqlBody()` / `normalizeTriggerWhenClause()`). It pins the case-folding,
implicit-cast-stripping, and quote-scoping fix shipped by SD-LEO-INFRA-APPLY-STATE-VERIFIER-001
(PR #8973, plus 2 adversarial review rounds) so a future change to the normalizer that
reintroduces one of those gaps fails CI immediately instead of silently re-opening the
false-positive class that fix closed.

`corpus.json` contains one entry per function/trigger object currently owned by a known-applied
migration (a `schema_migrations_applied` success row), where the migration file's own declared
text and the object's live-captured text (`prosrc` / `pg_get_triggerdef()`) are confirmed to
currently match under the real normalizer. Exactly one entry — `trigger:trg_sd_mutation_audit` —
carries `confirmed_false_positive: true`: this is the one specimen SD-001 was built to fix
(pre-fix, an identical live trigger read `BODY_MISMATCH`; post-fix, `APPLIED`).

The test suite that replays this corpus is `tests/verify-migration-apply-state-corpus.test.js`
and runs with **no live database connection**.

## What this is NOT

`corpus.json` does not assert "every known-applied migration currently matches its live object."
Some legitimately don't — a later migration or hotfix can replace an object's body after the
corpus's source migration was applied, and the normalizer itself still has known, un-fixed gaps
(see `excluded_current_mismatches` below). The corpus only pins pairs that are **currently
verified equal**, so it never asserts a false invariant.

## Regenerating the corpus

```bash
node scripts/db/apply-state-verifier-corpus-generator.mjs
```

This is a **manual, on-demand tool — never invoked by CI**. It needs a live DB connection
(`DATABASE_URL` or `SUPABASE_POOLER_URL`). It:

1. Reads `schema_migrations_applied` success rows and resolves each to a file on disk.
2. Folds all resolved files' DDL facts chronologically (`foldLifecycle()`), keeping only the
   function/trigger objects each file currently owns.
3. Queries the live DB once (`resolveLive()`, the same function the real verifier uses) for each
   object's current `prosrc` / `pg_get_triggerdef()` text.
4. Compares file text to live text with the real normalizer. Entries that currently match are
   written to `corpus.json`; entries that currently do NOT match are logged and written to the
   fixture's own `excluded_current_mismatches` array instead of being asserted as fixtures.
5. Any ledger path that no longer resolves to a file on disk is logged individually to
   `unresolved_paths`.

Re-run this whenever a real, deliberate schema change legitimately moves a fixture, or when the
verifier's normalizer changes and the corpus needs to reflect new correct behavior.

## Known excluded findings (as of the last regeneration)

The generator's own `excluded_current_mismatches` output is the source of truth — read it
directly rather than trusting this list to stay current. As of this SD's initial build, 11
entries were excluded, falling into two real, un-fixed classes (both logged to the harness
backlog, out of this SD's scope per chairman decision 27bfdde9):

- **Redundant outer parentheses**: Postgres's deparser drops redundant parens the migration
  file's WHEN-clause source wrote (e.g. `((NEW.status)::text = ...)` reconstructs as
  `new.status::text = ...`) — the normalizer strips implicit casts and case, but not redundant
  parenthesization.
- **Quote/dollar-quote scanner state**: on at least one large function body, `\r\n` line endings
  in the live text survive normalization untouched past a certain point in the body — symptomatic
  of the quote-region scanner (`transformOutsideQuotedRegions`) misjudging where a quoted/
  dollar-quoted region ends partway through a large body, causing all normalization steps after
  that point to silently stop applying.
- The remaining excluded entries are genuine content drift: a later migration or hotfix
  legitimately replaced the object's body after the cited migration was applied (e.g. a chairman-
  only authorization guard added on top of an earlier auth check).

## Adding a new confirmed false positive by hand

When a NEW live specimen is confirmed to be a genuine false positive (an identical live object
misclassified as `BODY_MISMATCH`), add it by hand rather than waiting for a full regeneration:

1. Capture the migration file's own declared text for the object (verbatim, including
   indentation — do not collapse it yourself; the normalizer does that).
2. Capture the live text at the moment of discovery: for a function, `SELECT prosrc FROM pg_proc
   WHERE proname = '<name>'`; for a trigger, `SELECT pg_get_triggerdef(oid, true) FROM pg_trigger
   WHERE tgname = '<name>'`.
3. Add an entry to `corpus.json`'s `entries` array:
   ```json
   {
     "id": "<class>:<name>",
     "class": "function" | "trigger",
     "name": "<name>",
     "source_migration_path": "database/.../<file>.sql",
     "file_text": "<verbatim file text>",
     "live_text": "<verbatim live text>",
     "captured_at": "<ISO timestamp>",
     "confirmed_false_positive": true,
     "note": "Confirmed live false positive (<source SD/PR>): <one-line description of what was misclassified and why>."
   }
   ```
4. Bump `entry_count` to match the new `entries.length`.
5. Add a dedicated test in `tests/verify-migration-apply-state-corpus.test.js` asserting this
   specific entry compares equal, mirroring the existing TS-1 test for `trg_sd_mutation_audit`.
