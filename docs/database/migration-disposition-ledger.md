---
category: database
status: approved
version: 1.0.0
author: rickfelix
last_updated: 2026-07-25
tags: [database, migrations, ci, governance]
---

# Migration disposition ledger

**Source**: SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001.

Every committed migration under `database/migrations/` that the apply-state verifier reports as
a gap must have a recorded, readable decision. This is where that decision lives.

## Why it exists

`scripts/verify-migration-apply-state.mjs` was column-blind until QF-20260725-470. The corrected
re-run found **126 forward migrations with schema gaps**. 117 of them predate
`RETIRED_BEFORE=20260615` and therefore can never turn the CI gate red — so for 93% of the
corpus, "has anyone actually decided what to do with this file?" was invisible to CI. A file
could sit unapplied and undiscussed forever and every gate would stay green.

The ledger makes the decision auditable independently of whether the gate passes. That
separation is the whole point: **the definition of done is `undispositioned == 0`, not a green
gate**, because a green gate can be produced by suppression while a zero undispositioned count
cannot be produced without recording a real reason for every file.

## Files

| Path | Role |
|---|---|
| `docs/audits/migration-dispositions.json` | The ledger. Source of truth. Committed. |
| `scripts/lib/migration-disposition-ledger.mjs` | Reader + invariants. No DB, no side effects. |
| `scripts/seed-migration-dispositions.mjs` | Derives entries from existing evidence. Pure core. |
| `scripts/mirror-migration-dispositions-to-audit.mjs` | Governance trail into `public.audit_log`. |
| `scripts/verify-migration-apply-state.mjs` | Consumes the ledger; reports and suppresses. |

## Entry shape

```json
{
  "20260716_chairman_email_channel_health_debounce.sql": {
    "disposition": "DEFERRED",
    "reason": "Chairman-gated migration carrying no parseable @approved-by stamp …",
    "owner": "chairman",
    "sd_key": "SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001",
    "recorded_at": "2026-07-25T18:00:00.000Z",
    "review_by": "2026-10-23T18:00:00.000Z",
    "source": "auto:chairman-gate-marker",
    "corroborated": false
  }
}
```

Keyed by **basename**, not path: `schema_migrations_applied` stores worktree-varying absolute
Windows paths (229 distinct paths for 227 distinct basenames), so a path is not a stable key.

| Disposition | Meaning | Suppresses the gate? |
|---|---|---|
| `RETIRED` | Deliberately never applying this. | Yes |
| `DEFERRED` | Will decide/apply later; blocked or not yet worth it. | Yes |
| `APPLIED` | It has been applied. | **Never** |

## The four invariants

**1. FAIL OPEN.** An absent, unreadable, malformed or wrong-shaped ledger yields an *empty*
ledger — zero suppression, all drift still reported. A corrupt JSON must never be able to
mass-suppress genuine drift. `inspectLedger()` additionally returns a `status` so a corrupt
ledger is reported as corrupt rather than looking like "no decisions recorded yet".

**2. REASON REQUIRED.** An entry whose reason isn't recognisably written by a human is ignored.
This is an **allowlist** (`>= 3 words of 3+ letters`), not a strip of known-bad characters: a
denylist loses to newly-chosen invisible codepoints, including U+3164 which Unicode classifies
as a *letter* and U+2800 as a *symbol*, so even a `\p{C}`+`\p{Z}` filter can be defeated.

**3. APPLIED NEVER SUPPRESSES, AND NEVER COUNTS AS DECIDED WHILE THE FILE IS IN THE GAP SET.**
A genuinely applied migration cannot appear in the verifier's gap set at all. So an `APPLIED`
entry for a file that *is* in the gap set proves itself false — either the ledger is wrong or
an apply failed silently. Honouring it would turn the gate green with the columns still
verifiably absent, which is exactly how QF-20260719-281 ghost-completed. Such entries are
surfaced by `contradictoryBasenames()` and printed as `⚠ LEDGER CONTRADICTS SCHEMA`.

Recording `APPLIED` *after* a real apply (when the file has left the gap set) is correct and
expected — that is the disposition's legitimate use.

**4. SUPPRESSION IS BOUNDED.** An optional `review_by` date ends a suppression. Past it, the
entry stops suppressing *and* counts as undispositioned again, so the file resurfaces as real
drift rather than decaying into a permanent exemption. Entries without `review_by` never
expire. This matters because entries are carried forward even after their file leaves the gap
set: without expiry, a migration that was applied and later *regressed* would be silently
re-suppressed by a decision made about a situation that no longer exists.

## How to adjudicate the remaining files

As of this SD, **123 of 126 are undispositioned**. They need human judgement; the seeder
deliberately does not invent decisions to drive the number down.

1. Get the current gap set:
   ```bash
   node scripts/verify-migration-apply-state.mjs --json > /tmp/apply-state.json
   ```
   Note: stdout carries a dotenvx banner before the JSON, so slice from the first line that is
   exactly `{` rather than parsing raw stdout.

2. For each file, decide **RETIRED** or **DEFERRED** and write a reason that will still make
   sense to someone in a year. State the evidence, not the conclusion — "zero live references
   per <sweep doc>, consumers archived" rather than "not needed".

3. Add the entry to `docs/audits/migration-dispositions.json` by hand. Hand-written entries are
   **preserved verbatim** by the seeder (including `recorded_at`), so re-seeding never
   overwrites a human verdict — even where an automatic rule would disagree.

4. Re-run and confirm the count moved:
   ```bash
   npm run migration:dispositions:seed -- --gaps=/tmp/apply-state.json --write
   node scripts/verify-migration-apply-state.mjs        # DISPOSITIONS: N of 126 …
   npm run migration:dispositions:mirror -- --write     # governance trail
   ```

5. Commit the ledger. CI re-runs the seeder and fails on any diff, so the committed artifact
   and its generator cannot silently diverge.

### Auto-seeding rules

Only two rules are trusted, both re-derivable from tracked sources:

- **A — chairman-gated, unstamped → DEFERRED.** The file carries `@chairman-gated` /
  `requires-chairman-apply` and no `@approved-by` the 3-factor guard would accept, so the apply
  is genuinely blocked on a signature. Marked `corroborated: false`: the gate marker is
  *self-asserted in the author's own SQL* and is not checked against any registry, so an author
  can obtain this deferral by adding one comment line. It is time-boxed to 90 days for that
  reason.
- **B — the 2026-06-10 human sweep → its verdict**, but only when *every* object the verifier
  reports missing for that file is covered by the doc **and** the doc cites that exact file.
  Currently this yields zero files, because the sweep adjudicated tables and views from a
  phantom-tables scan while the verifier reports the full DDL closure including functions,
  triggers and indexes.

The PRD also named `scripts/audit/migration-column-reachability.mjs` as a RETIRE-bucket source.
It is **untracked in git**, exports nothing, and reads a `cols.tsv` from an expired session's
scratchpad, so it throws at import and cannot run in CI or from a worktree. Re-deriving it as
an importable module is the highest-value way to raise coverage beyond 3.

## Applying a migration is a separate, gated act

Nothing here applies anything. Applies go through `scripts/apply-migration.js --prod-deploy`,
which requires all three factors: a clean git-committed file, an `@approved-by:` header
matching `git config user.email`, and an issued `MIGRATION_APPLY_TOKEN`.

At the time of writing, **1 of the 8 wave-1 migrations carries a valid stamp**; the other 7
need a chairman to author one. Adding an `@approved-by` line to obtain an apply is forging
chairman approval and defeats the guard — never do it. Escalate instead.

## CI wiring

`.github/workflows/migration-deploy-drift-guard.yml` runs the verifier, then checks the ledger
is in sync with its seeder, then runs the FR-6 fail-open wiring proof.

Two things about that workflow are load-bearing and easy to break:

- Its marker greps are `grep -Fxq '[MARKER]'` — **fixed-string, whole-line**. They were
  unanchored substring matches, which meant a committed file named
  `20200101_MIGRATION_APPLY_STATE_INFRA_ERROR_x.sql` made the workflow take the INFRA branch
  and `exit 0`, permanently silencing the gate including the daily cron. Filenames are also
  newline-stripped before printing. Do not loosen either.
- The ledger is loaded **outside** the verifier's DB `try` block, via a dynamic import. Inside
  it, any throw prints `MIGRATION_APPLY_STATE_INFRA_ERROR`, which the workflow converts to
  `exit 0` — so a corrupt ledger would turn the gate permanently and silently green. That is
  the single most safety-critical property in this feature, and
  `tests/integration/migration-apply-state-ledger-wiring.test.js` exists to prove it against
  the real CLI. It runs from the drift-guard workflow because `tests/integration/` is routed to
  vitest's opt-in `db` project, which no other workflow executes.
