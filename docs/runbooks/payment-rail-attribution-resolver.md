---
category: runbook
status: active
sd: SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002
last_updated: 2026-07-10
---

# Payment Rail — Venture Attribution Resolver (Phase 2)

Phase 1 (`SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001`) captures every Stripe webhook event into `ops_payment_events` with `venture_id: NULL` unconditionally — the ingester (`api/webhooks/stripe.js`) never infers venture ownership (PAT-PORT-ISOL-001). This phase resolves that attribution **after** capture, entirely offline (no live Stripe API calls), so resolution stays idempotent and replayable.

## How attribution works

1. **Provenance stamping** (`lib/payments/checkout-provenance.js`) — `createVentureCheckoutSession()` stamps `metadata.venture_id` / `metadata.source_surface` on the Stripe Checkout Session at creation time, and also on `subscription_data.metadata` for subscription-mode sessions (so it survives to later invoice/subscription events).
2. **Resolution** (`lib/payments/attribution-resolver.js`) — `resolveUnattributedEvents()` scans `WHERE venture_id IS NULL AND attribution_status IS NULL` and resolves each row via, in order:
   - `direct_metadata`: the row's own stored object carries `metadata.venture_id`.
   - `lineage_payment_intent` / `lineage_charge`: a sibling row sharing the same `payment_intent_id` or `stripe_charge_id` was already resolved — Stripe object IDs are globally unique within an account, so this can never cross-attribute between ventures.
   - Unresolvable rows are stamped `attribution_status='unattributed'` with a reason; `venture_id` stays NULL, never guessed.
3. Resolution is **two-pass** per batch: pass 1 resolves every row with direct metadata regardless of position, folding results into the candidate set; pass 2 runs lineage resolution against that complete set. (A single-pass, in-order resolver would permanently strand a row whose only donor sibling appears later in the same batch — idempotency means it's never re-scanned once excluded.)

## Running it

- **Ongoing**: wire `resolveUnattributedEvents(supabase, { limit: 500 })` into a cron/scheduled job (not yet scheduled as of this SD — FR-5 ships the mechanism; scheduling is a follow-up).
- **One-shot backfill**: `node scripts/backfill-payment-attribution.mjs` — loops `resolveUnattributedEvents` until a round processes zero rows. Safe to interrupt/re-run.

## The paid-revenue KPI (`computePaidGaugeState`)

`lib/telemetry/funnel-gauge.mjs` `computePaidGaugeState({ supabase, ventureId })` is fail-closed: it returns `state: 'gated_on_attribution'` until the resolver has run at least once anywhere in the fleet (`attribution_status IS NOT NULL` on at least one row). Once resolver coverage exists, it returns `state: 'live'` with `paid_amount_cents`, `currency`, and `unattributed_count_fleet_wide` (always surfaced, never hidden, even when zero).

### Revenue must be deduped by payment identity, not summed per row

A single real Stripe payment fires **multiple** webhook events — `checkout.session.completed`, `payment_intent.succeeded`, `charge.succeeded` — each captured as its own `ops_payment_events` row (Phase 1's own IDEMP-02 migration comment predicted this and scoped the dedup to Phase 2). `computeAttributedRevenue()` in `lib/payments/attribution-resolver.js` does this dedup: it groups resolved rows by `payment_intent_id` (falling back to `stripe_charge_id`, falling back to the row's own `id` as a singleton), and within each group counts **exactly one** amount.

Two adversarial-review rounds hardened this function against real, reachable bugs — preserve these invariants in any future change:

- **Only exact terminal-success event types are eligible** (`checkout.session.completed`, `payment_intent.succeeded`, `charge.succeeded`, matched by `===`, never `startsWith`/prefix). A prefix match previously let `checkout.session.expired` / `checkout.session.async_payment_failed` — which `mapEventToRow` still stamps with `amount_cents = amount_total` (the *intended* amount, never collected) and which still carry `venture_id` metadata — be picked as a group's primary and counted as real revenue.
- **A group with no genuine terminal-success row contributes zero.** The loop explicitly `continue`s past any row that isn't classified `'primary'` or `'refund'` — there is no priority-index fallback that could pick a non-primary row by default when nothing else outranks it.
- **Refund rows (`charge.refunded`) are always additive**, never treated as a duplicate of the original charge — `mapEventToRow` already stores the refunded amount as a negative delta.
- **`currency` returns `null`** (never mislabeled) when a venture's resolved rows span more than one currency.
- **`.eq('livemode', true)`** on the resolved-rows query excludes Stripe TEST-mode events from ever counting toward the "live" paid-revenue figure.

See `tests/unit/payments/attribution-resolver.test.js` (`describe('computeAttributedRevenue ...')`) for the full regression suite covering both adversarial-review rounds.

## Schema

`ops_payment_events.attribution_status` (`resolved` | `unattributed`, CHECK-constrained), `.attribution_method` (`direct_metadata` | `lineage_payment_intent` | `lineage_charge`, CHECK-constrained), `.attribution_reason`, `.resolved_at` — added by `database/migrations/20260710_ops_payment_events_attribution.sql`. Full column/index reference: [`docs/reference/schema/engineer/tables/ops_payment_events.md`](../reference/schema/engineer/tables/ops_payment_events.md).

## Related

- [Payment Rail — Chairman-Gated Checklist](payment-rail-chairman-checklist.md) — Phase 1 setup (chairman-only actions; unaffected by this phase)
- [Payment Rail — Transferability](payment-rail-transferability.md)
