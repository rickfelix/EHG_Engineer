# Venture No-Crack Gate — Attestations, PBN Status, and the Promotion Criterion

**Category**: Reference
**Status**: Approved
**Version**: 1.2.0
**Author**: SD-FDBK-FIX-VENTURE-CRACK-GATE-001, extended by SD-MAN-INFRA-VENTURE-CRACK-GATE-001
**Last Updated**: 2026-08-18
**Tags**: venture-lifecycle, governance, observe-only, pbn, chairman-review, account-prerequisites

## What this is

A structural (machine-enforced, not conventional) gate for the commitment: *before any venture
faces strangers via a distribution/traffic push, it must have a PBN validation score, a Stage-17
UI/UX judgment attestation, and an explicit chairman site-review attestation.*

This closes the AltifyAI crack: that venture reached live-deploy via a hand-run deploy CLI that
never touched any in-repo chokepoint — not even `lib/venture-deploy/promote.js`. A gate wired
only into the marketing-publish chokepoint (the original design proposal) would **not** have
caught it. The corrected design has two layers:

1. **Primary / detective** — a new job in `scripts/cron/venture-ops-actuals-sweep.mjs` that
   evaluates every venture with a live `deployment_url` (the harm surface, regardless of deploy
   path) each cycle.
2. **Secondary / preventive** — a precondition in `lib/marketing/autonomy-gate.js`'s
   `checkPublishAuthorization()` and `evaluateGraduation()`, covering in-repo-mediated marketing
   distribution.

Both layers call the same evaluator (`lib/eva/lifecycle/crack-gate-evaluator.js`) and both ship
**OBSERVE-ONLY**: neither actually blocks anything yet. See "The promotion criterion" below.

## The three checks

| Check | Source | Status today (measured 2026-08-17) |
|---|---|---|
| PBN validation score | `venture_pbn_status(uuid)` DB function, reading both existing (disjoint) PBN storage locations | Was 151/152 `PBN_NOT_SCORED` as of 2026-08-17. As of SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-1, `venture-pbn-auto-score-sweep` (Job 5 in `scripts/cron/venture-ops-actuals-sweep.mjs`) sweeps the whole portfolio automatically every 6h cycle, capped at `MAX_SCORED_PER_CYCLE=20` new scores per cycle so the backlog clears over several cycles rather than one long-running run |
| Stage-17 UI/UX judgment | `venture_gate_attestations` table, `check_type='stage17_judgment'` | No rows exist. The automated judgment engine (APA Child E) is a separate, unbuilt draft SD — this SD provides an interim human-attested path via `record-gate-attestation.mjs`, not the automated engine itself |
| Chairman site review | `venture_gate_attestations` table, `check_type='chairman_site_review'` | Automated as of SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-3: `scripts/chairman-decisions.mjs decide` bridge-writes a real row whenever a `decision_type='product_review'` chairman_decisions row is approved/rejected. A prior, purely conventional version of this check already exists as a coordinator-maintained metadata marker on `SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-E` (`state=REQUIRED-UNMET`) — this SD's structural attestation is meant to supersede that marker for AltifyAI, not run alongside it indefinitely |

## Running the tools

```bash
# Per-venture status (read-only)
node scripts/eva/check-gate-attestation-status.mjs <venture-id> [--json]

# Fleet-wide observe-only promotion-readiness summary
node scripts/eva/check-gate-attestation-status.mjs --fleet-summary [--json]

# Record an interim human-attested check (real actor identity required; enforced by DB CHECK constraints)
node scripts/eva/record-gate-attestation.mjs \
  --venture <uuid> --type stage17_judgment --verdict PASS \
  --citation "https://..." --actor "rick@example.com" --producer "manual-review" \
  --subject-ref "probe://<venture-url>" --path-to-pass "n/a"

# Retroactive PBN score for a pre-gate venture (targets by UUID only — never by name)
node scripts/eva/retroactive-pbn-score.mjs --venture-id <uuid> [--dry-run]

# Detective sweep, one cycle
node scripts/cron/venture-ops-actuals-sweep.mjs --once
```

Exit codes on both CLIs: `0` = clear/ready, `1` = not met/not ready, `2` = could not determine
(e.g. the attestations table has not been chairman-applied yet).

## Deployment sequencing

`database/chairman-gated/20260817_venture_gate_attestations.sql` and
`20260817_venture_pbn_status_read.sql` are **chairman-gated** (blank `@approved-by` header —
they create RLS policies, so `isDelegatableForApply()` scopes them to a chairman apply ceremony,
not Adam-delegated apply). `database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql`
is **not** chairman-gated (a plain function, no RLS/trigger) and can go through the normal
Adam-delegated path.

Until the two chairman-gated migrations are applied, every code path that reads
`venture_gate_attestations` degrades to a distinct `ATTESTATION_SOURCE_UNAVAILABLE` state rather
than crashing or silently passing — this SD is safe to merge before the chairman ceremony.

## The promotion criterion (observe-only → enforcing)

This SD does **not** flip either layer to enforcing. A future SD should do so only once **all**
of the following hold, measurable via `check-gate-attestation-status.mjs --fleet-summary`:

1. Both chairman-gated migrations have been applied (attestations table + PBN status function
   both live).
2. `retroactive-pbn-score.mjs` has been run for the real deployed ventures (`deployment_url IS
   NOT NULL` — 3 today: AltifyAI, MarketLens, CronGenius).
3. At least **5 consecutive observe-only cycles** (`PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES` in
   `check-gate-attestation-status.mjs`) show **zero** `would_block` observations — i.e. the gate
   has watched real traffic and found nothing it would have wrongly blocked.

`--fleet-summary` reports live standing against this exact criterion; it is not a TODO.

## Post-merge hardening (2026-08-18, PR #7222)

Three rounds of adversarial review on a small follow-up PR surfaced real defects, including one
that had shipped silently in the original PR and would have affected the majority of the target
population. Documented here so a future reader of the code doesn't have to re-derive it.

- **`set_venture_pbn_verdict_stage_zero(uuid, jsonb)` was a silent no-op for most ventures.** The
  original write called `jsonb_set(metadata, '{stage_zero,pbn_verdict}', p_pbn_verdict, true)` — a
  two-level path. Postgres's `create_missing=true` only auto-creates the *final* path element, not
  a missing intermediate container, so for any venture without an existing `metadata.stage_zero`
  key (114 of 152 live ventures at the time — the exact population `retroactive-pbn-score.mjs`
  exists to backfill), the call returned the metadata **completely unchanged**, with no error. The
  caller saw no `writeError` and reported success for a verdict that was never persisted. Fixed by
  collapsing to a single-level `jsonb_set` on `{stage_zero}` merged via `||`, which correctly
  creates the key when absent and preserves sibling `stage_zero` fields when present.
- **The "already scored" guard is now atomic**, not a check-then-act SELECT-then-UPDATE — it's
  folded into the `UPDATE ... WHERE` predicate itself, so two concurrent calls for the same venture
  can't race past the check before either commits.
- **Both leg of the pipeline touch triggers on `ventures`** that a naive `INSERT`/behavioral-proof
  didn't originally account for: `trg_enforce_stage0_origin` (blocks direct INSERT unless
  `leo.stage0_bypass` is set) and `auto_populate_company_id_trigger` (raises for a NULL
  `company_id` outside a real auth session — and `company_id` **does** carry a live FK to
  `companies(id)`, confirmed via `pg_constraint`; an `information_schema`-based check that reported
  otherwise was wrong). The migration's own `DO $verify$` block now disables the second trigger for
  its transaction rather than fabricating a `company_id`.
- **S1/S2, carried forward as FR-9 preconditions, not fixed here**: the PBN leg's storage integrity
  is weaker than the two attestation legs' append-only/audit-trail guarantees (plain mutable jsonb,
  writer-supplied timestamp) — a gate is only as strong as its weakest input, and PBN is that input
  today. The `--fleet-summary` promotion window also counts *rows* (one per venture per sweep
  cycle), not *cycles* — with few live ventures, "5 most recent rows" can span less than 2 real
  sweep cycles. Both are pre-existing design questions outside this SD's scope; a future SD should
  resolve them before ever flipping either layer from observe-only to enforcing.

## The producer-agnostic contract (SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-2)

`fetchLatestAttestation()` / `evaluateCrackGateStatus()` (`lib/eva/lifecycle/crack-gate-evaluator.js`)
read a `venture_gate_attestations` row by `(venture_id, check_type)` only — they never branch on
`attested_by`/`produced_by`. This is the named verdict contract: any row that satisfies the
table's own schema/CHECK constraints is honored identically regardless of producer. Today the
only `stage17_judgment` producer is a human via `record-gate-attestation.mjs` (above); when APA
Child E ships its automated producer, it satisfies the identical contract with zero change to the
read path. `tests/unit/marketing/crack-gate-evaluator.test.js`'s "FR-2 producer-agnostic contract"
block proves this against two differently-attributed row shapes (human vs. a hypothetical
APA-E-shaped machine actor).

FR-2 also enriched Stage-17's own pre-existing `eva_stage_gate_results` row (via
`recordGateResult()`'s `criteria` param, in `stage-17-blueprint-review.js`) with structured
judgment evidence (thresholds applied, gap counts, wireframe-gating flag) — this stays entirely
within Stage-17's own audit trail and does **not** write to `venture_gate_attestations`. FR-2
deliberately does not add an automated attestation write from Stage-17's own scoring pass: see
"Explicitly out of scope" below.

## Chairman site review: the real write path (SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-3)

`lib/eva/chairman-product-review.js`'s `recordProductReviewVerdict()` has **zero production
callers** (confirmed by repo-wide grep) — only `requestProductReview()` (the create-the-packet
half) is actually wired live, from `lib/eva/stage-execution-worker.js`. The real, live,
human-identity-carrying path a chairman decision travels today is
`scripts/chairman-decisions.mjs decide <decision_type:id> <approve|reject|defer>` →
`fn_chairman_decide` RPC, run with `CHAIRMAN_DECIDED_BY=<real email>` in the environment.

FR-3's bridge (`lib/eva/bridge/chairman-site-review-attestation.js`) hooks that RPC call: after
it succeeds, it re-fetches the real `chairman_decisions` row (never trusts the CLI's
`'chairman_approval'` routing category alone — that category covers many `decision_type` values
through the same RPC) and writes a `chairman_site_review` attestation only when
`decision_type='product_review'`. `vga_chairman_review_is_human` is the actual enforcement that
`attested_by` is a real human — the CLI's `DECIDED_BY` defaults to the generic string
`'chairman-cli'` when `CHAIRMAN_DECIDED_BY` is unset, which fails that constraint's email-shape
check, so an un-configured invocation cannot silently produce a fake attestation.

## Pre-deploy account-prerequisite checks (SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-5/FR-6)

Two standalone, non-blocking checkers close a different, earlier-stage class of AltifyAI-shaped
incident: not "did this venture get an unreviewed live deploy" (the three checks above) but "did
this venture's local config still carry an unfilled scaffold placeholder when it deployed" — the
literal AltifyAI root cause (a placeholder D1 `database_id` **and** Clerk publishable key, both
reaching production).

- **`lib/venture-deploy/config-completeness.js`** (`checkDeployConfigCompleteness(repoPath)`) scans
  a local clone's `wrangler.toml` for `key = "value"` lines whose value looks like a never-replaced
  placeholder (exact-match `database_id` scaffold UUID, plus generic patterns: `CHANGEME`,
  `your-*`, `<...>`, `xxxx+`, `TODO`, `placeholder`, `YOUR_*`, an unfilled `pk_test_`/`pk_live_`
  Clerk-key prefix, or an empty value). Key-agnostic by design — the same scanner covers both
  halves of the original incident without hardcoding either variable name.
- **`lib/eva/bridge/account-prerequisites.js`** (`buildAccountPrerequisiteChecklist` +
  `resolveAccountPrerequisiteIndicators`) consolidates 5 bootstrap-account indicators (Stripe
  billing, Cloudflare deploy-target routing, Sentry DSN, the D1 real-id check above, and — as of an
  independent post-ship review — the Clerk publishable key, `VITE_CLERK_PUBLISHABLE_KEY` per
  `docs/03_protocols_and_standards/venture-hosting-standard.md`) into one 3-state
  (`true`/`false`/`null`) list instead of the chairman's own incident: 5 separate round-trips
  discovering missing bootstrap accounts one at a time.

Both are deliberately **unwired** — importable libraries with zero production callers as of this
writing, not blocking steps in any provisioning pipeline. Wiring them into a real chokepoint
(`venture-provisioner.js`'s `DEFAULT_STEPS`, or a pre-deploy CI gate in each venture's own repo)
is an explicit, named follow-up, not an oversight — FR-4's own investigation this SD did found the
real production deploy chokepoint is `promote()` (`lib/venture-deploy/cli-adapters.js`'s sole
caller), and a venture's deploy work has historically bypassed EHG_Engineer's pipeline entirely via
a hand-run CI workflow in the venture's own repo (the literal AltifyAI incident) — wiring either
checker into `publish.js` alone would not have caught it.

**3-state honesty, twice reinforced by independent review**: both checkers return `null` (not
`false`) whenever they could not actually check something, rather than fabricating a "confirmed
missing" verdict from an unread value —
- `account-prerequisites.js`'s Supabase reads bind `error` and throw on a genuine RLS
  denial/network failure (never silently resolve to "confirmed missing").
- `stripe_billing` is 3-state on the `applications` lookup itself: `applications.venture_id` is
  nullable and, measured live 2026-08-18, unpopulated on 7 of 15 rows (47%) — a lookup that finds
  no row via the FK reports `present:null` ("ambiguous, not checkable"), not `present:false`
  ("confirmed missing"). The FK-based lookup itself replaced an earlier free-text `applications.name`
  join specifically because two live ventures share the name "MarketLens"
  (`scripts/eva/retroactive-pbn-score.mjs`'s own header names this) — a name-based join could
  silently attribute one venture's billing product to the other.

## Post-merge hardening round 2 (2026-08-18, PR #7236, independent security + validation sweep)

A second, independent 4-teammate sweep (2 security, 2 validation passes, both re-verified against
the actual merged commit rather than a summary) surfaced further real defects across this SD's own
FR-1/FR-6/FR-7, documented here for the same reason as the round-1 section above.

- **`venture-pbn-auto-score-sweep` had no LLM credential in the production cron workflow.**
  `.github/workflows/venture-ops-actuals-cron.yml`'s env carried only Supabase secrets — every
  scoring attempt inside `scorePbnBuckets` failed with `scoring_error` for lack of a Gemini/Google
  key, writing zero verdicts, and the job still exited green (`scoring_error` is by design never a
  hard failure, so isolated transient failures stay retryable). Fixed two ways: wired
  `GEMINI_API_KEY` (the repo secret already used by 7 other workflows) into the cron job's env as
  the root-cause fix, and added a systemic-escalation check (100% of attempted ventures failing
  with `scoring_error` in one cycle, not isolated noise) that flips `exitCode` — defense in depth
  against a future credential expiry or provider outage reproducing the same silent-green failure.
- **`isMissingFunctionError`'s `.code` was dropped at two independent layers** — the RPC error's
  `.code` (e.g. PostgREST `PGRST202`) was discarded both where `retroactive-pbn-score.mjs`
  re-threw the write error and where the sweep's catch site rebuilt a message-only object before
  checking it — leaving missing-function detection dependent solely on a `/schema cache/i` message
  regex, silently blind to a raw `42883` ("function does not exist") shape. Both layers now
  preserve `.code` end to end.
- **`tests/e2e/ehg-app/auth.setup.spec.ts`'s ported race dropped the original's `.catch()`.**
  `tests/uat/setup/global-auth.js:148` swallows a double-timeout (both the "left /login"
  navigation wait and the error-selector wait time out) so execution falls through to explicit
  diagnostic state checks. The port omitted it — a double-timeout instead rejected with a raw,
  unhandled Playwright timeout, reintroducing the exact undifferentiated-timeout symptom this port
  existed to fix, for precisely the "stuck, no visible error" case. Restored.
- A CI workflow (`ehg-app-auth-smoke.yml`) exposed a full-privilege `SUPABASE_SERVICE_ROLE_KEY` to
  its whole process tree even though nothing in that job's execution path could ever consume it
  (the ingestion path it would feed short-circuits on a never-set `SD_ID`) — removed.

## Explicitly out of scope

- **The APA-E automated Stage-17 judgment engine itself** — a separate, unbuilt draft SD
  (`SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001-E`). This SD's attestation table is designed
  so APA-E can become an automated writer to it later without a schema change.
- **The disjoint/stale dual-location PBN storage bug** (nursery vs. metadata destinations can
  disagree; a re-check at unpark never refreshes a stale nursery verdict) — `venture_pbn_status`
  reads around this robustly (including a dedicated `PBN_CONFLICT` state) but does not fix the
  underlying storage design.
- **A known, separate landmine**: `lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js`
  writes a `chairman_decisions` auto-approval that currently silently no-ops (the table has no
  `resolved_at` column, and the write's error is unbound). Adding that column later — an
  innocuous-looking additive migration — would silently arm fleet-wide machine self-approval.
  This SD does not touch that code path; it is logged separately as a harness bug. It is the
  reason this SD's own attestations deliberately live in a new table, not in `chairman_decisions`.
- **An EHG-frontend dashboard card.** `target_application=EHG_Engineer` — this SD is backend/CLI
  only; a dashboard surface for the same data is a natural, separate follow-up.
