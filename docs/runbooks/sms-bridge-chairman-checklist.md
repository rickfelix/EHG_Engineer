---
category: runbook
status: active
sd: SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001
last_updated: 2026-07-16
---

# Two-Way Chairman SMS Bridge — Architecture + Chairman-Gated Checklist

## What this SD built

- **Outbound**: `lib/chairman/sms-bridge.js` `sendChairmanSmsQuestion()` — classifies a
  question's consequence (`lib/chairman/consequence-classifier.js`, fail-closed: unknown
  defaults to HIGH), refuses to send HIGH-consequence questions, respects the existing
  quiet-window (23:00-05:00 ET) and per-hour rate cap (`lib/notifications/rate-limiter.js`),
  then sends via the `MessagingProvider` seam (`lib/messaging/messaging-provider.js`,
  Twilio implementation in `lib/messaging/providers/twilio-provider.js`) and stamps a
  single-use, 15-minute TTL reply token on the `chairman_decisions` row.
- **Inbound**: `api/webhooks/twilio-sms.js` (mounted in `server/index.js`) verifies the
  `X-Twilio-Signature`, correlates the reply to the most recent SMS question sent to that
  phone number, checks the token is still pending/unexpired/unused, and — if valid — writes
  the raw reply into `chairman_decisions.brief_data.sms_reply` and marks the token used.
  `chairman_decisions.status` is deliberately left `pending`: this module delivers the
  answer, it does not guess an approve/reject verdict from free text. Every inbound attempt
  (valid or not) is audit-logged to `sms_inbound_log`.
- **Delivery status**: a second webhook route updates the notification's delivery status;
  an unanswered SMS question stays `pending` and is picked up by the **existing**
  `lib/eva/chairman-decision-timeout.js` poller (no new fallback daemon was built).

## Chairman-gated steps (the fleet does NOT perform these)

This mirrors the Stripe payment rail's chairman-gated posture
(`docs/runbooks/payment-rail-chairman-checklist.md`) — real account, real phone number,
real carrier compliance.

1. **Provision a Twilio account** (or use an existing one).
2. **Get a phone number** and complete Business-Profile / A2P 10DLC (or toll-free)
   verification — this is the multi-week carrier-onboarding step already tracked
   separately outside this SD.
3. Set the following secrets (never set by the fleet autonomously):
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE`
   - `TWILIO_SMS_WEBHOOK_URL` — the exact deployed URL for `/api/webhooks/twilio-sms`
     (must match what's configured in the Twilio console — signature verification
     depends on an exact match, see `api/webhooks/twilio-sms.js`'s `resolveWebhookUrl`)
   - `TWILIO_STATUS_CALLBACK_URL` — same, for the delivery-status route
4. Configure the phone number's "A message comes in" webhook to
   `POST {TWILIO_SMS_WEBHOOK_URL}`, and the messaging service's status callback to
   `POST {TWILIO_STATUS_CALLBACK_URL}`.
5. **Phase-0 physical test** (chairman-performed): send a real question, confirm it lands
   on the phone/watch, reply, and confirm the reply resolves the decision — before trusting
   this for real decisions.

Until these secrets are set, `twilio-provider.js`'s `send()` fails closed (returns
`status: 'failed', reason: 'twilio_not_configured'` with no network call) — the code is
provider-ready but inert. No live Twilio account was touched by this SD.

## Not in scope (deferred, per the archived plan)

- Full multi-tenant venture-customer-messaging gateway (per-venture quotas, consent
  registry, 10DLC automation, cost attribution) — a separate SD when a venture needs it.
- RCS / WhatsApp / multi-channel.
- Watch integration itself (handled at the OS/phone level, not by this bridge).
