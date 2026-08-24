---
Category: Architecture
Status: Approved
Version: 1.0.0
Author: Claude (SD-LEO-INFRA-REPO-HYGIENE-PATH-001)
Last Updated: 2026-08-24
Tags: [repo-hygiene, gitignore, evidence-boundary]
---

# Evidence Boundary: Durable Tracked Content vs. Ephemeral Scratch

SD-LEO-INFRA-REPO-HYGIENE-PATH-001, FR-2.

## Why this doc exists

`git status --porcelain --untracked-files=all` against the canonical `EHG_Engineer`
checkout showed **3192 untracked files** at measurement time (2026-08-24) — close to
the SD's originally-cited 2,477+ estimate, and worse in absolute terms. Every one of
these paths is genuinely un-gitignored (`git check-ignore` confirms no match on a
sample) — not a hidden config bug, just accumulated fleet-session output that was
never triaged.

This doc declares, per top-level directory, whether its content is **durable
evidence** (should be tracked or explicitly archived) or **ephemeral scratch**
(should be gitignored going forward). It is the canonical source for that policy —
no other doc in this repo currently declares it, and `CLAUDE.md`/`CLAUDE_CORE.md` are
fully regenerated from `leo_protocol_sections` on every run (see
`scripts/generate-claude-md-from-db.js`), so hand-editing either to add this
guidance would be silently overwritten by the next regeneration. This doc is the
stable, hand-maintained home for it instead; `README.md` and the `.gitignore`
entries added by this SD both point back here.

## Measured breakdown (2026-08-24, canonical checkout)

| Directory | Untracked | Tracked | Disposition |
|---|---|---|---|
| `.artifacts/` | 1937 | 160 | **Mixed** — see below |
| `scripts/` | 406 | 5435 | **Mixed** — 396 of the 406 are under `scripts/one-off/` (703 tracked there too; see below) |
| `scratchpad/` | 378 | 0 | **Ephemeral — gitignored by this SD** |
| (repo root) | 198 | — | **Mixed** — 186 of these match a `.artifacts-*` root-level filename prefix; see below |
| `docs/` | 108 | 3566 | **Mixed** — see below |
| `.prd-payloads/` | 87 | 120 | **Mixed** — see below |
| `.claude/` | 65 | 144 | **Mixed** — already governed by ~40 narrow, specific `.gitignore` entries; out of this SD's scope |

## Directories confirmed ephemeral (gitignored by this SD)

### `scratchpad/` — 378 untracked, 0 tracked
No file has ever been committed from this directory, and it carries no existing
`.gitignore` rule despite that. This is the in-repo mirror of the same convention
Claude Code sessions are already told to use for temp files (an external, per-session
scratch directory outside the repo) — this repo-root `scratchpad/` folder is the same
idea, just inside the tree. Blanket-ignored: `scratchpad/`.

### Root-level `.artifacts-*` prefix — 186 untracked, 2 tracked
186 files sit directly at repo root with a literal `.artifacts-` prefix (e.g.
`.artifacts-adam-ask-2102.cjs`, `.artifacts-batch10-1820.cjs`) — session scratch
dumped at the repo root instead of `.artifacts/` or `scratchpad/`, which is worse
hygiene than either. 2 files matching this prefix are already tracked
(`.artifacts-qf687-update-fr0.mjs`, `.artifacts-retro-venture-journey-uat-001.mjs`);
gitignoring a pattern that matches an already-tracked path does not untrack it (git
only consults `.gitignore` for paths that aren't already tracked), so this rule is
safe to add without a carve-out. Blanket-ignored: `/.artifacts-*`.

### 25 named per-session/per-agent scratch subdirectories under `.artifacts/` — 338 untracked, 0 tracked
`.artifacts/` itself is **not** a blanket-ignore candidate — 160 files are tracked
there, including files nested inside subdirectories (e.g. `.artifacts/lead/`,
`.artifacts/qa-recheck/`), so an `.artifacts/*/` wildcard would have silently
disabled tracking for any *future* legitimate evidence file added under a real
subdirectory. `.gitignore`'s own existing comment block (search `NARROWED FROM A
BLANKET`) already documents an earlier regression from over-broad ignoring of this
exact directory — this SD does not repeat that mistake.

Instead, each of the 25 subdirectories below was individually verified
(`git ls-files .artifacts/<name>` returns 0) before being added to `.gitignore` by
exact name — every one is a per-session/per-agent working directory (Solomon/Adam
plan-drafts, RCA scratch, story-QA scratch, validation scratch, one dated proposal
batch, one venture-demand-test scratch dir):

```
adam-plans, adam-proposals-20260815, adam-scratch, brand, c4, dbagent-a4,
evidence-misdirected-writes-20260812, j1-testing, rca-agegauge, rca-b3,
rca-scratch, retro-tre, sec-h, sec-probe, stories-C, stories-a4, stories-c1,
testing-agent-llm-canary, testing-c1, testing-scratch, testing-tmp, tmp-alpha2,
val-drive-forcing, val-story-e2e-write, venture-50763b6a-demand-test
```

**This list is a point-in-time triage, not a self-maintaining pattern.** A future
session's new per-session scratch subdirectory under `.artifacts/` will show up as
untracked again until someone adds it here — `scripts/lint/root-dirt-lint.mjs`
(below) is the mechanism that surfaces that drift instead of letting it silently
reaccumulate to another 3000+.

## Directories left alone (explicit archive-or-track review, out of this SD's scope)

- **`.artifacts/` direct-child files (1599 untracked)** — mixed with 160 tracked
  sibling files at the same directory level; no naming convention reliably separates
  "should have been committed evidence" from "one-shot query script that was thrown
  away after use" without reading each file. Left for a future, file-by-file pass.
- **`scripts/one-off/` (396 of the 406 untracked `scripts/` files)** — `.gitignore`
  already carries an explicit, deliberate decision NOT to ignore this directory
  (search `NOT ignored on purpose: scripts/one-off/_*`; 703 files are already
  tracked there). This SD does not revisit that standing decision.
- **`docs/` (108 untracked)** — sampled content is archived SD plan docs
  (`docs/plans/archived/*.md`) and design assets, i.e. genuine unreleased
  documentation, not scratch. Matches this FR's own PRD language calling for
  "explicit archive-or-track handling" rather than gitignoring.
- **`.prd-payloads/` (87 untracked)** — every filename matches the existing tracked
  convention (`PRD-SD-*.json`, `PLAN-SD-*.json`; 120 files of the same shape are
  already committed) and zero match the existing `.prd-payloads/_*` ignore rule for
  underscore-prefixed scratch. These are apparently-genuine PRD payloads that were
  simply never `git add`ed, not scratch by the repo's own established convention —
  gitignoring them would be wrong. Left for a future commit-or-archive pass.
- **`.claude/` (65 untracked)** — already governed by ~40 narrow, specific
  `.gitignore` entries reflecting many prior individual decisions; this SD does not
  attempt to re-derive or widen that existing policy.

## Measured result

| | Before | After |
|---|---|---|
| Untracked files (canonical checkout) | 3192 | 2291 |
| Reduction | — | **901 files (28.2%)** |

Measured directly: the new `.gitignore` (from this SD's branch) was temporarily
applied to the canonical checkout and `git status --porcelain --untracked-files=all`
re-run, then the checkout's original `.gitignore` was restored unchanged. This is the
real applied-effect number, not a sum of the per-category counts above (which totals
902 — the 1-file discrepancy is an artifact of counting each named `.artifacts/`
subdirectory independently vs. one combined `git status` pass; the table above is the
one to cite).

## Enforcement: `scripts/lint/root-dirt-lint.mjs`

See that script for the threshold and its rationale. It counts untracked files in the
canonical tree the same way this doc's measurement was taken, and fails CI above a
threshold set just above the post-triage baseline recorded here (2290) — so it starts
honest against what this triage actually achieved, not grandfathered-blind against
the pre-triage 3192.
