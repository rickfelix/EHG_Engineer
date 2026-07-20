---
category: reference
status: draft
version: 1.0.0
author: Claude Sonnet 5
last_updated: 2026-07-20
tags: [reference, fleet, coordination, registry]
---
# Drain-Set Registry

## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: Claude Sonnet 5 (SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-B)
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
  (send-time WARN check).
- **Planned (sibling children)**: Child B (`SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C`)
  repoints inbox readers (Adam advisory inbox, Solomon drain, coordinator tick
  lanes) onto this same reader lib. Child C (`-001-D`) and Child D (`-001-E`)
  build the orphan-sweep and warn→enforce graduation on top of this substrate.
