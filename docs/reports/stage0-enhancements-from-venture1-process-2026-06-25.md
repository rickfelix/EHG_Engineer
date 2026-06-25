# Stage-0 Enhancements — Dogfooding Our Venture-1 Selection Into the Factory (2026-06-25)

**Source:** workflow `wv4579pn3` (11 agents, code-grounded, verify-gated — 6/6 enhancements confirmed-missing, 0 rejected). Premise: we found venture-1 by a rich HAND process and bypassed Stage 0; the steps Stage 0 *doesn't* do should be folded back in so the factory self-sources as well as we did. This is compounding/self-improvement applied to the ideation/selection front-end.

## Confirmed: we bypassed Stage 0
The factory's Stage-0 path (queue-processor → 5 single-LLM discovery strategies → deterministic 5-field rank → 14 single-LLM synthesis components → **non-adversarial shape-validation "chairman review"**) would have produced a single-model brief with **no payer/channel/triangulation/first-dollar analysis.** We instead ran: cross-repo built-vs-lipstick audit → capability-reuse-first → adversarial verify-premise against code/DB → multi-model deep-research triangulation → payer-vs-audience split → channel-fit vs our real adapters → stack-grounded cost → anti-manufacturing conviction → thin-path-to-first-dollar.

**The key meta-finding:** the two highest-value techniques correspond to engines that **already exist in the repo but are imported NOWHERE in `lib/eva/stage-zero/`** — so the top fixes are *wiring*, not new builds.

## The 6 verified enhancements (ranked)
| # | Pri | Effort | Enhancement | Fold-in |
|---|---|---|---|---|
| 1 | HIGH | medium | **Wire the deep-research triangulation engine** (`research-engine.js runResearch deep:true` — Anthropic+OpenAI+Google) into Stage-0 top-candidate validation (3–4 fixed strategic questions). It's built + robust, imported nowhere in stage-zero. *This is the technique that caught the payer split.* | (d) triangulation |
| 2 | HIGH | medium | **Payer-vs-audience split + channel-fit** — decompose `target_market` into `{acquisition_audience, paying_customer}`, flag divergence (consultants-pay-not-founders), and check fit against the **real publisher adapter inventory** (not LLM-invented channels). | (e)+(f) |
| 3 | HIGH | small | **Run the existing Devil's-Advocate skeptic at the Stage-0 brief** — `devils-advocate.js` exists but is gated only to kill stages 3/5/13/17/18/23/24; it never reviews the Stage-0 brief (chairman-review is shape-validation only). Require ≥2 counter-arguments before `persistVentureBrief`. | (c) adversarial verify |
| 4 | MED | medium | **First-class capability-reuse-first sourcing path** (`capability_externalize` strategy: start from a NAMED high-maturity internal asset → its external market). Today it's a weak prompt prior that's *de-weighted* exactly in venture-1's immature-portfolio condition. | (b) |
| 5 | MED | medium | **Thin-path-to-first-dollar scoping + anti-manufacturing conviction guard** at chairman-review (scope the minimal flow to one real paid charge; explicit first-dollar done-condition). | (h)+(i) |
| 6 | LOW | QF | **Fix the hardcoded-wrong-stack bug** — `build-cost-estimation.js:46` hardcodes "Supabase + Vercel/Node.js", contradicting the approved Replit/Neon/Clerk Venture Hosting Standard. A one-line correction (+ optional Tavily live pricing). | (g) |

## Recommendation (sequencing)
- **These are for venture-2+ (Stage-0 self-sourcing), NOT venture-1** — venture-1 is seeded directly, bypassing Stage 0, so none of these block it. Don't let them distract the venture-1 kickoff.
- **Source them when we're ready to let the factory pick the NEXT venture** — ideally after venture-1 proves the factory *earns*. At that point the 3 HIGH wiring SDs (triangulation, payer/channel, devil's-advocate-at-ideation) are the priority and are mostly wiring existing engines (cheap, high-leverage).
- **Exception: the QF (#6, wrong-stack bug) is worth fixing anytime** — it's a cheap, real defect that would mis-cost every future venture.
- Per the partnership contract: Adam authors the DRAFT SDs, the coordinator dispatches.

## The compounding takeaway
Our hand-process was effectively a **spec for the factory's ideation upgrade.** The factory has the hard parts (the triangulation engine, the skeptic engine) — it just doesn't point them at venture *selection*. Wiring them in is the literal mechanism by which "one venture's learning makes the next better" — the holding-company compounding thesis, applied to how ventures are chosen.
