# E2E route-mount tests: use `app.all()` for handlers with their own method guard

**Origin**: retrospective of SD-FDBK-FIX-BLOCKING-STRIPE-LIVE-001 (QF-20260713-618).

## Rule

When a route handler implements its own method-guard logic (e.g. returns `405
Method Not Allowed` for non-POST), register it with `app.all(path, handler)` —
**not** `app.post(path, handler)`.

## Why

With `app.post()`, Express itself rejects non-POST requests (404) before the
handler runs, so the handler's method guard is unreachable via real HTTP. An
e2e test that spawns the real server and sends `GET` then asserts `405` would
fail — or worse, the guard ships as dead code that only direct-invocation unit
tests exercise (see `reference_test_masking`: mocking the gate ships green on
dead code).

With `app.all()`, every method reaches the handler, the guard is actually
exercised end-to-end, and a `405` response also proves *the handler* answered
(not a generic router fallback) — useful as a cheap server-liveness probe.

## Live example (origin/main)

- Mount: `server/index.js` — `app.all('/api/webhooks/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook)` (same pattern for the Twilio webhooks).
- E2E proof: `tests/integration/webhooks/webhook-routes-mounted.test.js` — "non-POST to the Stripe route returns 405 (proves the handler, not a generic router, answered)".

## Checklist for new webhook/API routes

1. Handler owns method rejection → mount with `app.all()`.
2. E2E test spawns the real server and asserts the guard status code via real HTTP.
3. Do not rely solely on direct handler invocation (`handler(req, res)`) for method-guard coverage.
