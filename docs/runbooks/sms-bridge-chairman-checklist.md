---
category: runbook
status: active
sd: SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001
last_updated: 2026-07-17
---

# Two-Way Chairman SMS Bridge — Architecture + Chairman-Gated Checklist

> **Superseded inbound path (2026-07-17, SD-LEO-FEAT-SMS-INBOUND-RELAY-001):** the direct
> inbound path described below (`api/webhooks/twilio-sms.js` resolving decisions in-process
> with a service-role Supabase client) was identified as unsafe to expose on a public host
> (Solomon security verdict f3c511c5) and has been carved out into an isolated public relay.
> The relay (separate repo/deploy: `ehg` repo's `sms-relay/`, meant to run as its own Vercel
> project on `hooks.execholdings.ai`) holds no service-role credential and can only
> INSERT-only write candidate replies into a new EHG_Engineer staging table
> (`sms_relay_staging`) via a SECURITY-DEFINER RPC gated by BOTH the anon key AND a
> relay-only shared secret (`sms_relay_secret` table — closes a same-session security-review
> finding that anon-key possession alone was insufficient authentication). The trusted
> resolver described below (`handleInboundSmsReply`) is REUSED UNCHANGED as the consumer
> that drains the staging table, with two additions: ambiguous-reply rejection and a
> persistent auto-suspend circuit breaker. `api/webhooks/twilio-sms.js` itself gained a
> `SMS_RELAY_CUTOVER_COMPLETE` flag that decommissions its direct-write path once the
> operator confirms the relay is live and green — see the relay's own operator runbook,
> `sms-relay/README.md` in the `ehg` repo, for the deployment/cutover checklist and
> `scripts/security/sms-relay-redteam.js` (`npm run security:sms-relay-redteam`) for the
> local/CI-tier red-team acceptance gate. The original architecture below is UNCHANGED
> except for that one inbound carve-out — read it for the outbound send path, the trusted
> resolver's correlation/TTL/single-use logic, and delivery-status handling, all still
> exactly as described.

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

### Additional chairman-gated steps for the relay carve-out (SD-LEO-FEAT-SMS-INBOUND-RELAY-001)

**Required before any live SMS activation** — the above steps alone leave the unsafe
direct-write path as the only live inbound route:

6. Deploy the isolated relay project and set `RELAY_SHARED_SECRET` + the matching
   `sms_relay_secret` DB row — full steps in `sms-relay/README.md` (`ehg` repo).
7. Apply `database/migrations/20260717_sms_relay_staging.sql` (chairman-gated: three new
   RLS-enabled tables outside the delegated-apply scope) via
   `node scripts/apply-migration.js --prod-deploy`.
8. Run `npm run security:sms-relay-redteam -- --target=deployed` and confirm the checklist
   passes before pointing Twilio's webhook at the relay.
9. Only after 6-8 are green: flip Twilio's "A message comes in" webhook to the relay URL,
   then set `SMS_RELAY_CUTOVER_COMPLETE=true` on the EHG_Engineer deployment to decommission
   the old direct-write handler.

## Not in scope (deferred, per the archived plan)

- Full multi-tenant venture-customer-messaging gateway (per-venture quotas, consent
  registry, 10DLC automation, cost attribution) — a separate SD when a venture needs it.
- RCS / WhatsApp / multi-channel.
- Watch integration itself (handled at the OS/phone level, not by this bridge).
