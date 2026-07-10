# First-Stranger-Path — Adversarial Pre-Mortem

**Status:** pre-mortem (propose-only, CONST-002) — Solomon on Fable, commission #2, 2026-07-07. Evidence: Sonnet gather-packet (SD states, MarketLens commerce-readiness, email/deliverability, support/feedback, credentials bootstrap), adjudicated cold.
**Premise:** assume the 7-step path (engine doc §4) FAILED to produce a stranger who pays — or pays twice. What was the silent cause?

---

## 0. The structural finding first: THE PROBE DOES NOT NEED THE PRODUCT

The single biggest de-risking move is not a mitigation but a **decoupling**: the current 7-step path serializes demand measurement behind product readiness (DB, auth, payments, email). It doesn't have to. A **waitlist-only landing variant** (no account creation) + CF Analytics + UTM'd outreach measures demand cleanly while the product is unfinished — and *protects the demand signal from being corrupted by product defects* (a signup that 500s or silently evaporates reads as "no demand" when it's actually "broken form").

**Recommendation: split the path into two parallel tracks, joined at first charge.**
- **DEMAND TRACK (can start ~days after deploy Child A):** live URL → waitlist landing variants (both segments, message-test protocol) → minimal gauge (CF Analytics + waitlist table + UTM) → E2 probe + outreach → measured demand verdict.
- **PRODUCT TRACK (parallel):** DB persistence → Clerk auth → transactional email → Stripe → APA gate.
- **JOIN:** probe-validated segment + working product → convert waitlist to first charges.

Everything below assumes this split; several failure modes dissolve under it.

## 1. Ranked failure modes (likelihood × blast), each with its pre-probe mitigation

| # | Failure mode (the silent root) | L×B | Mitigation — must land BEFORE the E2 probe |
|---|---|---|---|
| **F1** | **The bootstrap sitting never happens.** Deploy Child A's only external dependency — GCP project/billing — shows zero evidence of existing (verified: no GCP/CF credential config anywhere findable). Every deploy SD is still `draft`. Nobody owns the sitting; the whole path silently stalls at step 1. | certain-if-unowned × TOTAL | **ONE chairman bootstrap sitting, scheduled now, batching ALL of it** (autonomy-curve class 8): GCP project+billing, CF API token + domain, Stripe account (+ structure decision, III.1), Clerk account, email domain + Resend/DKIM/SPF. One hour, enumerated in advance, unblocks four SDs. |
| **F2** | **Stripe lands on the evaporating user store.** MarketLens auth today = scrypt users in an **in-memory array** + HMAC cookie sessions (verified). If the sellable wave wires payments before DB+Clerk, a paying customer's account evaporates on the next cold start — **a charge without a service** → disputes → processor risk-flag (compounds F8). | high × CATASTROPHIC | Hard ordering dependency IN the sellable SD: **DB persistence → Clerk → THEN Stripe**; APA's persistence assertion gates the sequence. Never payments on memory. |
| **F3** | **Password-recovery/email acceptance is unsatisfiable — so it gets mocked.** APA's acceptance criteria require real recovery + side-effect-honest email; MarketLens has **zero email integration** and **zero deliverability config** (no SPF/DKIM anywhere). The pressured failure mode: a worker mocks the email seam to pass the gate — the exact mock-the-gate disease APA exists to kill. | certain × gate-integrity | Email transport seam + Resend (platform already has the adapter pattern) + domain/DKIM/SPF in the F1 sitting. APA asserts via the **capture transport** (test-mode) so the real path is tested without live sends. Explicit anti-mock note in APA Child B's PRD. |
| **F4** | **The injection surface is ALREADY LIVE, pre-floor.** Verified: marketlens `/feedback` forwards public-origin text into the platform `feedback` table today (env-gated), and platform agents READ that table (sourcing sweeps, triage). The floor is designed but vapor. The probe multiplies exposure (~50 outreach replies within weeks). | medium × EXTREME (harness compromise) | Before the probe: (i) provenance-tag venture-origin feedback rows (`origin: venture_user`) and **exclude them from instruction-following contexts** (one-line consumer patch); (ii) the floor policy ratified in the same sitting as the other lines; (iii) injection canaries in the APA fixture set. |
| **F5** | **Probe measures product breakage, not demand.** If the probe CTA is app-signup, every product defect (evaporating accounts, no confirmation email) corrupts the demand read → false-kill or false-continue of the venture. | high × probe-invalidation | The §0 decoupling: **waitlist-only probe variant** — no account creation in the demand path. Cheap, and it makes the E2 evidence clean by construction. |
| **F6** | **Unmeasured probe.** No funnel machinery exists (verified: zero tables, zero /v1/metrics implementers). Probe runs → numbers live nowhere → E2 evidence unverifiable → the evidence ladder collapses back to E0 anecdotes. | certain-if-unbuilt × evidence-collapse | Minimal gauge slice before probe: CF Web Analytics on the landing + a waitlist table with UTM columns + the canary check. Days of work; full `/v1/metrics` adoption can follow. |
| **F7** | **Stripe risk-freeze at first charges** (horizon III.1): new LLC, thin domain, no support responsiveness — the gatekeeper heuristics fire exactly when the first strangers pay. | medium × revenue-freeze | Legal/trust floor live before charges; **support-reply SLA** (F9's loop) live; gradual charge ramp; account-structure decision + OWNER from the F1 sitting. |
| **F8** | **Nobody answers the first customer.** No support-reply machinery exists anywhere (verified). First paying stranger emails → silence → churn + processor complaint signal. Kills the SECOND payment even when the first succeeds. | high × second-payment | Lean support loop before first charge: support@ address (F1 sitting's domain), agent-drafted replies, approve-then-send graduation, injection floor applies to inbound. |
| **F9** | **The completed landing predates the segment reconciliation.** LANDING-REBUILD-001 completed 07-06 — *before* the JOIN fix named the builder/Explorer segment. The rebuilt landing likely carries consultant-only framing; probing only it under-tests PM2 (segment-spine inversion). | medium × probe-blindspot | Probe ships **both segment variants** per the message-test protocol regardless of the rebuilt landing's framing; the rebuilt landing is variant #1, not the probe. |
| **F10** | **Preview/prod bleed.** Probe traffic must hit the public production URL; preview instances stay gated (CF Access) and non-indexed (edge `X-Robots-Tag` on preview hosts — edge-level so the app stays identical). | low × noise | Checklist item in deploy Child B/C. |

## 2. The compressed action shape

1. **The F1 bootstrap sitting** (one chairman hour, everything batched) — unblocks deploy-A, email, Stripe, Clerk, domain. *Nothing on either track starts without it.*
2. **The §0 track split** — demand track needs only deploy-A + waitlist landing + minimal gauge; product track proceeds in parallel with the F2 ordering rule.
3. **Injection quick-fix** (F4.i — provenance-tag + consumer exclusion) — one small patch, before anything else ingests public text.
4. The policy sitting (motion, injection floor, bandwidth rule, SLO, Stripe structure) as already packaged.

**Pays-TWICE note:** with subscriptions, the second payment is a *non-cancellation*. The second-payment killers here are F8 (silence at first contact) and unmeasured churn (already mitigated: churn/renewal KPIs in the Child-A gauge from day one). Retention *design* stays trigger-gated to the first payment, as adjudicated.

---

*Solomon, propose-only. The two live-today items are F4.i (injection quick-fix) and F1 (the sitting) — both cheap, both currently on nobody.*
