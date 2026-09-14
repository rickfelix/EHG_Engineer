---
category: architecture
status: approved
version: 1.1.0
author: SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-J (P5.2)
last_updated: 2026-09-14
tags: [stage-advancement, renumber, governance, census, exit-predicate]
---

# Stage-Renumber Directive Template

**SD:** SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-J, P5.2

A checklist for authoring the NEXT `database/chairman-gated/*_stage_*_renumber.sql`-class
migration (the precedent is `20260825_dedicated_venture_uat_stage_insert_and_renumber.sql`,
documented in `database/chairman-gated/README.md`). This does not replace that README's
per-migration ceremony guard order — it adds two more required checks, sourced from defects
this programme found.

## Why this exists

`SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H` fixed a stale `if (fromStage === 23 && toStage
=== 24)` choke point in `lib/eva/stage-execution-worker.js` — a bare numeric literal that
silently stopped matching after the 2026-08-25 renumber shifted the product-review gate from
stage 24 to stage 25. `docs/architecture/stage-advancement-path-census.md` already censuses
every path that WRITES `ventures.current_lifecycle_stage`; it does not, and was never meant
to, census every place that COMPARES a stage number in business logic. A renumber can pass
that census cleanly and still ship a silent behavioral regression, because the two concerns
are different: one is "who moves the column", the other is "who reads a stage number and
hardcoded which one".

## The two instruments, and what each one is FOR

**`scripts/audits/stage-21-26-census.mjs` (SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A)** — the
PRIMARY reusable census instrument for a renumber. Sweeps BOTH filesystem repos (EHG_Engineer
and ehg) plus the shared Postgres database for every literal reference to a named stage-number
range, asserts a known-live negative control, classifies each finding
generated-from-SSOT-vs-hand-written, and commits its report under `docs/audits/`. This is the
right tool for a renumber's OWN scoped sweep: re-run it (or its underlying
`lib/audits/stage-census/*` modules) with the renumber's actual before/after stage-number range
substituted for the 21-26 default, so the census actually covers the numbers the renumber
touches, cross-repo and DB-inclusive — neither of which the CI lint below does.

**`scripts/lint/eva-stage-literal-lint.mjs` (P5.1)** — the STANDING, per-PR guard for
`lib/eva/**` only (single-repo, no DB, no explicit stage-range argument — it always checks the
full 1-27 range `stage-key-registry.js`'s `STAGE_KEY_BY_NUMBER` now covers). It runs on every
PR touching `lib/eva/**`, not just at renumber time, so it catches a NEW literal introduced
long after a renumber has already happened. Use it as the standing regression guard; use the
001-A census for the renumber's own one-time, wider-scoped sweep.

Both matter for a renumber. Run both.

## Exit predicate (required before the chairman ceremony)

Before scheduling ANY future stage-renumber chairman ceremony (per
`database/chairman-gated/README.md`'s ceremony guard order), run:

```bash
node scripts/lint/eva-stage-literal-lint.mjs --all
node scripts/audits/stage-21-26-census.mjs   # substitute the renumber's own stage range
```

**Required outcome**: zero un-allowlisted/un-dispositioned violations from EITHER instrument.
Any real hit found is either:

1. **Fixed** — the renumber migration's own PR updates the literal to reference
   `stage-key-registry.js`'s `STAGE_KEY_BY_NUMBER` (or an equivalent named constant) instead
   of the bare number, or
2. **Explicitly allowlisted** — a new entry in
   `scripts/lint/eva-stage-literal-lint-allowlist.json` (`{file, line, snippet, reason}`,
   snippet-pinned so a moved/edited line automatically re-exposes itself) with a reason
   naming why the literal is safe to leave as-is post-renumber, or
3. **Pragma-exempted inline** — a trailing comment containing
   `eva-stage-literal-lint-disable-line` for a single, deliberate line.

A renumber PR that leaves a NEW un-dispositioned hit is not ready for the ceremony — this
mirrors `stage-advancement-chokepoint-lint.mjs`'s existing exit-predicate role for the
column-write class, applied to the literal-comparison class instead.

## Known blind spots (both carried from the lint itself, not re-litigated here)

1. **Loop bounds.** The lint requires a stage-shaped identifier (`currentStage`,
   `stage_number`, `stage_by`, etc.) on the SAME LINE as the literal. A stage-counting loop
   bound with no such identifier (`for (let i = 1; i <= 27; i++)`) is not caught. A renumber
   directive changing the TOTAL stage count (not just relabeling one stage) must separately
   grep for the old and new bounds by hand.
2. **Keyed literals — the more consequential gap.** A numeric stage literal used as an
   OBJECT KEY or ARRAY ELEMENT with no comparison operator on that line (e.g.
   `lib/eva/contracts/stage-contracts.js`'s `CROSS_STAGE_DEPS` object, `23: [...]` through
   `27: [...]`) is entirely outside the lint's detection surface, by construction — and this
   exact object is a DOCUMENTED REPEAT OFFENDER (its own comments cite a prior
   SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H FR-5 fix for a stale key shift there). A renumber
   author MUST manually grep every keyed stage-number structure in the diff's blast radius
   (search for `CROSS_STAGE_DEPS`, `STAGE_CONTRACTS`, and any object/array literal whose keys
   are bare stage numbers) — the two automated instruments above do not cover this case.

## Checklist (append to the renumber migration's own PR description)

- [ ] `node scripts/lint/eva-stage-literal-lint.mjs --all` run, output pasted into the PR.
- [ ] `scripts/audits/stage-21-26-census.mjs` (or its underlying census modules) re-run with
      the renumber's own stage range, output pasted into the PR.
- [ ] Every violation from both instruments disposed (fixed / allowlisted / pragma-exempted)
      per the exit predicate above — zero left un-dispositioned.
- [ ] Manual grep for keyed stage-literal structures (`CROSS_STAGE_DEPS` and similar) per
      Known Blind Spot 2 above — neither instrument covers this case.
- [ ] `stage-advancement-chokepoint-lint.mjs --all` also run (the column-write class,
      pre-existing requirement — this template does not change it, only names it so all
      censuses are checked from one place).
- [ ] `docs/architecture/stage-advancement-path-census.md` updated with a "Post-census
      addition" section for the renumber, per its own established convention.
- [ ] This document's checklist itself re-read for staleness if `stage-key-registry.js`'s
      `STAGE_KEY_BY_NUMBER` range has changed since `last_updated` above.
