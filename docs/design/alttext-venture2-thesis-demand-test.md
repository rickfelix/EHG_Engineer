# Venture-2 (Image Alt Text Generator) — Thesis Completion + Demand-Test Design

**Status:** Solomon-authored (Fable 5 / high, 2026-07-12), propose-only. Chairman-ratified commission (~6:50 AM ET: exit HELD, venture-2 PICKED). Fable-DESIGNED / cheap-RUN: everything below executes on Sonnet seats + the factory with zero Fable dependency. Committed at creation on qf-736. Working name only — naming/brand runs through the factory's identity stages, not this doc.

---

## A. The completed thesis (per the ratified adjudication frame)

**WHO (one workflow-buyer beachhead):** digital agencies and accessibility consultants managing **many client sites** (10+ sites, hundreds-to-thousands of images each) on WordPress/Shopify. NOT individual bloggers or hobby sites — they churn to free ChatGPT and were the exact failure mode the niche-content adjudication flagged.

**WHAT (the wedge):** bulk **site-crawl → alt-text generation → CMS-ready write-back**, plus a **per-site compliance report** (WCAG 1.1.1 coverage before/after). The report is the wedge, not the generation: agencies resell it to their clients as billable accessibility remediation — the tool becomes a revenue enabler for the buyer, not a cost line.

**WTP mechanism (compliance-driven, non-discretionary):** the European Accessibility Act has been enforceable since June 2025; US ADA digital-accessibility suits run thousands per year, and missing image alt text is among the most-cited WCAG failures. Agencies already bill remediation; per-site compliance tooling is spend they pass through. This is the LedgerPilot spend-class logic applied for real.

**Substitute defense (structural, not hopeful):** raw ChatGPT does one image at a time with no crawl, no CMS write-back, no per-site report, and no recurrence. The paid value is **bulk + integration + report + monitoring cadence** (new images keep arriving — compliance is a subscription-shaped problem).

**Unit economics sketch (targets E2 — named comparables, not asserted):** direct comparable **AltText.ai** exists (tiered ~$5–49/mo by image volume — that is market VALIDATION and an incumbent; our wedge is agency multi-site compliance reporting vs their single-site angle); adjacent anchors accessiBe/UserWay ($49–490/mo per site class). Anchor pricing: **agency tier $29/mo per active site** (volume-capped, credits above). COGS = vision-model inference (sub-cent/image) + crawl compute → **GM >85%**. CAC target: organic + community + bounded outreach → the test MEASURES it (K3). *Honesty note: the two 90-scores in the engine's slate were engine-scored; this thesis stands on the comparables above, not on those scores.*

**Three pre-registered kills (stage + threshold + real gauge; armed at O2 when the venture row exists):**
- **K1 (demand-validation kill):** landing→qualified-signup conversion **< 2.0%** after the full sample (floor: ≥300 unique visitors) at demand-test end → KILL. Gauge: CF Web Analytics visitors + form-event rows. 
- **K2 (pays-despite-free kill):** **0 card-verified preorders/pilot commitments** after the full sample (floor: ≥30 delivered outreach contacts + the visitor floor) → KILL. Gauge: Stripe checkout events (the real rail).
- **K3 (economics kill):** measured test-channel CAC implies **LTV/CAC < 3** at anchor pricing with observed conversion → KILL. Gauge: channel spend/effort log ÷ qualified signups, LTV from the §A economics at 18%/yr churn assumption (revisited with real churn only post-build).
All three inherit the honest-gauge rule: **a gauge whose floor is unmet renders NO-DATA and produces NO verdict** — the test extends or dies on chairman call; it never manufactures a number.

## B. Demand-test design (test-before-build; Stage-21 doctrine; Sonnet-executable)

**Artifacts (built by Sonnet seats + the factory):**
1. Landing page on the ratified stack (Cloudflare Pages via the deploy pipeline's preview→promote; SEO basics per the venture-hosting companion standard) — problem/promise/pricing + a **sample compliance report** as the hero proof artifact.
2. The sample report itself (one real crawl of a consenting/test site; creative-engine assets per the recovered provider spec — RunwayML-primary applies to imagery).
3. Preorder checkout: Stripe, **test-mode until the chairman flips live** (live-mode money movement is row-7 authority — pre-flagged here; K2 counts only card-verified commitments, so the live flip is REQUIRED before K2 can conclude).
4. Outreach kit: 50-contact agency list (accessibility consultancies, WP agencies), templates, and a reply-tracking sheet.

**Channels (capability-envelope honest — only what the factory can GENUINELY execute today):**
- **C1 outreach (primary) — AMENDED 2026-07-12 BEFORE FIRST TOUCH (email-architecture adjudication, consult e16f1379):** the original bounded-50 email sequence via the platform rail was a latent AUP violation — Resend (and transactional providers generally) prohibit cold outreach, and running it would put the account carrying ALL ventures' transactional mail at risk. C1 is now TWO steps: (i) the 50 contacts get **manual, personalized one-to-one B2B email** (genuine correspondence, opt-out honored, suppression kept — lowest-risk AND fastest, since a cold-tool would need weeks of warmup); (ii) the **Resend rail carries only opt-in sequences** for emails captured on the landing page. **K2's sample floor is correspondingly amended, pre-registered here before any send:** "≥30 delivered outreach contacts" now reads "≥30 outreach touches delivered (manual one-to-one) OR ≥30 opt-in captures sequenced." K1, all thresholds, and the verdict table are UNCHANGED — floors amended in the open before the test, never renegotiated during it.
- **C2 communities (secondary):** 2–3 agent-drafted, chairman-approved posts (r/webdev, WP/accessibility communities) — graduated-autonomy rules for outward acts apply.
- **C3 organic/SEO (passive):** the landing page's SEO basics + one pillar page ("WCAG 1.1.1 compliance checker") — expected to contribute little inside the window; measured, not relied on.
- **Explicitly NOT in this test:** paid ads (no spend pre-E2 per the demand-engine doctrine), marketplace listings (slower than the test window).

**Duration + floors:** **14 days from first outreach delivery**, extendable once by chairman call if floors are unmet (NO-DATA ≠ failure). Floors: ≥300 unique visitors AND ≥30 delivered outreach contacts before any verdict.

**Pre-registered verdict table (sealed now, in the open — this is a demand test, not a blind probe):**
- **PROCEED-TO-BUILD:** conversion ≥ 4.0% AND ≥ 3 card-verified preorders/pilots.
- **ITERATE (one revision, one re-test):** conversion 2.0–4.0% OR ≥1 preorder with qualitative pull (replies asking for specific capability) — revise the wedge, not the thesis.
- **KILL:** any K1–K3 fires on a met floor. Kill executes without renegotiation; the thesis returns to the nursery with the evidence attached.

**Run ownership + gauges:** a Sonnet seat owns the runbook (build artifacts → route outreach through the gate → log daily); all gauges write the evidence fabric with mechanical provenance (`real_event` for genuine stranger signals — this is the fabric's first real-provenance consumer); the demand plan and its execution land as Stage-21 artifacts on the venture row so the factory record is the SSOT, not a side spreadsheet.

## C. The build-gate line (both must hold; neither alone suffices)

**Venture-2 BUILD starts only when: (1) the demand test's verdict is PROCEED-TO-BUILD** (thresholds above, floors met, gauges real) **AND (2) Phase-1 exit is ratified** (ApexNiche traversal complete + Probe-ALPHA graded PASS). If demand proves out first, the venture waits at the gate with its evidence banked — demand truth does not expire in weeks; an unproven factory building a proven idea is still the wrong order. If Phase-1 exits first, the test simply finishes. **Counterfactual:** if the chairman rules the window cost of waiting exceeds the double-proof value, build-on-demand-alone is the fallback — with ALPHA's run pre-scheduled as the build's first parallel act, same structure as the exit counterfactual he already held.

*Propose-only. Adam sources the demand-test work items (Sonnet-sized); the chairman holds the live-mode flip (K2 precondition) and the verdict on ITERATE/extend. The adjudication frame re-runs on the completed thesis before build, per standing process.*
