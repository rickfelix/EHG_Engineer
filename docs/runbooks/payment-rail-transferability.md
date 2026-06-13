---
category: runbook
status: active
sd: SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001
last_updated: 2026-06-13
---

# Payment Rail — Transferability Runbook

The payment rail is **venture-agnostic by construction**. Nothing in the rail hardcodes a venture, offer, or account, so the rail can be reassigned (domain → rail → customer) without a rebuild — per the build-nimble / flip-optional doctrine (PAT-PORT-ISOL-001).

## What makes it transferable

| Concern | Design |
|---|---|
| Venture linkage | `ops_payment_events.venture_id` is **nullable** and never inferred in code (`api/webhooks/stripe.js` always writes `venture_id: null`). |
| Offer / pricing | Not defined in the rail (out of scope). The rail captures whatever Stripe charges occur. |
| Stripe account | Resolved from env (`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`) — swap the account by swapping the env, no code change. |
| Hardcoded ids | None. The unit test `tests/unit/payments/stripe-rail.test.js` asserts the rail source contains **zero** hardcoded UUIDs. |

## Reassigning the rail to a different venture / entity

1. **Point at the new Stripe account**: update `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the target environment (chairman-gated for live keys — see the chairman checklist).
2. **Re-register the webhook URL** in the new Stripe account's Dashboard → Developers → Webhooks (endpoint = the deployed `api/webhooks/stripe.js` route), and copy the new signing secret into `STRIPE_WEBHOOK_SECRET`.
3. **Attribute captured events** (optional, Phase-2): when a venture owns the rail, backfill/assign `ops_payment_events.venture_id` via a separate mapping step. The capture path stays venture-agnostic.
4. **No migration or code change** is required to move the rail between ventures.

## Boundaries (out of scope here)

- MRR aggregation / `ops_revenue_*` (Phase-2).
- Customer storefront / portal.
- Multi-entity / multi-venture simultaneous billing.
