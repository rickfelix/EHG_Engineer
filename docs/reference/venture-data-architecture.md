# Venture Data Architecture (two-layer)

> **Standard for ventures 2..N**, established during the CronGenius pilot. Companion to the [Venture Pipeline Playbook](./venture-pipeline-playbook.md) (this expands its §6 telemetry contract).
>
> **Core principle: isolation and portfolio-visibility are two *different* problems, so they get two layers — not one shared database.**

Ventures are an **external** trust tier, so their data must **not** live in (or be directly reachable from) the EHG platform database. But EHG still needs a single place to see KPIs across the whole portfolio. The resolution is to separate **where venture data lives** (isolated, per venture) from **how EHG sees it** (a one-way feed).

---

## Layer 1 — each venture owns an isolated operational database

Every venture runs on Replit and uses Replit's native Postgres, reached through the standard `DATABASE_URL` env var. This is the venture's **private operational store** (e.g. CronGenius's `request_audit_log`).

- **Isolated** — no other venture, and not EHG, reads it directly. That's exactly what external trust requires.
- **Native & self-contained** — it ships with the venture's own Replit deploy; no per-venture infra to provision, no shared credentials to leak, and the venture is fully functional independent of EHG.
- **Separate per venture** — CronGenius, Canvas AI, CronLinter (when rebuilt), etc. each get their own.

## Layer 2 — EHG builds the portfolio view by PULLING a feed, never by touching venture databases

EHG (Supabase-backed) periodically calls each venture's authenticated HTTP telemetry endpoint — `GET /v1/metrics` — and stores the returned KPI rollups in its own portfolio tables.

- **Aggregated, not raw** — `/v1/metrics` already returns rollups (total request count; validator-verdict breakdown valid/invalid/not-applicable; average confidence score; mode/model distribution). EHG ingests **those**, not raw audit rows.
- **Authenticated + one-way** — EHG presents the venture's API key (the `REQUIRE_API_KEY` / `CRONGENIUS_API_KEYS` mechanism from Phase 2) to read the endpoint. Data flows **venture → EHG only**; EHG never gets DB access or a write path into the venture. The trust boundary stays intact.
- **Uniform** — every venture exposes the same `/v1/metrics` contract, so EHG's ingestion is **one generic pull per venture**, not bespoke per-venture integration.

---

## Why this shape (vs. the alternatives)

| Alternative | Why rejected |
|---|---|
| Ventures write into EHG's Supabase | Violates external trust — the venture would hold platform DB creds. |
| EHG reads each venture's Postgres directly | Re-couples them (EHG needs every venture's DB creds + schema) and breaks isolation. *This is the trap to avoid — "feed data from the databases" must NOT mean direct DB reads.* |
| **Pull over HTTP `/v1/metrics` (chosen)** | Keeps each venture a sealed box that merely exposes a small, authenticated, standardized KPI surface — scales to the whole portfolio with zero per-venture custom plumbing. |

## What it standardizes for ventures 2..N

**Every venture MUST expose a uniform `/v1/metrics` telemetry endpoint behind its API-key auth.** This becomes a venture-pipeline **requirement**. CronGenius M1 already shipped both halves — the `/v1/metrics` endpoint (Phase 3) + the API-key auth (Phase 2) — so the pattern is **proven, not hypothetical**.

---

## Gap to close (things to address)

- **Target:** venture persists to its own Replit Postgres (`DATABASE_URL`); EHG pulls `/v1/metrics` into a portfolio rollup.
- **Today:** CronGenius's merged code has **no `DATABASE_URL`/Postgres path** — its audit store is Supabase-REST-or-in-memory, so with no DB env set it runs **ephemeral in-memory**. Neither layer is fully wired, though neither blocks running/observing the app today.

**Forward work items:**
1. **Layer 1 (venture-repo change):** add a Postgres store adapter to CronGenius that reads `DATABASE_URL` (so the operational store is durable + isolated). Candidate scope for CronGenius M2 / a follow-on venture SD.
2. **Layer 2 (EHG platform feature):** build the EHG-side telemetry ingestion that pulls each venture's authenticated `/v1/metrics` on a schedule into portfolio rollup tables + surfaces them on the chairman dashboard. Candidate EHG_Engineer SD.

## Still-open design choices (decide when laying it out)

1. **Feed mechanism** — EHG **pulls** `/v1/metrics` on a schedule (recommended; EHG stays passive) vs. ventures **push** events to EHG. *This is the one real design choice* — the recommendation is pull-over-HTTP-metrics precisely to avoid the "EHG reads venture DBs" re-coupling trap.
2. **The `/v1/metrics` contract** — exact fields + versioning, standardized across ventures.
3. **EHG-side storage** — how portfolio KPIs are normalized/stored and surfaced on the chairman dashboard.
4. **Read-key management** — how EHG's per-venture API keys are issued/rotated.

---

*Provenance: CronGenius pilot (first venture), 2026-05-28. Chairman-articulated architecture standard. See the [Venture Pipeline Playbook](./venture-pipeline-playbook.md) §6.*
