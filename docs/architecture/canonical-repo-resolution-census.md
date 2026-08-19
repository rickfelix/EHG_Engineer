# Canonical Repo/App Resolution Census

SD-LEO-INFRA-CANONICAL-REPO-APP-001 (FR-1). File:line → disposition table for every
hardcoded-two-repo-assumption site found while sourcing and executing this SD. No
site is silently omitted — everything found is `swept`, `deliberately-exempt`, or
`deferred-with-owner`.

The canonical resolver is `lib/repo-paths.js` (DB-first via `applications.local_path`,
registry.json fallback, tombstone-aware as of SD-LEO-INFRA-CLOSE-REMAINING-CROSS-001-C).
`lib/repo-paths.cjs` is a **registry-only** CJS sibling for hooks/CJS scripts — it has
no DB access at all and reads `applications/registry.json` directly, a static file with
zero `deleted_at` concept anywhere in it. It is therefore structurally incapable of
honoring a tombstone. Earlier census language calling `.cjs` "DB-first" alongside `.js`
was a mischaracterization; corrected here (FR-7). Any site NOT going through the
canonical `.js` resolver is, by definition, a candidate for this class of bug.

## Disposition legend

- **swept** — fixed in this SD.
- **deliberately-exempt** — an intentional anchor; fixing it would remove the floor
  the rest of the system depends on.
- **deferred-with-owner** — a real, tracked violation, explicitly out of this SD's
  tractable-slice scope. Owner + reason given, not a bare "later".

## Previously-undocumented parallel resolver family (catalogued by FR-7, not yet dispositioned)

Three resolver modules exist alongside `lib/repo-paths.js`/`.cjs` and had **zero**
references anywhere in this census before FR-7. They are catalogued here so a future
sweep can no longer miss them — none has been audited against the tombstone-fallback
defect class this SD fixes (FR-2/FR-3); that audit is separate follow-up work, not
performed here. Cataloguing ≠ dispositioning.

| Module | What it does | Notes |
|---|---|---|
| `lib/venture-resolver.js` | 8 named exports (`getVenturePath`, `validateVentureRepo`, `getVentureConfig`, `getVentureConfigAsync`, `listVentures`, `getGitHubRepo`, `getCurrentVenture`, `clearRegistryCache`) plus a default export. ~15 production consumers (13 confirmed by a static `from '...venture-resolver'` grep; the higher estimate accounts for require()/dynamic-import forms the grep pattern doesn't match). A separately-maintained venture-config resolution surface, not a thin wrapper around `repo-paths.js`. |
| `lib/venture-repo-root.js` | Single export `resolveVentureRepoRoot(targetApp, defaultRepoRoot, deps)`. Already has useful source-provenance prior art — returns `{repoRoot, source, logs}` with `source` one of `'platform'` \| `'venture'` \| `'venture_not_found'` — the same shape-of-intent as this SD's own `resolveRepoPathDbFirstDetailed` addition (FR-1), arrived at independently and earlier. |
| `lib/venture-name-resolver.js` | Single export `resolveActiveVentureByName(supabase, name, opts)` → `Promise<{id, name, status}\|null>`. Two-tier lookup: prefers a live (`active`/`paused`) match, falls back to any-status (preserves resolution under a since-renamed/cancelled venture). `opts.partial` (default `false`) switches exact `ilike` matching to substring (`%name%`). Distinct from both `resolveCanonicalAppName` and the two modules above — this one resolves a **venture row**, not a repo path or a canonical name string. |

**Why this matters**: three independently-evolved resolver modules doing adjacent work
to the "canonical" pair means "the canonical resolver" is aspirational, not actual, for
at least these call paths. Reconciling each one's relationship to `lib/repo-paths.js`
(duplicate? necessary specialization? migration target?) is out of this SD's
tractable-slice scope and is not claimed as done here.

### `lib/venture-resolver.js` — per-export detail (8 exports)

| Export | Signature | Returns | Notes |
|---|---|---|---|
| `getVenturePath` | `(targetApp: string)` | `string \| null` — absolute local path | Registry-only (sync), case-insensitive name match. `!targetApp` → `ENGINEER_ROOT`. Auto-discovery filesystem-guess fallback was deliberately removed (SD-LEO-INFRA-MULTI-REPO-ROUTING-001, CRO risk assessment) — unmatched returns `null`, never guesses. |
| `validateVentureRepo` | `(repoPath: string)` | `{valid: boolean, reason?: string}` | Checks the path exists AND has a `.git` entry. |
| `getVentureConfig` | `(targetApp: string)` | `Object \| null` (registry entry, `local_path` resolved to absolute) | Sync, registry.json-only ("legacy" per its own JSDoc). NFKC + alphanumeric-strip normalization (matches `'CommitCraft AI'` to registry key `commitcraft-ai`). Rejects normalized inputs `<2` chars (e.g. emoji-only) by returning `null`, not throwing. |
| `getVentureConfigAsync` | `({name: string, supabase: SupabaseClient})` | `Promise<Object \| null>` — `{id, name, normalized_name, local_path, repo_url, deployment_url, deployment_target, status, current_lifecycle_stage}` | DB-first (queries `vw_venture_registry`, not registry.json). Same NFKC normalization as the sync sibling. **Throws** `VentureRegistryInvalidNameError` on empty/too-short input and `VentureRegistryCollisionError` when 2+ active ventures normalize to the same key — the only resolver in this whole family that throws on ambiguity instead of silently picking one. |
| `listVentures` | `()` | `Array<Object>` | All registry entries with `status === 'active'`, `local_path` resolved to absolute. |
| `getGitHubRepo` | `(targetApp: string)` | `string` (never null) | Delegates to `getVentureConfig`; falls back to the guessed literal `` `rickfelix/${targetApp \|\| 'EHG_Engineer'}` `` when no `github_repo` is registered — the one export in this module that can return an **unvalidated guess**. |
| `getCurrentVenture` | `()` | `string` | Detects the venture from `process.cwd()` against registry `local_path` entries, sorted longest-path-first so e.g. `EHG_Engineer` matches before the `ehg` substring. Ambient-cwd-trusting, same risk pattern as the `shared-git-context.js`/`post-completion-validator.js` High-risk entries above — not itself added there since FR-7 named only those two, but worth the same caution if touched. |
| `clearRegistryCache` | `()` | `void` | Clears the module-scope `_registryCache` (test-only utility, mirrors `repo-paths.js`'s `clearCache`). |

`normalizeVentureName`, `VentureRegistryCollisionError`, `VentureRegistryInvalidNameError` are also re-exported (not independently documented here — they're support types for `getVentureConfigAsync` above, not separate resolution entry points).

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
| `scripts/modules/handoff/shared-git-context.js` (`SharedGitContext` class; optional `opts.cwd` threaded into 8+ `execSync` git calls at lines 40/47/52/57/85/104/127/134/158/165; explicit `process.cwd()` fallback at line 110 when `git rev-parse --show-toplevel` fails) | Added per the parent orchestrator's LEAD-phase decision (FR-7). Every property is lazily computed and cached from whatever `cwd` (or ambient `process.cwd()`) the caller threads in, with **no cross-check against the canonical resolver** — a stale/wrong worktree cwd would be silently trusted and threaded through every cached git fact the handoff pipeline reads (branch, diff files, diff stat). Used by 20-30 execSync calls' worth of handoff-gate state per SD, so it is load-bearing at the same scale as `computeReposForSD`. Requires a `regression-agent` golden-master pass before any change to its cwd-resolution logic. |
| `scripts/hooks/stop-subagent-enforcement/post-completion-validator.js` (lines 143/148: `execSync('git branch --show-current', ...)`, `execSync('git diff main...HEAD --name-only', ...)`) | Added per the parent orchestrator's LEAD-phase decision (FR-7). Sharper than the `shared-git-context.js` entry above: these two calls take **no `cwd` parameter at all**, so they unconditionally trust ambient `process.cwd()` with zero opt-in override and zero canonical-resolver cross-check. Gates the Stop-hook post-completion-tail enforcement (/ship, /learn, /document, completion-flags witness) for every completed SD. Requires a `regression-agent` golden-master pass before any change. |

### Related finding from a downstream SD (SD-MAN-INFRA-COMPLETION-PROBES-CROSS-001, 2026-08-18)

A later SD building venture-aware completion-verification instruments
(`adam-coordinator-health.mjs`'s false-completion sampler, `scope-completion-gate.js`'s
per-SD deliverable check) confirmed this row's risk assessment empirically without
touching `computeReposForSD` itself: the canonical `resolveGateRepoContext()` gained a
`metadata.qf_target_application` fallback tier plus an `isVenture`-vs-`resolved`
branching fix (two unrelated downstream consumers were silently discarding a
correctly-resolved EHG-platform repo path, since `isVenture` reads `false` for both
platform repos, not just non-EHG ones). `computeReposForSD` was deliberately left
untouched — same golden-master-regression-pass precondition as above — but a live gap
in its own venture-branch handling was found along the way and signaled to the
coordinator (evidence id `725bf69b`) rather than fixed inline. Still
deferred-with-owner; not resolved by this note.

### Disclosed but not fixed — identical defect class to this SD's FR-2/FR-3

| Site | Notes |
|---|---|
| `resolveCanonicalAppName` (`lib/repo-paths.js:250-277`; consumer: `scripts/generate-retrospective.js:170`) | Has the **identical** tombstone-fallback defect class this SD fixes in `resolveRepoPathDbFirst` (FR-2/FR-3): its query at lines 261-265 filters `.eq('status','active').is('deleted_at', null)` server-side, so a tombstoned app is indistinguishable from a never-registered one — both fall through to `loadValidatedRegistry()` (line 276), a static file with no `deleted_at` concept, which can return a stale name for an app that was since retired. Explicitly **NOT fixed by this narrowly-scoped SD** — disclosed here per FR-7 rather than silently omitted. Owner: fleet-worker follow-up SD/QF, applying the same additive-detailed-resolver pattern this SD used for `resolveRepoPathDbFirst` (FR-1/FR-2/FR-3). |

### Disclosed but not fixed — a consequence of this SD's own fix, at a third call site

| Site | Notes |
|---|---|
| `scripts/resolve-sd-workdir.js:717-728` via `lib/venture-repo-root.js:69-70` | Adversarial-review finding (pre-merge, this SD's own PR). Before this SD, a tombstoned app's `resolveRepoPathDbFirst` call fell through to a (possibly stale, non-null) registry.json path, so this call site rarely saw `null`. After FR-2/FR-3, a genuinely tombstoned app with no live re-registration now correctly returns `null` — which `resolveVentureRepoRoot` (line 69-70) degrades to `defaultRepoRoot` (EHG_Engineer) with `source:'venture_not_found'`, emitting a `worktree.venture_repo_not_found` event. This is NOT silent, and the prior behavior (creating a worktree inside a retired venture's stale clone) was arguably worse — but the posture now diverges from this SD's other two consumers, which fail loud (`scripts/modules/traceability-validation/utils.js:59-62`) or fail closed (`lib/repo-paths.js`'s own `resolveGateRepoContext`, line ~441-443). Aligning this call site's posture with the other two is out of this SD's PRD scope (none of the 7 FRs touch `resolve-sd-workdir.js` or `venture-repo-root.js`). Owner: fleet-worker follow-up SD/QF. |
| `lib/repo-paths.js:178` (`resolveRepoPathDbFirstDetailed`'s `matches` array) | Second adversarial-review round (pre-merge, this SD's own PR, on the fix for the row above this table's CRITICAL finding). `matches` groups same-named rows by `normalizeAppName` (strips ALL non-alphanumerics) — broader than the partial unique index's actual basis (`lower(name)` / `normalized_name`). Two DB-distinct live application names that collide only under the looser `normalizeAppName` equivalence could theoretically both land in `matches` simultaneously (the partial index doesn't forbid it, since each is unique under its own narrower basis). Consequence is benign either way — the first live row is picked; worst case is a registry fallback on a null `local_path`, never a wrong path — so not fixed in this PR. Tightening the match to `normalized_name` (would require selecting that column too) is the real fix; owner: fleet-worker follow-up, same bucket as the row above. |

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
