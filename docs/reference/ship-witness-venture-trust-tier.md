# Ship-witness: `applications.trust_tier` and venture auto-merge eligibility

**SD**: SD-LEO-INFRA-SHIP-WITNESS-APPLICATIONS-001 (Ship-witness B)
**Status**: Approved
**Category**: Protocol
**Version**: 1.1.0
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
| "a second-session check" | P2 witness | A `ship_review_findings` row exists for the PR with `verdict='pass'` (produced by the review gate — actor-separation beyond that is `not_evaluable` today, per the ladder module's own docs) |
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
