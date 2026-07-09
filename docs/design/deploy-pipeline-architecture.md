# Venture Deploy Pipeline — architecture design

**Status:** design proposal (propose-only, CONST-002) — Solomon authored on Fable (time-boxed window), chairman-directed via Adam consult `7ce4183d` (corr `9da03a9e`). Adam co-reviews → chairman.
**The linchpin:** one pipeline serves BOTH mission objectives — (1) a venture actually LIVE for a paying customer (MarketLens: 0 deployments, no host, no URL), and (2) APA's target architecture (§11.1 "ride the deploy path" — impossible until a deploy path exists).
**Companion doc:** `docs/design/apa-automated-product-assessment-design.md` (§11 defines what APA needs from this pipeline).

---

## 0. Grounding — what already exists (build the action for the existing gauge)

This is a **gauge-exists-action-missing** case, and the design deliberately builds TO the existing gauge rather than inventing a parallel one:

| Existing gauge/intent | Where | What the pipeline must satisfy |
|---|---|---|
| **Ratified hosting standard** (chairman, CD30 2026-06-27) | `docs/03_protocols_and_standards/venture-hosting-standard.md`, canonical in `lib/eva/standards/venture-stack-policy.js` | **Cloudflare-default**: Pages (static) + Workers (server runtime) + **Google Cloud Run when a full long-running Node runtime is required**; DB = **D1 default → Neon Postgres** via `lib/venture-deploy/stakes-router.js`; Auth = Clerk; secrets = CF/Workers secrets; errors = Sentry |
| Exit-gate verifiers (observe-only, DORMANT-EXIT-001) | `lib/eva/lifecycle/exit-gate-verifiers.js` | `verifyDeploymentTargetProvisioned`, `verifyPagesUrlLive` (must LIVE-PROBE), `verifyComputeDeployed` — the pipeline is what makes these flip true honestly |
| Schema columns | `ventures.deployment_url`, `ventures.deployment_target`, `ventures.stack_descriptor`, `launch_mode` (+ flip-guard) | pipeline stamps them; `launch_mode=live` becomes *meaningful* only when a production deploy exists |
| Deploy scaffolding code | `lib/venture-deploy/` — `stack-descriptor.js` (target selection at creation), `stakes-router.js` (D1→Neon triggers), `spend-guardrails.js` (8-point policy), `publish.js` | pipeline **consumes** these (consume-the-canonical-function); it does not re-derive target selection, DB graduation, or spend policy |
| S19 gates (fail-closed) | `spend guardrails ready` exit gate; stack-compliance scan | production deploy is gated behind these — the pipeline invokes, never bypasses |
| MarketLens as-built (verified first-hand) | `C:/Users/rickf/Projects/_EHG/marketlens` | Node/Express (`express`, `cors`, `express-rate-limit`, `zod`), `type: module`, node ≥20, **no DB client yet**, `docker-compose.yml` present, **no Dockerfile** — a full-Node runtime ⇒ the standard's **Cloud Run** path today |

**Design consequence (ask 1 answered up front):** the stack question is **already chairman-ratified** — this design does NOT re-litigate it. Render / Railway / Fly.io / K8s are rejected not on merits alone but because adopting any of them would overturn a ratified standard without a chairman decision, and **nothing in the requirements forces that**: Cloud Run covers full-Node + previews + scale-to-zero; Pages/Workers cover static/edge; D1→Neon covers DB. (On pure merits: Fly/Render are credible; K8s violates the solo-chairman/ALL-AI operating model — an ops surface with no ops team. If the standard did not exist, Fly Machines + Neon would be the strongest challenger. It does exist; the machinery below rides it.)

---

## 1. Architecture overview — one primitive, three uses

The whole pipeline reduces to one core primitive plus routing:

```
deployInstance(venture, sha, config_overlay, db_ref) → { url, instance_id, teardown() }
```

- **PRODUCTION** = `deployInstance(v, main_sha, prod_config, main_db)` — persistent, real domain, traffic-serving.
- **PREVIEW** = `deployInstance(v, any_sha, test_mode_overlay, ephemeral_branch(seed))` — no-traffic, TTL'd, unique URL. **This is what APA rides (§11.1).**
- **REPLAY** = `deployInstance(v, incident_sha, test_mode_overlay + injected_clock, ephemeral_branch(captured_state))` — deterministic incident reproduction (§11.2). *Same primitive as preview; only the seed and clock differ.*

Everything below is the concrete realization per the ratified stack.

### 1.1 Compute realization (descriptor-routed)

| Venture shape (from `stack_descriptor`) | Production | Preview (arbitrary SHA) |
|---|---|---|
| Static / frontend | **Cloudflare Pages** project | Pages **preview deployments** (native per-commit URLs — free, built-in) |
| Workers-compatible server | **Cloudflare Worker** | `wrangler versions upload` → **version preview URLs** (native) |
| Full-Node server (Express — MarketLens today) | **Google Cloud Run** service, min-instances=0 (scale-to-zero) | Cloud Run **revision** deployed `--no-traffic --tag preview-<sha>` → unique tagged URL, per-second billed, ~$0 idle |

**Image discipline (makes arbitrary-SHA + replay possible):** venture CI builds and pushes a container image **per commit SHA** (main merges + PR heads) to Artifact Registry, retained N days (main SHAs retained longer for incident replay). A preview/replay is then "deploy the already-built image for SHA X" — no rebuild, deterministic, fast.

**Express-on-Workers note (downgraded to minor DX item — Adam cost-verification 2026-07-07):** the standard's default server runtime is Workers, but the build pipeline produces Express apps, which ride the standard's own Cloud Run hatch. Verified economics: Cloud Run (2M req/mo free tier, scale-to-zero) + D1 (free, no per-DB charge) + Neon (~cents) ⇒ **a new venture is ~$0/mo until real traffic** — so Cloud Run is NOT a factory-economics problem, and Child E can generalize on Cloud Run without a forced Workers migration. A future template move to a Workers-native framework (e.g. Hono) is a DX/idiomatic question only. Do not block anything on it.

### 1.2 Database realization (stakes-router-routed)

| DB tier | Production | Preview/replay branch |
|---|---|---|
| **D1** (default) | per-venture D1 database | ephemeral D1 database created per preview + seeded via the venture's seed hook; torn down with the instance |
| **Neon Postgres** (graduated via stakes-router, or Cloud Run ventures needing real Postgres) | per-venture Neon project (main branch) | **Neon branch** — instant copy-on-write from a seed fixture or from a captured-state snapshot; scale-to-zero; API-first. *The branching primitive maps 1:1 onto preview-seeding and incident-replay.* |

**Parity rule (binding):** a preview's DB technology MUST match production's (a D1 venture previews on D1, a Neon venture on a Neon branch) — DB-tech divergence is outside the test-mode budget (§4) and would mask dialect/behavior defects.

MarketLens today has **no DB client at all** (the fabricated-signup finding's root). When the signup-persistence fix lands it will need one; it should provision per the stakes-router decision at that moment. The MVP deploy (§6 Phase 0) does not wait for it.

### 1.3 Domains, secrets, spend

- **Domains/TLS:** Cloudflare DNS is the portfolio spine. Pages/Workers custom domains are native. Cloud Run services sit behind a Cloudflare-proxied hostname (`marketlens.<portfolio-domain>` → Cloud Run) — stable real URL, TLS, and CF's WAF/caching in front. `ventures.deployment_url` stamps the public URL.
- **Secrets:** CF Workers secrets / Cloud Run + GCP Secret Manager, written by the provisioning step from the platform's secret store; never in repos (standard already mandates). Test-mode previews get the **overlay** secrets (Stripe test keys, capture-transport creds) — never production secrets.
- **Spend:** the 8-point spend-guardrail policy (`spend-guardrails.js`, S19 fail-closed gate) is a hard precondition for production go-live — already enforced, pipeline invokes it. **Previews add:** hard TTL teardown (default 4h, max 24h), Cloud Run max-instances=1–2 for tagged revisions, per-venture preview-count cap, and a budget alarm. Cloudflare has no hard dollar cap (the standard's known D1 risk) — the guardrail policy is the compensating control on both paths.

---

## 2. The preview mechanism (ask 2) — APA's substrate

`preview(venture, sha, fixture) → { url, expires_at }`:

1. Resolve image/artifact for `sha` (Artifact Registry / Pages-Workers build for that commit — already built by CI; if absent, build once and push).
2. Create the ephemeral DB (D1 create / Neon branch) and run the venture's **seed hook** with `fixture` (venture contract: `npm run seed -- --fixture <name>`; fixtures live in the venture repo under `fixtures/`).
3. Deploy the instance with the **test-mode overlay** (§4): Cloud Run tagged no-traffic revision / Pages preview / Workers version preview.
4. Register `{venture, sha, url, db_ref, expires_at}` in a `venture_preview_instances` table (platform-side) — APA, the exit verifiers, and the teardown reaper all read this.
5. Reaper tears down on TTL (delete tagged revision + drop branch/D1). Nothing ephemeral outlives its TTL.

Properties APA needs, satisfied: **arbitrary SHA** (image-per-SHA), **seeded state** (fixture hook / branch), **instrument-not-mock** (real image, config-swapped transports only), **deterministic replay** (same call with captured state + injected clock), **cheap** (no-traffic revisions + CoW branches + TTL ≈ cents).

**Replay data-handling rule (binding — Adam co-review):** seeding a replay branch from **captured production state** puts real user data in front of APA. The captured-state snapshot MUST pass the APA §11.3 **pseudonymize-not-redact** contract *before* the branch is created (deterministic substitutes preserve replayability; raw PII never lands in an ephemeral branch). PLAN adds an explicit data-handling verification for this path.

## 3. The production mechanism (ask 3)

`promote(venture, sha)`:

1. Preconditions (fail-closed, all existing): S19 stack-compliance scan clean, `spend guardrails ready` verifier passes, venture CI green on `sha`.
2. Provision-if-absent (idempotent): Pages project / Worker / Cloud Run service + production DB (per descriptor + stakes-router) + secrets + domain mapping.
3. Deploy `sha`'s image/artifact to the production service **as a no-traffic revision first**; run a **pre-route health gate** (health endpoint probe + a minimal smoke: key routes 200, no boot errors) against the revision's tagged URL; **only then route 100% traffic**. Rollback remains instant (re-route to prior revision), but the pre-route gate keeps a bad revision from ever serving a customer — rollback-after-the-fact is the backstop, not the plan.
4. Stamp `ventures.deployment_url` + `deployment_target`; record the deploy event (SHA, revision, actor, timestamp) in a `venture_deployments` table — **this record is what `verifyComputeDeployed`/`verifyPagesUrlLive` probe against** (and PagesUrlLive still live-probes the URL, per the R3 hand-verify rule — never trusts the row alone).
5. `launch_mode` interaction: production deploy is a *precondition* of `launch_mode=live` (flip-guard reads the deployment record); deploying does not itself flip launch_mode — the chairman-gated flip stays chairman-gated.

## 4. Test-mode config contract (ask 5) — the exhaustive allowed-divergence enumeration

A preview runs the app's **real code** with ONLY these divergences (the overlay is **generated** from prod config + this enumerated list — never hand-edited):

| # | Key | Divergence | Why allowed |
|---|---|---|---|
| 1 | `EMAIL_TRANSPORT=capture` | real send path writes to an inspectable capture sink instead of the live provider | APA side-effect-honesty (the fabricated-email catcher) |
| 2 | `PAYMENTS_MODE=test` | Stripe **test** keys | no real charges; sandbox is Stripe's own supported mode |
| 3 | `CLOCK_SOURCE=injected` | app reads a controllable clock | deterministic replay (§11.2) |
| 4 | `DATABASE_URL=<ephemeral>` | points at the preview branch/instance (same DB tech as prod) | isolation + seeded state |
| 5 | `SEED_HOOKS=enabled` | fixture-loading entrypoint active | seeding; MUST be disabled/absent in prod |
| 6 | `TELEMETRY_SINK=test` | telemetry/errors flow to a captured test sink (still captured — APA asserts on them), not the production channel | don't pollute prod telemetry; keep the signal |
| 7 | `THIRD_PARTY_PROXY=record-replay` *(optional, per-venture declared)* | external API calls routed through a record/replay proxy | determinism for replay; must be declared in the descriptor, not implicit |

**Enforcement (the diff budget):** a config-diff auditor compares the preview's effective config to production's; any key differing outside rows 1–7 is **an APA finding** (`TEST_MODE_DIVERGENCE`). This is what keeps test-mode from quietly becoming a second app.

## 5. "Cannot reproducibly deploy = a FINDING" (ask 6) + pipeline wiring (ask 4)

- **APA wiring:** APA Layer A calls `preview(venture, sha, fixture)`. On failure it emits a deploy-class finding (`DEPLOY_UNREPRODUCIBLE`, evidence = the pipeline error) → canonical triage gate (APA §10.3). The bootability iceberg stays inverted: deploy failures are findings against the venture/pipeline, never APA scoping burden.
- **Stage wiring:** `deployment_target` is already selected by descriptor **at venture creation** (existing `stack-descriptor.js`). **Provisioning executes at S19 entry** (where the spend-guardrail + stack gates already live); production deploy is an S19 exit requirement; `verifyDeploymentTargetProvisioned` binds at S19, `verifyComputeDeployed`/`verifyPagesUrlLive` bind at/after actual deploy (S19 exit / S20+) — exactly the R3/R4/R5 post-deploy binding rule already flagged into DORMANT-EXIT-001's PLAN. **Preview capability activates earlier (S16+, as soon as the repo builds)** because APA Phase 2 and the design-fidelity loops want pre-launch instances.
- **Observe-only → binding:** the three verifiers stay observe-only until the pipeline gives them something real to verify, then flip per DORMANT-EXIT-001's declared exit criterion (≥25 evals/48h, zero false-reject, named flipper). The pipeline is what makes flipping them honest.

## 6. SD decomposition + phasing (ask 7) — minimal-first, factory-later

**Parent: `SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001`** (umbrella; rides the ratified standard).

| Child | Scope | Tier | Depends on |
|---|---|---|---|
| **A — MarketLens production MVP** *(objective 1, fastest path)* | Dockerfile (trivial for Express) + CI image-per-SHA → Artifact Registry + one Cloud Run service (scale-to-zero) + CF-proxied hostname + secrets (**enumerate required env — MarketLens hard-crashes without `SESSION_SECRET`**) + **DB provisioned NOW per stakes-router** (verified pricing: D1 = $0/no per-DB charge; Neon branches ≈ $0.002/hr — provisioning is ~free and is what makes the deploy a product, not a demo) + deploy main → **live URL stamped in `ventures.deployment_url`**. **Framing (Adam correction): days to a live URL; the CUSTOMER-READY product = Child A + signup-persistence wired to that DB** — a scale-to-zero service with an in-memory user store evaporates accounts on every cold start (see §7 risk 6). | Sonnet-able infra | — |
| **B — Preview/replay primitive** *(objective 2 — APA's dependency)* | `preview(sha, fixture)`: tagged no-traffic revisions + ephemeral DB (D1 create / Neon branch) + seed-hook contract + `venture_preview_instances` registry + TTL reaper. | Sonnet/medium | A |
| **C — Test-mode overlay + diff auditor** | the §4 enumeration as generated overlay + the config-diff auditor emitting `TEST_MODE_DIVERGENCE`. | Sonnet | B |
| **D — Pipeline/gate wiring** | S19-entry provisioning step + `venture_deployments` record + verifier binding (per R3/R4/R5 rule) + `DEPLOY_UNREPRODUCIBLE` → triage-gate hook + launch_mode precondition. | Sonnet | A |
| **E — Factory generalization** | descriptor-driven multi-target provisioning for ALL ventures (Pages/Workers paths, domain automation, stakes-router DB graduation, per-venture stack-CI adoption check). | medium | A–D patterns proven on MarketLens |

**Phasing:**
- **Phase 0 (days — do first): Child A.** MarketLens live at a real URL. Also the fastest reality-test of the whole stack choice, and it flips `verifyComputeDeployed` from vacuous to meaningful.
- **Phase 1: Child B.** The preview primitive — **this is APA's §11.1 exit-from-interim**: the moment `preview()` works for MarketLens, APA Child A's local-sandbox interim has its declared exit available.
- **Phase 2: C + D.** Test-mode contract enforced; gates bound; findings routed.
- **Phase 3: E.** Generalize to the factory only after the flagship proves the pattern (mission discipline: prove ONE venture end-to-end first).

**Sequencing note (revised per Adam co-review — avoid build-then-discard):** if deploy Child B (the preview primitive) lands soon after A, APA's local-sandbox interim may never be worth building. **Resolution: make APA Child A's scope CONDITIONAL, decided at its PLAN:** if `preview()` is live (or clearly ≤days away) when APA Child A is claimed, APA consumes `preview()` directly and the interim is **skipped entirely**; the interim is built only if deploy-B has slipped and APA would otherwise block behind it (the interim is schedule insurance, not a deliverable). This conditional goes into APA Child A's `prd_scope_requirement` stamp alongside the existing §11 conformance gate.

## 7. Risks / hand-verify at PLAN

1. **GCP account/billing bootstrap** — Cloud Run needs a GCP project + billing; this is a one-time chairman-adjacent setup (credentials into the platform secret store). Verify early; it's Child A's only true external dependency.
2. **Image-retention cost vs replay window** — retain main-SHA images long enough for incident replay (suggest 90d) but cap PR-head retention (7d); verify Artifact Registry costs stay in guardrail budget.
3. **Seed-hook contract adoption** — ventures must ship `npm run seed --fixture` + fixtures; add to the venture template + stack-CI check so it's factory-default, not per-venture heroics.
4. **Preview URL auth** — preview instances must not be publicly indexable/abusable: gate behind a shared-secret header or CF Access; APA's executor sends the header. Sits *in front of* the app rather than inside it, so it is not a §4 config divergence — **but it IS a real prod-vs-preview environmental difference** (prod public, preview gated), and APA must account for it: assertions must never attribute the auth wall's behavior (redirects, 403s) to the app itself, and any user-flow that interacts with the *edge* (caching, headers) gets verified against production during the §3 pre-route smoke, not only in previews.
5. **Workers-path previews for D1** — D1 ephemeral create+seed latency at scale is unproven; validate in Child E before factory rollout (MarketLens doesn't hit this path).
6. **In-memory state under scale-to-zero (venture-template rule, surfaced by MarketLens):** `express-rate-limit`'s default memory store, in-memory sessions, and in-memory user stores do not survive cold starts or multi-instance fan-out — on a scale-to-zero service, accounts/sessions/limits silently evaporate. Factory rule: **venture app processes are stateless; all durable state lives in the venture DB (or explicit store)**. For MarketLens this is another reason Child A provisions the DB immediately (accounts, sessions, rate-limit store move there with the signup-persistence fix). Add a stateless-process check to the venture stack-CI scan (Child E).

---

*Solomon design proposal — propose-only. Grounded in the ratified Cloudflare-default hosting standard (CD30), the existing `lib/venture-deploy/*` scaffolding, the DORMANT-EXIT-001 verifier work, and APA §11. Adam co-reviews, then chairman. No SD is filed by Solomon.*
