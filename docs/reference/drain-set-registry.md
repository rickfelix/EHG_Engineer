---
category: reference
status: draft
version: 1.1.0
author: Claude Sonnet 5
last_updated: 2026-07-20
tags: [reference, fleet, coordination, registry]
---
# Drain-Set Registry

## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.1.0
- **Author**: Claude Sonnet 5 (SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B, -001-C)
- **Last Updated**: 2026-07-20
- **Tags**: fleet, coordination, drain-set, registry

## What this is

`role_drain_sets` is the intended SSOT for per-role recognized message `kind`
vocabulary: which `payload.kind` values a fleet role (`solomon`, `adam`,
`coordinator`, `worker`) actually drains — via its generic inbox, a dedicated
handler, or a read-only fence check. Today (until a chairman applies the
migration below) that vocabulary lives as a hard-coded constant, `DRAIN_SETS`,
in `lib/fleet/worker-status.cjs`.

## Schema

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `role` | `text` | `solomon` \| `adam` \| `coordinator` \| `worker` |
| `kind` | `text` | A `payload.kind` value (e.g. `adam_advisory`, `solomon_consult`) |
| `direction` | `text` | `inbound` (role drains/receives this kind) or `outbound` (role emits it — reserved for future use; not seeded today) |
| `status` | `text` | `active` or `deprecated` |
| `provenance` | `text` | Where this row's fact came from (e.g. the source constant, or the reconciliation SD) |
| `created_at` / `updated_at` | `timestamptz` | |

`UNIQUE(role, kind, direction)` — a role can't recognize the same kind twice in the same direction.

## STAGED / chairman-gated lifecycle

The migration (`database/migrations/20260720_role_drain_sets_STAGED.sql` + its
`_DOWN` companion) is **additive-only and chairman-gated**. It ships
merged-but-unapplied — SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B (Child A) does
**not** apply it. Applying it is a separate, deliberate chairman action.

While unapplied, every consumer **fails open** to the hard-coded `DRAIN_SETS`
constant (see below) — so there is **zero behavior change** until a chairman
applies the migration. The absence is never silent: a loud stderr canary line
is emitted on every fallback, so the unapplied state is observable rather than
indistinguishable from "the table has no rows for this role."

## Fail-open reader contract (`lib/fleet/drain-set-registry.js`)

- `resolveRecognizedKinds({ supabase, role })` — queries `role_drain_sets`
  `WHERE role=$1 AND status='active' AND direction='inbound'`. On any query
  error (including the table not existing) or `supabase=null`, logs one
  `[drain-set-registry] role_drain_sets UNAPPLIED — failing open...` line to
  stderr and returns `DRAIN_SETS[role]` (imported from `worker-status.cjs`,
  never re-derived) — never throws.
- `assertRegistryTablesExist(supabase)` — a canary probe returning
  `{ applied: boolean, table: 'role_drain_sets' }`, never throwing, so
  callers/monitors can observe the unapplied state explicitly.
- `warnIfUndrainedKindViaRegistry({ supabase, targetRole, kind, log })` — the
  registry-backed replacement for `worker-status.cjs`'s `warnIfUndrainedKind`.
  Same warn-and-never-block contract (terminal-reply-kind exemption, WARN-only
  log line), sourced from `resolveRecognizedKinds()` instead of indexing
  `DRAIN_SETS` directly. Consumed by `lib/coordinator/dispatch.cjs`'s
  `insertCoordinationRow` — the send-time choke point every dispatch path
  (Adam, Solomon, coordinator, workers) already routes through.

## ACK semantics (Solomon pin 2)

Acknowledging a drain-set-registered kind is a **two-stage FIELD-STAMP** on the
existing `session_coordination` row:

1. `read_at` — the row was delivered/surfaced to the recognizing role.
2. `acknowledged_at` — the role genuinely acted on it.

This is **never** a new correlated/child row. A kind being "in" a role's
drain set means that role's drain path is expected to eventually stamp both
fields on the row itself — not spawn a separate acknowledgement record. This
mirrors the existing `DIRECTIVE_KINDS` deliver-not-consume contract
(`read_at`-only until the acting role stamps `acknowledged_at`) and extends it
as the general ACK contract for every registry-recognized kind.

## R2 vocabulary reconciliation

Two known asymmetries in the pre-registry hard-coded vocabulary were fixed at
seed time (see the migration's seed INSERTs, provenance
`'SD-LEO-INFRA-DRAIN-SET-REGISTRY-001 R2 vocab reconciliation'`):

1. **`(solomon, adam_advisory)`** — Solomon's own oracle-answer replies are
   sent under `kind=adam_advisory` + `payload.oracle=true`
   (`scripts/solomon-advisory.cjs`), but his drain set never recognized it —
   the "founding defect" this reconciliation closes.
2. **`(solomon, solomon_systemic_finding)`** — pre-registered per Solomon's
   explicit pin, even though no code currently emits this kind, so a future
   sender is recognized on day one with no registry update needed.

`payload.framing_class` (the FW-3 `instrument`/`pick` sub-discriminator on
`adam_advisory` messages) is **not** a registry concern — it's a payload-level
field orthogonal to the `(role, kind)` pair this table tracks.

## Consumers

- **Live today**: `lib/coordinator/dispatch.cjs`'s `insertCoordinationRow`
  (send-time WARN check); `lib/fleet/orphan-reroute-sweep.js`'s
  `sweepOrphanRows` (Child C, below); and, as of Child B
  (`SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C`), all three remaining fleet inbox
  readers — `scripts/adam-advisory.cjs`'s `drainInbox`, `scripts/solomon-advisory.cjs`'s
  `drainInbox`, and `scripts/coordinator-quiet-tick.mjs`'s `readSalientState`
  (see "Repointed inbox readers" below).
- **Planned**: Child D (`-001-E`) builds warn→enforce graduation on top of
  this substrate.

## Repointed inbox readers (Child B, `SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C`)

Child B reconciled and repointed the three inbox readers that still carried
hand-authored per-role kind-list constants onto `resolveRecognizedKinds`.

**Reconciliation first.** `scripts/adam-advisory.cjs`'s pre-existing
`ADAM_INBOX_KINDS` constant had drifted 8 kinds ahead of `DRAIN_SETS.adam`
(`chairman_heads_up`, `chairman_handoff`, `coordinator_advisory`,
`coordinator_adam_feedback`, `assist_request`, `reconcile_consult`,
`coordinator_source_request`, `coordinator_review`). These were added to
`PAYLOAD_KINDS`/`DRAIN_SETS.adam` in `lib/fleet/worker-status.cjs` (and
seeded into the migration) **before** the repoint, so `resolveRecognizedKinds`
never returns a narrower set than the reader previously recognized.

**Exclusion-subtraction is load-bearing.** `DRAIN_SETS[role]` is a strict
superset — it also covers kinds a role recognizes via a *dedicated handler*
or *mechanical* path, not its generic inbox. Feeding the raw registry result
straight into a generic-inbox predicate would let the generic drain
mis-consume rows a dedicated handler exists specifically to own. Both
repointed readers subtract before filtering:

- **Adam** (`scripts/adam-advisory.cjs`) subtracts `ADAM_EXCLUDED_KINDS`
  (`canary_request`, `comms_check`, `cross_party_ping`) from the resolved set.
- **Solomon** (`scripts/solomon-advisory.cjs`) subtracts only `comms_check`
  — handled by its own dedicated first-class branch evaluated before the
  generic filter.

Any future repoint of a per-role inbox reader onto this registry **must**
identify and subtract its own handler-owned/mechanical kinds the same way —
copying the raw resolved array into a generic predicate is the exact defect
class this reconciliation closed.

**Coordinator tick salience, not retirement.** `scripts/coordinator-quiet-tick.mjs`'s
`readSalientState` generalizes only the `openSignalCount` *salience* check
(OR-ing in `payload.kind IN (coordinator-recognized, minus the mechanical
`cross_party_ping` kind)` alongside the existing `signal_type IS NOT NULL`
term) — this closes the class of bug behind the 2026-07-19 lane-blindness
incident (commit `bb661ec627e` / `QF-20260719-298`), where the tick was
structurally blind to `payload.kind`-only rows. `lib/coordinator/adam-advisory-store.cjs`'s
`selectUnactionedAdvisories` — which couples its kind filter to an
`actioned_at`-null *retirement* predicate specific to `adam_advisory` — is
**deliberately untouched**. Generalizing a kind filter without also
generalizing its retirement semantics per-kind would create a permanent
phantom count for any kind retired via a different field (`read_at`,
`acknowledged_at`) or never retired at all. Generalizing that function's
retirement logic correctly is a larger, separate piece of work, not yet
scheduled.

**Injection hardening.** Since a resolved kind now flows into a raw
PostgREST `.or()` filter string, both a DB-side `CHECK` constraint on
`role_drain_sets.kind` (`^[A-Za-z][A-Za-z0-9_]*$`) and a matching JS-side
`SAFE_KIND_TOKEN` filter guard the interpolation — a kind value containing
`,`/`)`/`.` is excluded before it ever reaches the filter string, not
escaped after the fact.

**Residual-drift guard.** `tests/static-guards/drain-set-registry-readers.test.js`
asserts no file outside a small allowlist contains an array literal with 3+
known `payload.kind` vocabulary tokens as *bare array elements* — detecting
by content-shape, not identifier name, so a renamed hand-rolled kind-list
constant can't silently reappear. (The guard's token-counting deliberately
ignores kind names quoted in prose — e.g. an evidence-writer script citing
a real kind name in its `summary` text — counting only genuine array
elements, to avoid false-positiving on documentation.)

## Orphan re-route sweep (Child C, `SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-D`)

`lib/fleet/orphan-reroute-sweep.js`'s `sweepOrphanRows` is the periodic
consumer of `resolveRecognizedKinds`: it finds unread `session_coordination`
rows whose target resolves to a singleton role (`solomon`/`adam`/`coordinator`,
via the same `resolveTargetRole` identity resolution the send-time WARN
check uses) but whose `payload.kind` is **not** in that role's recognized set
— i.e. a row that validly sent but structurally nobody will ever drain (the
original 61.9%-orphan-traffic finding this SD family exists to close).

- **Action**: re-type the row to `coordinator_reminder` (a `DIRECTIVE_KIND`
  the coordinator always drains) and re-target it to the live coordinator,
  stamping a durable `payload.reroute = {from_kind, to_kind, from_target,
  to_target, from_role, at, by_sweep}` audit trail. Idempotent by
  construction (mirrors `lib/coordinator/succession.cjs`'s
  `drainCoordinatorOutbound`/`parkAtBroadcast` idiom): once rerouted, a
  row's kind is coordinator-recognized, so it never matches the orphan
  check again.
- **Repeat-offender alarm**: once a `(role, kind)` pair has been rerouted
  `REPEAT_OFFENDER_THRESHOLD` (2) times within the 14-day window, a single
  `coordinator_request` alarm fires — exactly once, deduped via a stable
  `payload.alarm_key` durable check, not on every subsequent occurrence.
- **Runs headless**: `scripts/orphan-reroute-sweep.mjs` via
  `.github/workflows/orphan-reroute-sweep-cron.yml`, every 15 minutes, not
  var-gated (a failing sweep must be visible).
- **Live-proven**: a production run rerouted 3 real orphan rows addressed to
  the live coordinator (`review_supply`, `row_growth_anomaly`,
  `account_switch_notice`) with full audit stamps; a re-run confirmed
  idempotency (0 rerouted).
