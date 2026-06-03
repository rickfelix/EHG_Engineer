# Venture Hosting Standard (Replit)

**Status:** Active standard — chairman directive, 2026-06-02 (auth corrected to **Clerk** 2026-06-03).
**Applies to:** ALL EHG **portfolio ventures** (the products built via the venture-build / leo_bridge pipeline — e.g. DataDistill, CronGenius).
**Does NOT apply to:** the **platform** — `EHG_Engineer` (LEO orchestrator) and the `EHG` management app — which remain on **Supabase**. This standard governs ventures, not the platform.

> **⭐ Source of truth (do not let this doc drift again).** The authoritative, machine-enforced
> standard lives in CODE, not in this prose: the per-venture build context written by
> **`lib/eva/bridge/claude-md-writer.js`** (lines ~48-62) + **`lib/eva/bridge/build-tasks-writer.js`**,
> re-expressed as structured data in **`lib/eva/standards/venture-stack-policy.js`** and enforced by
> the fail-closed scanner **`lib/eva/standards/venture-stack-compliance.js`**. This document MIRRORS
> those files; if they ever disagree, **the code wins** and a `policy-consistency` test reds. (Wired by
> SD-LEO-INFRA-VENTURE-STACK-STANDARDS-001 after a hand-authored "Replit Auth" entry here drifted from
> the code and propagated into a venture build.)

## The standard

Every EHG venture is hosted on **Replit** using the **Replit-native stack**:

| Concern | Standard | Not |
|---|---|---|
| **Hosting** | Replit Deployments — **Autoscale** (web apps / control planes), **Reserved VM** (always-on / background workers), **Scheduled** (cron, ≤11h timeout). Claude Code builds; Replit hosts — **not** the Replit Agent. | — |
| **Frontend** | **TanStack Start + React 19 + Vite + TypeScript (strict) + Tailwind** (package manager: bun) | ~~react-router-dom~~ |
| **Database** | **Replit Postgres** (Neon/Helium-backed) via `DATABASE_URL`; typed client (Drizzle or `pg`) | ~~Supabase~~ |
| **Auth** | **Clerk** via `@clerk/tanstack-react-start` (clerk.com-hosted). Secret is `VITE_CLERK_PUBLISHABLE_KEY` (VITE-prefixed) passed explicitly to `clerkMiddleware({ publishableKey })` + `<ClerkProvider publishableKey>`; `CLERK_SECRET_KEY` server-only; on first sign-in upsert a local `users` row keyed by `clerk_user_id`. | ~~Replit Auth~~ (Agent-only), ~~Supabase Auth~~ |
| **File storage** | **Replit Object Storage** — sign object URLs via the Replit sidecar (`POST http://127.0.0.1:1106/object-storage/signed-object-url`) | ~~`@google-cloud/storage` local `getSignedUrl()`~~ |
| **AI images** | **Google Gemini** (`gemini-2.5-flash-image` via raw `fetch`, `GEMINI_API_KEY`) | ~~OpenAI / Replicate (without chairman sign-off)~~ |
| **Errors** | **Sentry** (no-ops gracefully when DSN absent) | — |
| **Secrets / credentials** | **Replit Secrets** / env vars only (never hardcode) | ~~Supabase Vault~~ |

## Conditional sub-pattern — data-sensitive ventures

A venture that processes **sensitive EXTERNAL data** (e.g. a customer's *production* database) MUST build its heavy data-plane worker as a **portable worker** (connection-string + config in → result out) so the *same* worker can run:

- on a Replit **Reserved-VM background worker** for the MVP/demo (against own / non-sensitive data), **and**
- as a **customer-side agent/container** (in the customer's own VPC) for real sensitive data — which resolves the trust barrier, egress/static-IP constraints, and Replit's long-job limits **with zero rewrite**.

The **product remains the Replit-hosted SaaS control plane**; the agent is a *data-plane deployment unit*, **not** a CLI product. (First venture applying this: DataDistill — see `docs/` / the venture's vision.)

## Rationale

- Replit is the portfolio's standard build/host platform; one stack removes per-venture stack debates and lets ventures reuse Replit-native primitives (Autoscale, Postgres, Auth, Secrets).
- Replit Autoscale fits request-driven web apps; Reserved VM fits workers; the customer-side-agent sub-pattern covers what Replit-hosted compute can't safely do (long jobs, customer-prod-data trust, stable egress).

## Enforcement

- **Architecture plans** (EVA `archplan` / `/brainstorm` Step 9.5C "Stack & Repository Decisions") for any venture MUST specify this stack. A venture arch plan defaulting to Supabase/other hosting is non-conformant.
- **Fail-closed S19 stack QA/QC gate (SD-LEO-INFRA-VENTURE-STACK-STANDARDS-001):** the leo_bridge build consumer (`lib/eva/bridge/venture-build-consumer.js`) scans a venture's `is_current` artifacts against the canonical policy before driving any build leaf; a venture whose artifacts positively specify a forbidden stack (Supabase / Replit Auth / CLI-as-product) is **HELD at Stage 19** (`skipped='stack_noncompliant'`, never advanced). On-demand: `node lib/eva/bridge/venture-build-consumer.js --check-venture <id>`. The post-provisioning conformance checker (`scripts/venture-conformance-check.js`) was reconciled to stop mandating the forbidden `@supabase/supabase-js` / `react-router-dom` / `supabase/` dir.
- **(Planned, not yet wired):** record `hosting_platform=replit` per venture in the applications registry; add a venture-stack protocol section to the DB (`leo_protocol_sections`) so it regenerates into `CLAUDE_PLAN.md`; teach the S19 sprint planner / lifecycle-sd-bridge to seed the Replit stack into generated venture SDs; a per-leaf EXEC-TO-PLAN / CI **code-level** scan of a build leaf's committed diff (the artifact-level S19 gate above catches drifted instructions, not code a leaf writes anyway — follow-on).

## Companion standard

- **Venture metrics** (`docs/03_protocols_and_standards/venture-metrics-standard.md`, SD-LEO-INFRA-PORTFOLIO-PRODUCT-KPI-001): every Replit-hosted venture exposes an authenticated, **aggregates-only** `GET /v1/metrics` that the platform PULLs one-way for portfolio analysis — the platform never opens a venture database. This is how cross-venture portfolio data is gathered despite per-venture isolation.

## Scope boundary (explicit)

- **Platform** (`EHG_Engineer`, `EHG` app): **Supabase** — unchanged, NOT migrated.
- **Ventures**: **Replit stack** per this document.
