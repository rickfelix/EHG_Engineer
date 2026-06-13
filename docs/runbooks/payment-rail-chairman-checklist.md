---
category: runbook
status: active
sd: SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001
last_updated: 2026-06-13
---

# Payment Rail — Chairman-Gated Checklist

These steps **require the chairman** (real legal/financial identity, real money). The fleet builds the scaffolding but never performs, simulates, or auto-fills any item below. Each item is chairman-attested.

## Phase 1 — unblock the fleet's TEST-mode proof (minimal)

To let the fleet complete the end-to-end TEST charge (`scripts/payments/test-charge-harness.mjs`) and the live-path integration:

1. **Create a Stripe account** (or use an existing one) — Stripe Dashboard.
2. **Get TEST keys**: Dashboard → Developers → API keys → copy the **test** secret key (`sk_test_…`). Set `STRIPE_SECRET_KEY=sk_test_…` in `.env`.
3. **Create a TEST webhook endpoint**: Dashboard (test mode) → Developers → Webhooks → add the deployed `api/webhooks/stripe.js` URL → copy the signing secret (`whsec_…`). Set `STRIPE_WEBHOOK_SECRET=whsec_…`.
4. Hand back to the fleet → it runs the TEST charge harness and confirms a captured `ops_payment_events` row.

> The fleet's key guard (`lib/payments/stripe-client.js`) refuses any `sk_live_` key in CI/fleet contexts, so providing test keys is safe.

## Phase 1 — LLC formation (external calendar latency)

Tracked in `legal_processes` (run `node scripts/legal/track-llc-formation.mjs` after migration 029 is applied). The chairman performs and attests:

- [ ] **State LLC filing** (Articles of Organization) — choose state + registered agent.
- [ ] **EIN application** (IRS) — after the entity exists.
- [ ] **Business bank account** — after the EIN is issued.

Update the `legal_processes.checklist_items` (mark `completed: true` + `completed_at`) as each milestone lands so slippage stays visible.

## Going LIVE (separate, later, chairman-only)

Only after the rail is proven in TEST mode and the chairman decides to take real money:

1. Provision a **live** secret key (`sk_live_…`) and a **live** webhook signing secret.
2. Set `STRIPE_RAIL_LIVE_MODE=true` (the only switch that permits a `sk_live_` key, and never in CI/fleet).
3. Verify the **first live event** captures correctly into `ops_payment_events` before relying on it.

> The fleet must NOT perform steps in "Going LIVE" — they are chairman-only by design (FR-8).
