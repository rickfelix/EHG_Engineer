# SMS Status-Callback Relay Drain — Go-Live Runbook

**Category**: Runbook
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-INFRA-SMS-DELIVERY-STATUS-001
**Last Updated**: 2026-08-25
**Tags**: chairman-comms, sms, delivery-status, drain, go-live, cutover

---

## What this is

The SMS status-callback relay (`ehg` repo: `sms-relay/api/status.js` →
`sms-relay/lib/status-relay-core.js`) receives Twilio outbound-delivery status callbacks
(queued/sending/sent/delivered/undelivered/failed) and stages them into `sms_status_staging`
via `fn_relay_insert_sms_status`. `scripts/sms-status-relay-drain.cjs` (cron, `*/5 * * * *`)
drains staged rows into `sms_outbound_obligations` via the shared
`lib/chairman/owed-delivery-truth.js:applyOwedDeliveryTruth` writer — the same writer the
legacy direct webhook (`api/webhooks/twilio-sms.js:handleTwilioStatusCallback`) already calls.

This mirrors the existing inbound relay's own go-live shape (see
[sms-relay-drain-go-live.md](./sms-relay-drain-go-live.md) for the precedent this follows) —
**shipping this SD does NOT make the channel live.** It makes the cutover *safe and
performable*; three separate things must each be turned on, in order, by a human:

1. The two staged migrations must be applied (chairman-gated table + auto-apply column).
2. `SMS_STATUS_RELAY_DRAIN_ENABLED` must be armed and confirmed draining.
3. Only then does `TWILIO_STATUS_CALLBACK_URL` (the flag that makes Twilio actually call the
   route) get set to a live URL — a chairman-facing production decision routed via Adam, per
   the same ruling that governs the inbound relay's flip (coordinator ruling 31b25783, Option A).

Until step 3, the whole path is a no-op: `twilio-provider.js` already reads
`TWILIO_STATUS_CALLBACK_URL` and registers it as `StatusCallback` on every send, but the var is
unset, so Twilio never calls back — Pass 1c's existing poll tier (`sms-outbound-worker.js`)
continues covering delivery status with zero change.

## Precondition (must already be true)

- Both migrations applied:
  - `database/chairman-gated/20260824_sms_status_staging.sql` — creates `sms_status_staging` +
    `fn_relay_insert_sms_status` (chairman-gated: a new RLS-enabled table).
  - `database/migrations/20260824_sms_outbound_obligations_delivery_status_source.sql` —
    additive `delivery_status_source` column on the existing `sms_outbound_obligations` (auto-apply
    lane). Confirm the backfill actually ran (`SELECT count(*) FROM sms_outbound_obligations WHERE
    delivered_at IS NOT NULL AND delivery_status_source IS NULL` should be `0`).
- `periodic_process_registry` row `standard_loop:sms-status-relay-drain` exists and is
  `currently_expected_active=true` (registered by
  `scripts/one-off/register-sms-status-relay-drain-periodic-process-001.mjs`, already run).
- The `ehg` repo's `sms-relay` Vercel deploy includes `sms-relay/api/status.js` (deploys as part
  of the existing sms-relay project, separate deploy unit from the main EHG_Engineer app).

## Go-live steps (in order)

1. **Set the GitHub repo variable** `SMS_STATUS_RELAY_DRAIN_ENABLED = true` (EHG_Engineer repo
   → Settings → Secrets and variables → Actions → Variables). This arms
   `.github/workflows/sms-status-relay-drain-cron.yml`; the drain runner
   (`scripts/sms-status-relay-drain.cjs`) is a no-op until this is set (FR-6).

2. **Canary the drain with the migration path, before any live traffic exists.** Stage one row
   directly via `fn_relay_insert_sms_status` (or wait for the cron to find nothing, which is the
   correct pre-cutover state) and confirm the cron completes cleanly with no errors.

3. **Set the two Twilio-relay env vars, in the `ehg` repo's Vercel project — only after step 2
   is confirmed draining:**
   - `TWILIO_STATUS_RELAY_WEBHOOK_URL` — the relay's OWN status-callback endpoint URL, used to
     verify the Twilio HMAC signature. **Dedicated var, never reused from
     `RELAY_WEBHOOK_URL`** (the inbound relay's own signature var) — VALIDATION finding W1: the
     inbound and status routes have different URLs, so sharing the var would make signature
     verification fail closed against both routes.
   - `TWILIO_STATUS_CALLBACK_URL` (EHG_Engineer repo, existing var, currently unset) — the URL
     Twilio actually calls. This is the flip that makes the channel live. **Route this through
     Adam as a labeled chairman decision**, same as the inbound relay's own cutover — do not set
     it directly as a worker action.

4. **Canary (immediately after the flip).** Send one outbound chairman SMS and confirm:
   - The status callback lands in `sms_status_staging` (check `received_at`).
   - The drain claims it (`drained_at` stamped) within one cron tick (≤5 min).
   - The corresponding `sms_outbound_obligations` row shows `delivered_at` +
     `delivery_status_source='carrier_push'` once Twilio reports `delivered`.

## Rollback

Unset `TWILIO_STATUS_CALLBACK_URL` first (provider is fail-soft — Twilio immediately stops
calling the route; `twilio-provider.js` already handles an empty value). Then set
`SMS_STATUS_RELAY_DRAIN_ENABLED=false` to stop the drain cron. No data migration is involved in
either direction. Pass 1c's poll tier requires zero changes and keeps covering delivery status
throughout.

## Why the flip is not an SD deliverable

Same rationale as the inbound relay's runbook: the `TWILIO_STATUS_CALLBACK_URL` flip is a
chairman-facing production go-live and must be a labeled chairman decision routed via Adam, not
a worker action. This SD's completion asserts only that the migrations, drain, and cron are
built and staged — not that the channel is live.
