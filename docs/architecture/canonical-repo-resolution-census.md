# Canonical Repo/App Resolution Census

SD-LEO-INFRA-CANONICAL-REPO-APP-001 (FR-1). File:line → disposition table for every
hardcoded-two-repo-assumption site found while sourcing and executing this SD. No
site is silently omitted — everything found is `swept`, `deliberately-exempt`, or
`deferred-with-owner`.

The canonical resolver is `lib/repo-paths.js` / `lib/repo-paths.cjs` (DB-first via
`applications.local_path`, registry.json fallback). Any site NOT going through it is,
by definition, a candidate for this class of bug.

## Disposition legend

- **swept** — fixed in this SD.
- **deliberately-exempt** — an intentional anchor; fixing it would remove the floor
  the rest of the system depends on.
- **deferred-with-owner** — a real, tracked violation, explicitly out of this SD's
  tractable-slice scope. Owner + reason given, not a bare "later".

## Swept (fixed in this SD)

| Site | Change |
|---|---|
| `lib/repo-paths.js` — `resolveGitHubRepo()` | Added the missing EHG_Engineer self-reference branch (mirrors `resolveRepoPath`'s existing one). Previously returned `null` for an explicit `target_application='EHG_Engineer'` string — the value 630/632 real `quick_fixes` rows actually carry. Without this fix, FR-2 below would fail-loud-throw on nearly every real QF. |
| `scripts/orphan-qf-reaper.mjs` (both `gh pr view` / `gh pr list` call sites, ~line 53/71 pre-fix) | Both calls now pass an explicit `-R <owner/repo>` resolved via `resolveGitHubRepo(qf.target_application)` — never the ambient `gh` default. Unresolvable `target_application` fails loud (TR-2) instead of silently defaulting. |
| `lib/ship/auto-merge.mjs` | Added `createRegistryNarrowedTrustGate(supabase)` — an opt-in, AND-composed trust predicate. The literal `AUTO_MERGE_PLATFORM_REPOS` floor (`isPlatformRepo`) always runs first and is non-negotiable; the registry's `applications.trust_tier` is consulted only to further narrow. Default wiring (`isTrustedRepo = isPlatformRepo`) is unchanged — zero behavior change to the live `/ship` path unless a caller explicitly opts in. |
| `scripts/lint-repo-resolution-drift.mjs` (new) | Regression lint (FR-4) — AST-scoped (acorn), path-allowlisted. Stops new instances of this bug class from landing. |

### Side effect of the FR-2 `resolveGitHubRepo()` fix (VALIDATION-agent finding, PLAN_VERIFICATION)

`scripts/modules/shipping/ShippingPreflightVerifier.js` and
`scripts/modules/shipping/SDGitStateReconciler.js` both build a `REPO_PATHS` map via
`buildRepoPaths()`, which iterates `getRepoPaths()` (always has an `EHG_Engineer` key)
and keeps only entries where `resolveGitHubRepo(name)` is truthy. Before this SD,
`resolveGitHubRepo('EHG_Engineer')` returned `null`, so `rickfelix/EHG_Engineer` was
**silently absent** from `REPO_PATHS` — these two shipping-preflight scanners were blind
to the platform repo where nearly every SD's branch actually lives. The FR-2 fix
corrects this as a side effect: `REPO_PATHS` now includes `rickfelix/EHG_Engineer` (6
repos → 7, confirmed empirically by the VALIDATION sub-agent). This is net-positive and
low-risk — both call sites only use the map to scan for the *current SD's own*
unmerged branches/PRs, so the corrected behavior can only surface true positives, never
introduce a false one. **Deferred-with-owner** (not fixed further here): a dedicated
regression test locking in the corrected `buildRepoPaths()` output for these two
specific callers, since it wasn't a directly-scoped component of this SD's system
architecture (owner=fleet-worker follow-up QF).

## Deliberately-exempt (intentional anchors)

| Site | Reason |
|---|---|
| `lib/repo-paths.js:24` `PLATFORM_REPOS = new Set(['ehg','ehg_engineer'])` | The canonical resolver's own anchor — this is the thing everything else should defer to, not a violation of itself. |
| `lib/repo-paths.js:27-30` `FALLBACK_REPOS` | Documented graceful-degradation fallback for when the registry file is unavailable/corrupt. |
| `lib/ship/auto-merge.mjs:33` `AUTO_MERGE_PLATFORM_REPOS` | The FR-3 fail-closed floor (SECURITY VB-2) — deliberately hardcoded so a corrupt/mis-tagged registry can never widen unattended-merge eligibility. Confirmed live risk: `applications.trust_tier='trusted'` for MarketLens (an external venture repo) proves a registry-only check would be unsafe here. |
| `scripts/lint-repo-resolution-drift.mjs` `FORBIDDEN_STRINGS` | The lint's own detection target — necessarily contains the literal strings it watches for. |
| `tests/**` | Fixtures legitimately reference literal repo names for mocking (e.g. `tests/unit/audit-orphan-prs.test.js`, `tests/unit/deleteVentureFully.test.js`). Allowlisted wholesale by the FR-4 lint. |

## Deferred-with-owner

All entries below: **owner = fleet-worker (this session's lineage) via a dedicated
follow-up SD/QF; reason = each requires its own scoped, regression-tested change —
bundling all of them into this already-large SD would blow past the "tractable
critical-path slice" this PRD deliberately scoped down to.**

### High-risk (requires a golden-master regression pass before touching — TR-4)

| Site | Notes |
|---|---|
| `scripts/modules/handoff/executors/lead-final-approval/gates.js` (`computeReposForSD`, ~line 100-152; literal `rickfelix/ehg` / `rickfelix/EHG_Engineer` at ~line 103-104, 504) | Gates **every SD's** LEAD-FINAL-APPROVAL. risk-agent flagged this HIGH risk — a naive repoint could silently change which repo(s) get scanned for open PRs/unmerged branches across the whole fleet. Requires `regression-agent` golden-master pass first. |

### Category B — `target_application` inline re-derivation (bare app names, not github owner/repo strings; out of FR-4 lint's literal-string scope by design)

| Site | Notes |
|---|---|
| `scripts/leo-create-sd.js` (~line 2137) `const PLATFORM_REPOS = new Set(['ehg', 'ehg_engineer'])` | Inline re-derivation of the exact same Set `lib/repo-paths.js` already exports (`isVentureRepo`/`PLATFORM_REPOS`). Should import the canonical helper instead of re-deriving. |
| `scripts/modules/sd-next/rank-items.js:44` `PLATFORM_APPLICATIONS = new Set(['ehg', 'ehg_engineer'])` | Same re-derivation pattern, different module. |

### Category C — literal `owner/repo` GitHub strings (surfaced by the FR-4 lint's first full-repo AST sweep; none were in the PRD's original ~20-site estimate from the earlier manual grep pass — the comprehensive AST sweep found more, consistent with "no silent caps")

| File | Lines |
|---|---|
| `lib/deleteVentureFully.js` | 42-44 |
| `lib/multi-repo/index.js` | 62, 70, 81, 87 |
| `scripts/adam-github-assessment.mjs` | 25 |
| `scripts/archive/one-time/monitor-scheduled-jobs.js` | 29 (archived one-time script — lowest-priority of this group) |
| `scripts/audit-orphan-prs.mjs` | 21 |
| `scripts/backfill-pr-tracking.js` | 42 (one-time backfill script — low priority) |
| `scripts/check-migration-readiness.mjs` | 86 |
| `scripts/clockwork/gh-failure-monitor.cjs` | 184 |
| `scripts/modules/handoff/executors/exec-to-plan/gates/sub-agent-orchestration.js` | 75 |
| `scripts/modules/handoff/executors/lead-final-approval/hooks/ship-review-findings-populator.js` | 34 |
| `scripts/one-off/_design-agent-evidence-stage23-reject.cjs` | 31 (one-off script — lowest priority) |

All of the above are individually allowlisted (by exact path) in
`scripts/lint-repo-resolution-drift.mjs`'s `ALLOWLIST_EXACT` set, each with a
one-line comment pointing back to this census — so the FR-4 lint passes clean
today while still making every deferred site discoverable and accountable, not
silently capped. **Un-allowlisting any one of these** (as part of its own
follow-up fix) is how the regression lint will confirm the fix actually resolved
that specific site, rather than just trusting the fix description.

## Not re-fixed here (explicitly out of scope — TR-3)

The following tactical QFs land independently per this SD's own description and
are not re-fixed by this PRD; their pattern is folded into this census and the
FR-4 lint instead of a duplicate fix: `QF-20260703-775`, `QF-20260704-180`,
`QF-20260704-440`, `QF-20260704-726`, and the `QF-401` lineage.
