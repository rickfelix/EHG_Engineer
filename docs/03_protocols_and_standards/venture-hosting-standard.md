---
category: protocol
status: approved
version: 1.0.0
author: rickfelix
last_updated: 2026-06-03
tags: [protocol, protocols-and-standards]
---

# Venture Hosting Standard (Cloudflare-default)

**Status:** Active standard — chairman directive, 2026-06-02; **Cloudflare-default re-instated 2026-06-27** (decision `CD30_stack_cloudflare`, which supersedes CD-15's accidental Replit re-lock and re-instates the 2026-06-14 ratified Cloudflare-default standard). Auth = **Clerk** (2026-06-03).
**Applies to:** ALL EHG **portfolio ventures** (the products built via the venture-build / leo_bridge pipeline — e.g. DataDistill, CronGenius).
**Does NOT apply to:** the **platform** — `EHG_Engineer` (LEO orchestrator) and the `EHG` management app — which remain on **Supabase**. This standard governs ventures, not the platform.

> **⭐ Source of truth (do not let this doc drift again).** The authoritative, machine-enforced
> standard lives in CODE, not in this prose: the structured policy in
> **`lib/eva/standards/venture-stack-policy.js`**, enforced by the fail-closed scanner
> **`lib/eva/standards/venture-stack-compliance.js`**, and the per-venture build context written by the
> descriptor-aware **`lib/eva/bridge/build-tasks-writer.js`** + **`lib/eva/bridge/replit-config-writer.js`**.
> The **default deployment target** is selected by descriptor at venture creation
> (`lib/venture-deploy/stack-descriptor.js` + the default-seeding in the venture provisioner); the
> `deployTargetFamily()` fail-safe remains the guard for genuinely invalid/malformed descriptors only.
> This document MIRRORS those files; if they ever disagree, **the code wins** and a `policy-consistency`
> test reds. (Cloudflare-default wired by SD-LEO-INFRA-VENTURE-CLOUDFLARE-DEFAULT-001 after CD-15
> accidentally inherited the un-updated Replit standard; originally guarded by
> SD-LEO-INFRA-VENTURE-STACK-STANDARDS-001 after a hand-authored "Replit Auth" entry drifted.)

## The standard

Every EHG venture defaults to **Cloudflare** hosting (descriptor-driven). **Replit** remains a supported **explicit opt-in for prototyping** (set `deployment_target: 'replit-autoscale'` in the venture's stack descriptor):

| Concern | Standard (Cloudflare-default) | Replit opt-in (prototyping) | Not |
|---|---|---|---|
| **Hosting** | **Cloudflare Pages** (static web apps / control planes) + **Cloudflare Workers** (server runtime, background/cron via Workers + Cron Triggers). **Google Cloud Run** only when a full long-running Node runtime is required. Claude Code builds; Cloudflare hosts. | Replit Deployments — Autoscale (web), Reserved VM (workers), Scheduled (cron ≤11h). | — |
| **Frontend** | **TanStack Start + React 19 + Vite + TypeScript (strict) + Tailwind** (package manager: bun) | same | ~~react-router-dom~~ |
| **Database** | **Cloudflare D1 by default → graduate to Neon Postgres** on the `stakes-router` triggers (`lib/venture-deploy/stakes-router.js`); typed client (Drizzle or `pg`) | Replit Postgres (Neon-backed) via `DATABASE_URL` | ~~Supabase~~ |
| **Auth** | **Clerk** via `@clerk/tanstack-react-start` (clerk.com-hosted). Secret is `VITE_CLERK_PUBLISHABLE_KEY` (VITE-prefixed) passed explicitly to `clerkMiddleware({ publishableKey })` + `<ClerkProvider publishableKey>`; `CLERK_SECRET_KEY` server-only; on first sign-in upsert a local `users` row keyed by `clerk_user_id`. | same | ~~Replit Auth~~ (Agent-only), ~~Supabase Auth~~ |
| **File storage** | **Cloudflare R2** (S3-compatible; sign object URLs via the Workers R2 binding) | Replit Object Storage — sign via the Replit sidecar (`POST http://127.0.0.1:1106/object-storage/signed-object-url`) | ~~Supabase Storage~~ |
| **AI images** | **Google Gemini** (`gemini-2.5-flash-image` via raw `fetch`, `GEMINI_API_KEY`) | same | ~~OpenAI / Replicate (without chairman sign-off)~~ |
| **Errors** | **Sentry** (no-ops gracefully when DSN absent) | same | — |
| **Secrets / credentials** | **Cloudflare Workers secrets / env vars** (or Replit Secrets on the opt-in path); never hardcode | Replit Secrets | ~~Supabase Vault~~ |
| **Spend guardrails** | The 8-point spend-guardrail policy (`lib/venture-deploy/spend-guardrails.js`) is a **hard precondition** before a Cloudflare-default venture goes live (D1 has no hard dollar cap — runaway-invoice risk). | n/a | — |

## Conditional sub-pattern — data-sensitive ventures

A venture that processes **sensitive EXTERNAL data** (e.g. a customer's *production* database) MUST build its heavy data-plane worker as a **portable worker** (connection-string + config in → result out) so the *same* worker can run:

- on a **Cloudflare Worker / Cloud Run background worker** (or a Replit Reserved-VM on the opt-in path) for the MVP/demo (against own / non-sensitive data), **and**
- as a **customer-side agent/container** (in the customer's own VPC) for real sensitive data — which resolves the trust barrier, egress/static-IP constraints, and serverless long-job limits **with zero rewrite**.

The **product remains the hosted SaaS control plane** (Cloudflare-default); the agent is a *data-plane deployment unit*, **not** a CLI product. (First venture applying this: DataDistill — see `docs/` / the venture's vision.)

## Rationale

- Cloudflare is the portfolio's default build/host platform: ~$5/mo vs ~$55/mo on Replit at portfolio scale, and — unlike Replit — it does **not** run vendor AI agents/telemetry on deployed venture infra (the chairman's standing objection). One default stack removes per-venture stack debates and lets ventures reuse Cloudflare primitives (Pages, Workers, R2, D1→Neon).
- Cloudflare Pages fits request-driven web apps; Workers (+ Cron Triggers) fit background/cron; Cloud Run covers full long-running Node runtimes; the customer-side-agent sub-pattern covers what serverless compute can't safely do (long jobs, customer-prod-data trust, stable egress). Replit stays available as an explicit opt-in for fast prototyping.

## Enforcement

- **Architecture plans** (EVA `archplan` / `/brainstorm` Step 9.5C "Stack & Repository Decisions") for any venture MUST specify this stack. A venture arch plan defaulting to Supabase/other hosting is non-conformant.
- **Fail-closed S19 stack QA/QC gate (SD-LEO-INFRA-VENTURE-STACK-STANDARDS-001):** the leo_bridge build consumer (`lib/eva/bridge/venture-build-consumer.js`) scans a venture's `is_current` artifacts against the canonical policy before driving any build leaf; a venture whose artifacts positively specify a forbidden stack (Supabase / Replit Auth / CLI-as-product) is **HELD at Stage 19** (`skipped='stack_noncompliant'`, never advanced). On-demand: `node lib/eva/bridge/venture-build-consumer.js --check-venture <id>`. The post-provisioning conformance checker (`scripts/venture-conformance-check.js`) was reconciled to stop mandating the forbidden `@supabase/supabase-js` / `react-router-dom` / `supabase/` dir.
- **Per-venture stack-enforcing CI, MANDATED by the build pipeline (SD-LEO-INFRA-REQUIRE-STACK-ENFORCING-001):** the build-infra writers (`lib/eva/bridge/build-tasks-writer.js` + `lib/eva/bridge/claude-md-writer.js`) now require every venture to ship committed, **required** CI that runs a venture-stack compliance **code-scan** + build on every PR — the per-PR (per-leaf) code gate the artifact-level S19 gate cannot provide (it scans artifacts, not repo code; how DataDistill's B1 shipped hand-rolled Replit Auth with no flagged dependency). A reusable, dependency-free scanner ships at `lib/eva/bridge/templates/venture-stack-scan.js` (+ drop-in `lib/eva/bridge/templates/venture-stack-compliance.test.template.js`); it reads **imports + file paths**, not just `package.json`. DataDistill is the enforced pilot (committed CI + branch protection requiring the `test` check).
- **(Planned, not yet wired):** record `hosting_platform` per venture in the applications registry (default `cloudflare`, or `replit` on the opt-in path); add a venture-stack protocol section to the DB (`leo_protocol_sections`) so it regenerates into `CLAUDE_PLAN.md`; teach the S19 sprint planner / lifecycle-sd-bridge to seed the **Cloudflare-default** stack into generated venture SDs; a **runtime LEO-side check that each venture repo actually HAS the mandated stack-CI** (the mandate + reusable scanner shipped in SD-LEO-INFRA-REQUIRE-STACK-ENFORCING-001; verifying per-venture adoption at the build gate is the remaining follow-on).

## Companion standard

- **Venture metrics** (`docs/03_protocols_and_standards/venture-metrics-standard.md`, SD-LEO-INFRA-PORTFOLIO-PRODUCT-KPI-001): every venture (Cloudflare-default or Replit opt-in) exposes an authenticated, **aggregates-only** `GET /v1/metrics` that the platform PULLs one-way for portfolio analysis — the platform never opens a venture database. This is how cross-venture portfolio data is gathered despite per-venture isolation.

## Scope boundary (explicit)

- **Platform** (`EHG_Engineer`, `EHG` app): **Supabase** — unchanged, NOT migrated.
- **Ventures**: **Cloudflare-default stack** per this document (Replit available as an explicit prototyping opt-in).
