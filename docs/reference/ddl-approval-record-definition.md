# What an approved DDL artifact IS — the comparison contract for live probing

**SD-FDBK-INFRA-LIVE-PROBE-DDL-001, FR-1.** Blocking prerequisite: no live-probe code merges ahead
of this. A probe cannot compare "live vs approved" until *approved* is defined, and building probes
first yields a verifier that compares against nothing and still reports green.

## The problem this settles

There is no approvals table. Three candidate sources exist and they are unlinked:

| # | Source | Carries | Problem |
|---|--------|---------|---------|
| a | Free-text / JSONB metadata scanned by the sweep | approval *prose* | No sha, no content snapshot. Object names are regex-extracted, and `lib/audits/chairman-apply-sweep.js:333-345` + `lib/audits/chairman-apply-collectors.js:42-48` record **two historical bugs where that extraction fabricated a filename that did not exist**. |
| b | `chairman_decisions` with `decision_type='ddl_approval'` | migration **file path** + prose | Ad hoc: 2 uses repo-wide. `decision_type` is free text with no CHECK constraint. The sweep never queries this table at all. |
| c | `schema_migrations_applied` | real `migration_sha256`, `object_diffs` with live before/after bodies | `migration_path` is worktree-absolute; 0 of 146 diff-bearing rows carry SD linkage; only `FUNCTION`/`TRIGGER`/`INDEX`/`VIEW` kinds ever appear — never `POLICY` or `CONSTRAINT`; sha is **not** CRLF-normalised. |

## The decision

### 1. Source (c) is NOT an approval source. It is the applied-side ledger.

This is the distinction the whole SD turns on. `schema_migrations_applied` records **what was
applied**, not **what a chairman approved**. Comparing live against it would verify
*live-vs-applied* — a tautology that is nearly always true and proves nothing about authorisation.
The lived case this SD was sourced from (the `fn_is_chairman` privilege-escalation migration) is
exactly the shape where that tautology passes while the real question goes unanswered.

Use (c) as **corroborating evidence of application**, never as the approval baseline.

### 2. The approval baseline is (b), falling back to (a), and both resolve to a FILE.

- **Object identity** comes from parsing the approved migration file's declared objects
  (`scripts/lib/migration-object-parser.js`), not from regex-scraping prose. Prose naming is the
  mechanism that has already fabricated a filename twice.
- **Approved content** is the migration file's text at the approved path, **LF-normalised before
  digesting** (FR-6 / parent FR-5 AC-1). `migration_sha256` is raw-byte and will disagree with an
  LF-normalised digest on a CRLF checkout.
- **Approval identity** is the `chairman_decisions` row where one exists; otherwise the SD/QF/
  feedback metadata approval the sweep already collects.

### 3. Unresolvable pairings stay UNVERIFIABLE. They never become APPLIED.

If the approval names no resolvable artifact, or the artifact cannot be parsed into declared
objects, the verdict remains `UNVERIFIABLE` with the existing `NO_ARTIFACT` reason
(`lib/audits/chairman-apply-sweep.js:423-425`).

This direction is deliberate and is the single most important rule here. Every existing fail-open in
`scripts/verify-migration-apply-state.mjs` errs toward `APPLIED` — including returning `APPLIED`
with `objects:0` **without ever querying the live database** (`:377-386`), and matching constraints
on `conname` so a same-named CHECK with a different body reads `APPLIED` (`:358-366`). Repeating
that direction would make the sweep confidently wrong where it is currently honestly silent, which
is strictly worse than the defect being fixed.

## Per-object-class authority

| Object class | Approved side | Live side | Notes |
|---|---|---|---|
| FUNCTION | parsed from approved migration file | `pg_proc.prosrc` + `proconfig` | Parent FR-4 AC-3 names prosrc/proconfig, **not** `pg_get_functiondef` as this SD's brief says. `proconfig` is where `SET search_path` lives — a definition-string diff alone can miss it. |
| POLICY | parsed from approved migration file | `pg_policies` + `pg_class.relrowsecurity` | Parent FR-4 AC-1. No existing capture support — this is the gap (`migration-object-parser.js:5` declares MVP scope as FUNCTION/TRIGGER/VIEW/INDEX only). |
| CONSTRAINT | parsed from approved migration file | `pg_get_constraintdef(oid)` **body** | Parent FR-4 AC-2: never `conname` alone. `lib/vigilance/verify-observed-migration.js:27-30` is the pattern to generalise. |
| TRIGGER / VIEW / INDEX | parsed from approved migration file | existing `capture*Def` helpers | Already supported by `scripts/lib/migration-verification.js:24-58`. |

## Consequences worth stating

1. **An approval that names only prose is not verifiable, and that is the correct answer** — not a
   gap to paper over. It should surface as `UNVERIFIABLE`, which is a true statement about our
   records, and it argues for making `chairman_decisions` DDL approvals structured going forward.
2. **`chairman_decisions` is the right long-term home** and is currently ad hoc (2 uses, free-text
   `decision_type`). Structuring it is out of scope here but is the durable fix; this SD should not
   silently depend on an unstructured convention without saying so.
3. **Widening probe coverage must not convert unknowns into passes.** Pinned by TS-6.
