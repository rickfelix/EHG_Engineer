---
category: protocol
status: approved
version: 1.0.0
author: SD-FDBK-ENH-EHG-EMAIL-ADDRESS-001
last_updated: 2026-07-12
tags: [protocol, protocols-and-standards, email, venture-email, governance]
---

# EHG Email-Address Standards

The governed reference for **which email addresses exist and why** — across every
venture and EHG corporate — the same way the standard AI-agent organization
(CEO, VPs, EVA, Adam) standardizes roles. Chairman commission, 2026-07-12:
*"We have some standard AI agent organization. We need some standard email
addresses."*

**Governance rule**: adding, removing, or re-routing a mailbox class **starts by
editing this standard** (a governed PR), never ad-hoc per venture. Provisioning
defaults derive FROM this document — see the appendix.

Every address must have a **named live reader** (an agent or a human). A class
with no live reader is marked **DEFERRED** here rather than invented — an
unread mailbox is worse than none.

---

## 1. Per-venture standard mailbox set

Each venture domain (e.g. `apexniche.ai`) carries this set. Inbound routing
today lands in the **central inbox** (`VENTURE_EMAIL_CENTRAL_INBOX` — referenced
by env name, never hardcoded) via Cloudflare Email Routing; triage from the
central inbox is the reading agent's duty.

| Address | Purpose / rationale | Inbound routing → reader | Send posture |
|---|---|---|---|
| `hello@` | First contact / general inquiries — the public front door | Central inbox → venture CEO agent triage (EVA escalation path) | Routed inbound; replies sent via the venture's scoped send key |
| `support@` | Customer support for the venture's product | Central inbox → venture CEO agent (support duty) | Routed inbound; replies via scoped send key |
| `legal@` | Legal notices, compliance correspondence, DMCA | **DEFERRED** (no live reader yet) — standard target: central inbox → chairman visibility, agent pre-triage | Routed inbound when activated |
| `billing@` | Payment questions, receipts, invoice disputes | **DEFERRED** — standard target: central inbox → venture CEO agent (billing duty) | Routed inbound when activated |
| `security@` | Vulnerability reports (RFC 2142; pairs with a future `security.txt`) | **DEFERRED** — standard target: central inbox → chairman + platform escalation (high-priority triage) | Routed inbound when activated |
| `noreply@` | Transactional sends (signup confirmations, notifications) | **Never routed inbound** — not a mailbox at all | **Send-only**: realized as the venture's per-domain scoped Resend key, not a provisioned mailbox |

Notes:
- **Minimality is deliberate** (venture-simplicity doctrine): six classes, no
  more, until a live reader exists for a seventh.
- **RFC 2142 alignment**: `support@`, `security@`, `billing@`, `abuse@` are the
  RFC's role addresses. `abuse@` is intentionally **not** in the standard set —
  it matters for mail/hosting *providers*; EHG ventures are neither. Revisit if
  a venture ever operates user-generated-content infrastructure.
- The deferred classes exist in the STANDARD so domains reserve consistent
  names; activation = wiring the route + naming the reader, via the defaults
  appendix path.

## 2. EHG-corporate accounts

| Address / identity | Purpose / rationale | Reader / owner | Send posture |
|---|---|---|---|
| `chairman@ehg.ai` | The chairman's operational channel: decision requests, exec summaries, escalations | The Chairman (human) | Live send identity (`RESEND_FROM_EMAIL` default); health-tracked (`chairman_email_channel_health`); **quiet window 23:00–05:00 ET, daily quota enforced** — see the chairman-email-channel liveness reference |
| Adam exec-email lane | Hourly exec summaries + on-demand decision emails | The Chairman (recipient); Adam (sender) | A **send lane riding the `chairman@ehg.ai` identity**, guarded by `exec-email-send-guard` — not a distinct mailbox |
| Central inbox destination | The single inbound aggregation point all venture routes forward to | The chairman-owned inbox behind `VENTURE_EMAIL_CENTRAL_INBOX`; agent triage on top | Inbound aggregation only |
| Platform transactional sends | System notifications from EHG tooling | n/a (send-only) | Send-only via the platform Resend identity; never routed inbound |

Corporate rule: **agents get send *lanes*, not personal mailboxes.** A new agent
duty that needs to email rides an existing identity with its own guard (the Adam
exec-email pattern) unless this standard is amended.

## 3. Conventions

- **Routed vs send-only**: every class above is explicitly one or the other.
  Send-only identities are keys, not mailboxes — nothing to read, nothing to
  leak, nothing to triage.
- **Central-inbox pattern**: ventures do not run per-domain inboxes. All inbound
  forwards to the central inbox; readers are assigned by *class*, not by
  logging into per-venture accounts.
- **Secrets**: send keys follow the pointer convention
  (`venture_channel_secrets` stores refs, values live in the
  `VENTURE_CHANNEL_SECRET_STORE` keyring) — see the provisioning reference.
- **Deliverability posture**: DKIM/SPF/DMARC are provisioned per domain; DMARC
  ships `p=none` and graduates after warmup (provisioning reference,
  Operational notes).

## Appendix — provisioning defaults (wired-today vs standard)

The standard above is the governed **target**. What
`provisionVentureEmail()` (`lib/venture-email/provision-venture-email.js`)
actually wires **today**:

| Class | Today | Standard target |
|---|---|---|
| `hello@`, `support@` | ✅ Inbound routes wired to the central inbox (`routes_wired` step) | As wired |
| `legal@`, `billing@`, `security@` | ❌ Not provisioned | Add to the route set **when activated with a named reader** (follow-up defaults SD derives from this standard) |
| `noreply@` | ✅ Realized as the per-domain scoped Resend send key (no mailbox) | As wired |

Mechanics (step machine, DNS, keys, secrets, observability):
[Venture Email Provisioning](../reference/venture-email-provisioning.md).
Chairman channel rules:
[Chairman Email Channel Liveness](../reference/chairman-email-channel-liveness.md).
