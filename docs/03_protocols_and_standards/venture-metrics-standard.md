# Venture Metrics Standard (`/v1/metrics`)

**Status:** Active standard — SD-LEO-INFRA-PORTFOLIO-PRODUCT-KPI-001, 2026-06-02
**Applies to:** ALL EHG **portfolio ventures** (Replit-hosted products built via the venture pipeline).
**Companion to:** the Venture Hosting Standard (`docs/03_protocols_and_standards/venture-hosting-standard.md`).
**Does NOT apply to:** the platform (`EHG_Engineer`, `EHG` app).

## Why

The Venture Hosting Standard isolates every venture in its own Replit Postgres (no shared DB) — which deliberately severs the easy path to cross-venture data needed for **portfolio analysis**. This standard restores that visibility **safely**: each venture exposes a small, authenticated, **aggregates-only** metrics endpoint that the platform PULLs (one-way). The platform never opens a venture database.

## The standard

Every venture MUST expose an authenticated endpoint:

```
GET /v1/metrics            Authorization: Bearer <read-key>
```

| Requirement | Rule |
|---|---|
| **Auth** | Bearer token **required**. Return **401** when the token is absent/invalid. |
| **Payload** | A versioned JSON `MetricsAggregate`: `contract_version` (e.g. `"1.0"`) + the metric fields. |
| **Aggregates only** | NEVER emit PII, raw rows, identifiers, customer DB contents, or credentials. Counts, sums, ratios only. |
| **Product-KPI block (optional, additive)** | An optional `kpis` object carrying the allowlisted product aggregates (below). |
| **Versioning** | Additive fields ship under the **same major** version. A major bump (`2.x`) is reserved for removals/retypes/required-field changes (the platform consumer accepts `major === 1` and fails-soft on others). |

### Allowlisted product-KPI fields

The `kpis` object may contain ONLY these aggregate fields (the platform **drops anything else** — see Enforcement). Adding a field requires a **data-minimization sign-off**.

| Field | Type / range | Meaning |
|---|---|---|
| `signups` | integer ≥ 0 | New signups in the window |
| `active_users` | integer ≥ 0 | Active users in the window |
| `revenue` | number ≥ 0 | Revenue (aggregate) in the window |
| `usage_volume` | number ≥ 0 | Usage volume (requests/jobs/etc.) |
| `health` | number 0..1 | Health / uptime ratio |
| `churn` | number 0..1 | Churn rate |

### Registration

To participate in the daily pull, register the venture in the `applications` registry:
- `metrics_base_url` — the venture's base URL (the platform appends `/v1/metrics`).
- `metrics_api_key_ref` — the **NAME** of the env var/secret holding the read key (**never the raw key**; rotation = update the secret value, the reference is unchanged).

## Enforcement (platform side — already implemented)

The one-way pull consumer (`scripts/venture-telemetry-pull.mjs`) is the enforcement point — data minimization is **code**, not a promise:

- **`KPI_ALLOWLIST`** — the single source of truth for permitted KPI fields + per-field type/range validators.
- **`validateKpis()`** — extracts ONLY allowlisted, type/range-valid fields; **drops** unknown keys and malformed values (fail-soft, never throws). This **replaced** the former verbatim `raw_payload` passthrough.
- **`venture_telemetry.kpis`** — stores ONLY the validated subset; `raw_payload` now holds a sanitized snapshot of recognized fields only.
- **RLS** — `venture_telemetry` read is restricted to `authenticated` (chairman dashboard) + `service_role`; **no anon read**.
- **`deriveVenturePortfolio()`** — maps validated KPIs onto the EXISTING `ventures` portfolio columns (`health_score`, `projected_revenue`, `risk_score`) — no parallel/duplicate fields.

## Invariants (never violate)

- **One-way**: the platform only ever HTTP-GETs `/v1/metrics`; it never opens or writes a venture DB.
- **Aggregates only**: no PII/raw rows cross the boundary; the allowlist is enforced in code before persistence.
- **Key-by-reference**: `metrics_api_key_ref` is a secret NAME, never a raw key.
- **Fail-soft**: a missing endpoint/key, non-200, bad JSON, unknown contract version, or a dropped KPI field never aborts the pull or clobbers a prior good rollup.

## Governance

Edits to `KPI_ALLOWLIST` (adding/loosening a field) require a **data-minimization sign-off** — this is the choke point against scope-creep into sensitive data.
