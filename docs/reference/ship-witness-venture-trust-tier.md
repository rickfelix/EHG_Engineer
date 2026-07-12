# Ship-witness: `applications.trust_tier` and venture auto-merge eligibility

**SD**: SD-LEO-INFRA-SHIP-WITNESS-APPLICATIONS-001 (Ship-witness B)
**Status**: Approved
**Category**: Protocol
**Version**: 1.2.0
**Last Updated**: 2026-07-12

## What this is

`lib/ship/auto-merge.mjs`'s `attemptAutoMerge()` refuses to auto-merge any
repo that isn't on the hardcoded `AUTO_MERGE_PLATFORM_REPOS` allowlist
(`rickfelix/ehg`, `rickfelix/ehg_engineer`) — every venture/external repo
requires a human merge. This SD adds a second, narrower eligibility path:
`lib/ship/venture-trust-gate.mjs`'s `createVentureTrustGate()` predicate,
which admits a venture repo when **both**:

1. `applications.trust_tier = 'trusted'` for that repo's registry row, **and**
2. the specific PR being merged has independently passed the
   `P1` admission + `P2` witness + `P3` CI subset of the mergeWork() P1-P5
   ladder (`lib/ship/merge-witness-ladder.mjs`, SD-LEO-INFRA-SHIP-WITNESS-
   MERGEWORK-001 — consumed read-only by this SD).

Registry promotion alone grants nothing. Every PR is still evaluated
independently — a `trusted`-tier repo with a PR lacking a passing
`ship_review_findings` row, or with red/pending CI, is still refused.

Platform repos (EHG / EHG_Engineer) are unaffected: `isPlatformRepo()` is
checked first and short-circuits with zero DB lookup, exactly as before this
SD.

## The trust_tier SSOT

`applications.trust_tier` (existing column; `ck_applications_trust_tier`
already permits `'platform' | 'trusted' | 'external'` — no migration was
needed for this SD). As of Ship-witness B's delivery, **zero rows used
`'trusted'`** — promoting a specific venture repo was a separate, deliberate,
chairman-gated operational decision, not something that SD's code performed.
(SD-LEO-INFRA-VENTURE-REPO-TRUST-001 later automated the born-trusted case for
genuinely fleet-minted repos under chairman ratification — see the section
below. Hand-promotion of an already-existing repo remains a manual SQL
decision, as described here.)

To promote a venture repo, issue a direct, reviewed SQL statement (there is
no self-service script by design — see "Why no promotion script" below):

```sql
UPDATE applications
SET trust_tier = 'trusted'
WHERE github_repo = '<owner>/<repo>.git'; -- must have a non-null github_repo
```

A repo whose `applications.github_repo` is `NULL` can never resolve to
`'trusted'` via `fetchTrustTier()` (fail-closed) until that registry row is
backfilled — as of this SD, 8 of the 11 non-platform application rows have
`github_repo = NULL`.

## Why no promotion script

The chairman's ratification of the ship-witness family (`chairman_decisions`
id `dd09d62b-4eb5-419b-90f3-25ac8f3c4eae`) defines the witness composition as
**"CI-green + a second-session check + our-own-fleet-authored"** — a
per-PR runtime check, not a one-time registry flip that then bypasses future
scrutiny. Building a convenience script to set `trust_tier='trusted'` would
make registry promotion feel like the whole gate, when it is only the first
of two independent conditions. Keeping promotion manual keeps the weight of
that decision visible.

## Mapping the ratification language to the P1/P2/P3 witness

| Ratification term | Ladder rung | What it checks |
|---|---|---|
| "our-own-fleet-authored" | P1 admission | `workKey` resolves to a real `strategic_directives_v2`/`quick_fixes` row (not a synthetic/test key) |
| "a second-session check" | P2 witness | A `ship_review_findings` row exists for the PR **on its own branch** with `verdict='pass'` (produced by the review gate — actor-separation beyond that is `not_evaluable` today, per the ladder module's own docs). See "P2's branch scoping" below — `pr_number` alone is not a safe key. |
| "CI-green" | P3 CI | `statusCheckRollup` shows all checks succeeded (pending/empty is `not_evaluable`, never a false pass) |

P2's actor-separation dimension and P4 (branch protection, pre-P0) are never
required for a pass — they aren't evaluable yet at all (see
`lib/ship/merge-witness-ladder.mjs`).

## Born-trusted: fleet-minted venture repos (SD-LEO-INFRA-VENTURE-REPO-TRUST-001)

Venture `applications` rows are born `trust_tier='external'` at their insert
sites (`scripts/reroute-venture-to-bridge.mjs`, `lib/sd-creation/pipeline.js`).
That default meant the factory's OWN merge-ready output was blocked by VB-2 and
had to be hand-elevated per venture (MarketLens, then ApexNiche PR #1) — a
recurring `external`-was-a-default-not-a-decision paper cut. This SD elevates
`external`→`trusted` **automatically, but only at genuine fleet mint**, in
`lib/eva/bridge/venture-provisioner.js`'s `repo_created` step.

**The narrow, fail-closed predicate** (`lib/eva/bridge/trust-elevation.js`
`resolveTrustElevation`) elevates only when **all** hold:

1. **`repoWasMinted === true`** — the *load-bearing* discriminator. Elevation
   runs only on the provisioner's genuine-mint path (`repoExists === false` →
   `gh repo create`). Imported/linked/external repos already exist on GitHub, so
   they **never enter that branch** and can never be born trusted. (CronGenius /
   DataDistill have chairman-approved arch plans yet stay `external` precisely
   because they are imported repos that never mint.)
2. **`venture_id` resolves** to a real venture, **and**
3. a **chairman-approved** row exists in `eva_architecture_plans` **or**
   `eva_vision_documents` for that `venture_id` (vision-alone counts — MarketLens
   has an approved vision and no arch plan).

Any missing signal, unresolved venture, or query error yields **no elevation**
(fail-closed). Trust flows from **chairman ratification of the venture**, not
coordinator self-grant — consistent with the "keep the weight of the decision
visible" philosophy above: this is not a self-service flip of an arbitrary repo,
it is the automatic consequence of a chairman-ratified fleet mint.

**Why born-trusted is safe:** VB-2 is unchanged and still requires
`trust_tier='trusted'` **AND** a passing per-PR witness (P1/P2/P3). `'trusted'`
alone grants nothing — every PR is still adjudicated. Born-trusted only removes
the `external`-tier pre-rejection so the factory's own witness-passing PRs can
reach the same scrutiny every trusted repo gets.

**Audit shape.** Each elevation stamps
`applications.metadata.trust_tier_elevation = { at, to:'trusted', from:'external',
basis, approved_via, venture_id, policy:'fleet_created_ratified_program',
decided_by }`. Elevation is idempotent (guarded on `trust_tier='external'`) and
survives a partial-mint retry (captured at create-time, before the fragile
clone/register lines). `scripts/backfill-trust-tier-elevation.mjs` (dry-run
default, `--apply` to write, enumerated by id — never a heuristic sweep)
normalized the two already-hand-elevated rows (MarketLens `6823cd37` got the
provenance written; ApexNiche `3c8efc56` was already canonical).

## P2's branch scoping (SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001, SECURITY)

`ship_review_findings` has no `repo` column. The original P2 default lookup
(`defaultFetchReviewFinding` in `lib/ship/venture-trust-gate.mjs`) matched a
PR's review verdict by `pr_number` **alone** — small sequential integers
collide constantly across repos. This was confirmed live: `rickfelix/
apexniche-ai` and `rickfelix/marketlens` (the only two `trust_tier='trusted'`
repos at the time) each had merged PRs at the same `pr_number` (#1, #2, #5,
#6, #7, #8, #9), so one repo's passing review could witness-pass an entirely
different repo's PR. A bounded, read-only retroactive audit
(`scripts/audit-borrowed-witness-rows.mjs`) confirmed **9 real borrowed-row
exposure candidates** across the two trusted repos' merge history.

The fix scopes the lookup by `branch` (the PR's own head branch,
`headRefName`) instead, and is **fail-closed by design**:
`defaultFetchReviewFinding(prNumber, supabase, { branch })` returns `null`
immediately if `branch` is omitted — it never falls back to the old
unscoped `pr_number`-only match. `branch` is threaded as an additive
options-object parameter through `evaluateP2Witness` /
`evaluateMergeWorkLadder` (`lib/ship/merge-witness-ladder.mjs`),
`evaluateVenturePrWitness` / `createVentureTrustGate`
(`lib/ship/venture-trust-gate.mjs`), `attemptAutoMerge` /
`observeMergeWorkLadder` (`lib/ship/auto-merge.mjs`), and both live callers
(`.claude/commands/ship.md` Step 5.5/6, `scripts/ship-witness-retroactive.mjs`).

**Known residual limitation.** `branch` narrows the collision surface but is
not itself repo-unique — two trusted repos could in principle share both a
`pr_number` and a non-SD-scoped branch name. The durable fix (a real `repo`
column on `ship_review_findings`, chairman-gated migration + repo-scoped
reads) is fast-follow `SD-APEXNICHE-AI-LEO-GEN-WITNESS-LOOKUP-DURABLE-001`,
explicitly split out so this fail-closed interim fix could ship without
waiting on a schema migration.

## P2's durable repo scoping (SD-APEXNICHE-AI-LEO-GEN-WITNESS-LOOKUP-DURABLE-001, SECURITY fast-follow)

Layer 2 on top of the branch-scoping fix above. `ship_review_findings.repo`
is a new **chairman-gated, additive, nullable** column
(`database/migrations/20260712_ship_review_findings_repo_column.sql`) —
committed but **not applied**; it may sit un-applied for an indeterminate
period (two sibling chairman-gated migrations on this same table have sat
un-applied for months). Every writer and the reader therefore probe column
existence at runtime (`lib/ship/repo-column-probe.mjs::probeRepoColumnExists`,
cached per-process) and degrade to the pre-this-SD branch-only behavior
exactly when the column is absent — the migration landing or not landing is
never observable as a functional regression.

Once the column is populated, `defaultFetchReviewFinding` in
`lib/ship/venture-trust-gate.mjs` scopes **primarily by `repo`**
(`'owner/name'`, lowercase, no `.git` suffix, normalized via the shared
`normalizeGithubRepo()` helper) — strictly stronger than `branch`, since
branch names like `main` can collide across repos too. The legacy `branch`
fallback (for rows written before the column existed) is additionally
restricted to `repo IS NULL` rows: without that guard, a populated-but-
different-repo row that merely shares the query's branch name would
re-open the exact cross-repo collision the branch-scoping fix closed. Never
OR'd together — primary is repo-only, fallback is branch-only-AND-repo-
IS-NULL, and a non-null repo differing from the query's repo never matches
under any path (verified by a dedicated regression test in
`tests/unit/ship/venture-trust-gate.test.js`).

`repo` is resolved exactly **once** per `/ship` run (`.claude/commands/ship.md`
Step 5.5, persisted to `.claude-work/ship-repo-resolved.json`) and reused
verbatim at Step 6's merge call — never re-resolved via a second `gh repo
view`, so the audit row and the merge-time witness lookup can never drift.
The same `repo` value is threaded into all 4 `ship_review_findings` insert
sites: `lib/ship/review-findings-logger.js` (`logFindings`), the
LEAD-FINAL-APPROVAL populator hook, `scripts/backfill-pr-tracking.js`, and
`scripts/audit-phantom-completions.js` (whose inventory previously stored a
bare repo name like `EHG_Engineer` — now normalized to `rickfelix/<repo>`
before writing, closing an avoidable shape-drift the LEAD security review
flagged).

## Where it's wired in

- `lib/ship/venture-trust-gate.mjs` — the predicate + default lookups (new).
- `lib/ship/auto-merge.mjs` — `attemptAutoMerge()`'s `isTrustedRepo` call now
  threads `prNumber` and `{workKey, tier}` so a per-PR predicate can be
  evaluated (additive; the default `isPlatformRepo` predicate ignores the
  extra args).
- `.claude/commands/ship.md` Step 6 — the real `/ship` merge sequence
  constructs `createVentureTrustGate({ supabase, fetchStatusCheckRollup })`
  and passes it as `isTrustedRepo`. Without this wiring, the gate exists as
  library code but is never actually consulted for a real merge decision.

## Family status

- **A** — SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001 (completed): the P1-P5
  observe-only ladder + `merge_witness_telemetry` substrate this SD reads.
- **B** — SD-LEO-INFRA-SHIP-WITNESS-APPLICATIONS-001 (completed): the
  `trust_tier` hook described here.
- **C** — SD-LEO-INFRA-SHIP-WITNESS-VENTURE-001 (completed): venture-build
  walker completion gates on a merged PR.
- **D** — SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001 (completed): the
  adoption-readiness gauge + gated enforce-flip capability. See
  `docs/reference/ship-witness-enforce-flip-readiness.md` for the readiness
  bar and what D deliberately did NOT activate.
- SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001 (completed): P2's branch-scoped
  fail-closed fix (urgent, interim — see section above).
- SD-APEXNICHE-AI-LEO-GEN-WITNESS-LOOKUP-DURABLE-001: P2's durable
  repo-scoped fix (Layer 2 fast-follow, chairman-gated migration —
  see section above).
