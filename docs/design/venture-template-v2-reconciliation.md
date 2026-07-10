# Venture Template v2 — reconciled requirement spec

**Status:** reconciliation (propose-only, CONST-002) — Solomon on Fable, commission #3, 2026-07-07. Sources: faithful Sonnet extraction from the six design docs (deploy A1–A10, APA B1–B6, journey C1–C5, demand-engine D1–D10, doctrine E∅, selection F1–F3); Solomon reconciled cold.
**Why this doc exists:** six independent streams converge on the venture template with no owner; without one spec, each implementation SD patches independently and the drift compounds into every future venture. **This doc is the template's requirement SSOT; template-touching SDs cite it, not their originating design doc.**

---

## 1. The reconciled spec — five layers

### T1 — FILES every venture repo ships
| Req | Source | Notes |
|---|---|---|
| `Dockerfile` (or Workers/Pages equivalent per descriptor) | A7 | deploy path artifact |
| `fixtures/` + `npm run seed -- --fixture <name>` | A3, A8 | disabled outside test-mode (T3.3) |
| `sitemap.xml`, `robots.txt`, meta/OG tags, structured data | D1 | prod-only indexing — see conflict R3 |
| `env.manifest` — enumerated required env (SESSION_SECRET-class), validated fail-fast at boot | A6 | boot exits with a clear error on missing env, never a runtime crash |
| `/feedback` page/route | B2 | with T2.4 provenance discipline |

### T2 — CODE MODULES the template provides
1. **Metrics endpoint** `GET /v1/metrics` (Bearer-auth, versioned MetricsAggregate) exposing the allowlist **`visitors` (new), `signups`, `active_users`, `revenue`, `usage_volume`, `health`, `churn` + renewal events** — D2, D3, D7, F2. (`paid` is deliberately NOT app-exposed — platform reads the Stripe ledger; the app never self-reports revenue truth — D4.)
2. **Email transport seam** — ALL outbound mail goes through one transport interface, selected by config: real provider (Resend-pattern) in prod, **capture transport** in test-mode — derived from A§4.1 + B side-effect honesty + the premortem F3 (real transactional email is coming; the SEAM is what makes capture-vs-real a config swap instead of a mock). *This seam is the template's single most load-bearing new module.*
3. **DB-backed state stores by default** — users, sessions, rate-limit counters ship DB-backed, never in-memory — A9 (stateless-process rule; MarketLens's evaporating users are the type case).
4. **Feedback + error capture with provenance + step-IDs** — feedback/error forwarding stamps `origin: venture_user` (public-origin = DATA never instructions — D5, premortem F4) and errors carry the reproduction-grade contract fields incl. **journey `step_id`** — B3, B4, C2. **Derived requirement: a journey-step runtime annotation convention** (route/action → `step_id` mapping the app can stamp at capture time) — the journey artifact's IDs are useless to telemetry unless the running app knows which step it's on.
5. **Attribution stamping** — UTM capture + first-touch attribution written at signup — D9.
6. **Variant support** — landing/message variant parameter honored and reported through metrics (message-test protocol) — D8.
7. **Canary tagging** — synthetic canary traffic (header-tagged) excluded from real KPIs but visible to liveness checks — derived from D6 (the gauge-liveness proof needs canaries that don't pollute the funnel).

### T3 — CONFIG CONTRACTS
1. **Secrets**: never in repo; provisioned from the platform store; previews get overlay secrets only — A2.
2. **Test-mode overlay** — generated, never hand-edited; exactly the enumerated divergences: `EMAIL_TRANSPORT=capture`, `PAYMENTS_MODE=test`, `CLOCK_SOURCE=injected`, `DATABASE_URL=<ephemeral>`, `SEED_HOOKS=enabled`, `TELEMETRY_SINK=test`, `THIRD_PARTY_PROXY=record-replay` (declared per-venture) — A4; any other divergence = `TEST_MODE_DIVERGENCE` finding — A5. **Amendment (1→N, selection-design c2): the side-effect channel list is DECLARED in the venture descriptor** (email/payments/SMS/webhooks…) and the overlay + APA honesty assertions GENERATE from the declaration — the enumeration is schema-driven, not hardcoded 7.
3. `SEED_HOOKS` absent/disabled in prod — A4.
4. Preview instances: gated (CF Access/shared header) + non-indexed via **edge** `X-Robots-Tag` — A10 + resolution R3.

### T4 — STACK-CI CHECKS (the enforcement)
Image-per-SHA build+push (A1) · stateless-process scan (A9) · SEO files present (D1) · `/v1/metrics` implemented + allowlist-conformant (D2) · seed hook present + prod-disabled (A8/T3.3) · env.manifest validated (A6) · provenance tag on feedback/error forwarding (T2.4) · test-mode overlay conformance (A5). *One scanner, one report — extends the existing `venture-stack-scan.js`, not a second linter.*

### T5 — PLATFORM-SIDE COUNTERPARTS (not in the venture repo, but the contract's other half)
Unified registry entries (journey C1/C5, thesis F1) · telemetry puller → `venture_telemetry.kpis` (existing) · Stripe-ledger reader for `paid` (D4) · `venture_preview_instances` + TTL reaper (deploy) · idea-provenance record at venture creation, surviving clones (F3 — pipeline-side, NOT repo-side; noted here so no SD wrongly puts it in the template).

## 2. Conflicts resolved (the reconciliation itself)

- **R1 — Email: capture vs real.** A§4 says capture in test-mode; the premortem requires real transactional email; APA forbids mocks. Resolution: the **transport seam** (T2.2) — one interface, config-selected. A mock replaces the seam; the capture transport plugs INTO it. Anti-mock language goes in APA Child B's PRD.
- **R2 — `paid` KPI vs app self-reporting.** D3 lists `revenue` in the app's allowlist while D4 says never trust the app's claim. Resolution: the app MAY expose `revenue`/`usage` as *its own view* (useful for divergence detection), but the funnel gauge's `paid` stage binds to the **Stripe ledger only**; a mismatch between the two is itself a finding (10.2a data-provenance applied to the venture's self-report).
- **R3 — SEO files vs preview instances.** Sitemap/robots must exist (D1) but previews must not be indexed (A10). Resolution: **edge-level** `X-Robots-Tag: noindex` on preview hostnames — the app's files stay byte-identical in both environments, preserving the test-mode divergence budget.
- **R4 — Journey step-IDs vs runtime ignorance.** C2 gives artifacts durable IDs; B3/B4 require telemetry to stamp them — but nothing tells the *running app* its current step. Resolution: the **runtime annotation convention** (T2.4-derived) — generated route/action→step_id map shipped with the build, consumed by the capture module. New requirement, owned by the journey SD.
- **R5 — Hardcoded lists anywhere.** The demand engine killed the hardcoded 6-channel list; the same disease was about to re-enter via a hardcoded 7-divergence overlay and a fixed KPI list. Resolution: **descriptor-declared side-effect channels** (T3.2 amendment) and the KPI allowlist owned by the metrics standard (one owner, versioned — the `visitors` addition goes through that owner, per the engine's own risk note).
- **R6 — Who owns template changes.** Six SDs were about to patch independently. Resolution: **this doc is the template requirement SSOT**; every template-touching SD cites the T-item it implements; new requirements from future designs are ADDED HERE first (one-line PR to this doc), then implemented. Cheap discipline, kills the drift class.

## 3. Ownership map (prevents double-build)

| T-item | Owning SD (existing/planned) |
|---|---|
| T1 Dockerfile/fixtures/env.manifest, T3 overlay+secrets | deploy pipeline children A/C/D |
| T1 SEO, T2.1 metrics, T2.5 attribution, T2.6 variants, T2.7 canary | demand-engine children A/C |
| T2.2 email seam | sellable wave (with premortem F3 mitigation) |
| T2.3 DB-backed stores | sellable wave (ordering rule F2: before Stripe) |
| T2.4 provenance + step-ID capture | telemetry extension (APA §11.3) + journey SD (R4 map) |
| T1 /feedback | already live in MarketLens; template-ize + provenance patch (premortem F4.i) |
| T4 scanner | extends REQUIRE-STACK-ENFORCING-001's `venture-stack-scan.js` |
| T5 items | registry/deploy/demand SDs as marked |

## 4. What each stream contributed (audit trail)
Deploy: T1 files, T3 contracts, T4 image/stateless — the *instance* layer. APA: honesty/provenance/capture contracts — the *truth* layer. Journey: step-IDs + R4 — the *reference* layer. Demand engine: metrics/SEO/attribution/variants/canary — the *measurement* layer. Selection: thesis/idea-provenance (T5) + the schema-driven amendment (R5). Doctrine: no repo requirements (honest ∅ — it governs allocation, not templates).

---

*Solomon, propose-only. R6 is the load-bearing governance line: adopt it and the drift class dies; skip it and this doc becomes one more stream. MarketLens retrofit note: the template applies to the FRESH RUN and future ventures; MarketLens-current gets only the premortem's targeted fixes (F2 ordering, F4.i provenance patch), not a wholesale retrofit.*
