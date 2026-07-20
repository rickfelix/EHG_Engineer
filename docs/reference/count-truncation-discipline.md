---
Category: Reference
Status: Approved
Version: 1.0.0
Author: SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001
Last Updated: 2026-07-20
Tags: postgrest, supabase, pagination, gauge, count, truncation
---

# Count/Truncation Discipline

## The incident

A gauge silently read "1000" instead of the true value 1495 (`scripts/adam-startup-check.mjs`,
unpromoted-roadmap count). PostgREST's default `max-rows` setting caps every unranged `.select()`
response at 1000 rows. A read that happens to land near or above that cap returns exactly 1000
rows with `error: null` — indistinguishable from "there really are exactly 1000 rows" unless the
caller knows to check.

## The four dispositions

Every Supabase `.select(` call site in `scripts/**` and `lib/**` falls into one of four buckets.
Classify a new site using this decision order:

| Disposition | When | Mechanism |
|---|---|---|
| **A — bounded-by-design** | Result set is inherently small (single-row lookup, small curated/config table, explicit `.limit(N)` with a small `N`, a live-state view that self-limits) | No change needed; record an override entry with the reasoning if the auto-classifier can't infer it |
| **B — paginated** | An unfiltered/lightly-filtered read over a growing table, where every row matters (a bulk-processing loop, or a gauge whose count must be exact) | `fetchAllPaginated()` |
| **C — gauge (exact count)** | Only the COUNT is used, not the row data | `{ count: 'exact', head: true }` + `renderCount()` |
| **D — tripwired** | A bulk read that legitimately cannot paginate (e.g. a hermetic test suite's mock chain stubs out before `.range()`) or is deliberately window/sample-bounded but the bound happens to equal the PostgREST cap | `assertNotCapTruncated()` (throws) or `warnIfCapTruncated()` (warns) |

## The shared primitives

All four live in `lib/db/fetch-all-paginated.mjs`:

```js
import { fetchAllPaginated, assertNotCapTruncated, warnIfCapTruncated, renderCount } from '../db/fetch-all-paginated.mjs';

// B — paginate to completion. queryFactory must be a FRESH builder each call,
// and needs a unique-key .order() tiebreaker for stable page boundaries.
const rows = await fetchAllPaginated(() => supabase
  .from('strategic_directives_v2')
  .select('id, sd_key')
  .order('id', { ascending: true }));

// C — exact count, never a possibly-capped rows.length
const { count } = await supabase.from('strategic_directives_v2').select('id', { count: 'exact', head: true });
const rendered = renderCount(count); // number, or the string 'unavailable' — NEVER a healthy-looking 0

// D — throws CAP_TRUNCATION_SUSPECTED if rows.length === cap
assertNotCapTruncated(rows, { site: 'my-script.js:my-function' });
```

`fetchAllPaginated` throws on any page error (callers keep their own fail-open/fail-closed
policy — wrap it in try/catch if the original site was fail-open).

## Recurring gotchas (from the 9-batch sweep + PLAN_VERIFICATION drift-repair)

1. **A newly-unbounded READ can make a pre-existing unchunked `.in(ids)` bulk operation blow
   past the URL-length limit.** Converting a capped read to `fetchAllPaginated` removes the
   implicit ~1000-row ceiling on anything downstream that builds an `.in()` filter from those
   rows (a bulk UPDATE/DELETE, or a follow-up lookup query). Chunk the `.in()` list to 200/request
   whenever its input comes from a now-unbounded read.
2. **A failed exact-count must render `'unavailable'`, never a healthy-looking `0`.** Always
   route gauge reads through `renderCount()` rather than hand-rolling
   `count ?? 0` or `!error ? count : 0`.
3. **Co-located test mocks need `.order()`/`.range()` chaining.** Hand-rolled Supabase mocks that
   resolve immediately off `.select(...)` break once the call site is converted to
   `fetchAllPaginated` (which calls `.order().range()` before awaiting). Extend the mock to chain
   through `order()` → `range()` → resolve; never weaken the test's assertions to compensate.
4. **`tableAbsent()`-style absence probes must match the real-world PGRST205 message shape**
   ("Could not find the table ... in the schema cache"), not just the raw Postgres 42P01 wording
   ("relation ... does not exist") — especially after wrapping a query in `fetchAllPaginated`,
   which re-throws a plain `Error` and drops the original `error.code`.
5. **The audit ledger can go stale exactly like the bug it exists to catch.** The classification
   ledger (`docs/audits/count-truncation-inventory.json`) and its override registry
   (`scripts/audit/count-truncation-overrides.json`) are keyed by `file:line`. Commits landing
   after the last regeneration — including unrelated concurrent work — silently orphan overrides
   whose lines shifted. Re-run `node scripts/audit/count-truncation-inventory.mjs` at the actual
   merge HEAD before trusting a "0 needs-review" claim, not just at the PR's branch point.

## The audit tooling

- `node scripts/audit/count-truncation-inventory.mjs` — enumerates every `.select(` call site
  across `scripts/**` and `lib/**`, classifies each, and regenerates
  `docs/audits/count-truncation-inventory.json`. Deterministic and idempotent.
- `scripts/audit/count-truncation-overrides.json` — manual classification overrides, keyed
  `"path:line"`. A stale key whose recorded `match` snippet no longer matches the current line
  content falls back to auto-classification (drift-safe, not silently trusted).
