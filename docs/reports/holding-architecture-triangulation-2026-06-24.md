# Holding-Company Architecture — Deep-Research Triangulation (2026-06-24)

**Engine:** `lib/research/research-engine.js runResearch(deep:true)` — Anthropic (extended thinking) + OpenAI (o3) + Google (Gemini high-thinking), 4 questions, 3/3 providers each, confidence **0.76–0.92**. Companion to the internal code-grounded review. Raw: `.prd-payloads/architecture-triangulation-results.json`.

## The decisive reframe: Neon makes isolation FREE, so the cost case for "keep-in-EHG-then-peel-off" collapses
The cost instinct was **right** — Supabase *is* expensive at portfolio scale (conf 0.92): ~$10/mo minimum **per always-on database/project**, uneconomic past ~5 ventures, **~$400–500/mo wasted at 50 ventures (~$5–6k/yr)**. But the conclusion flips: a **dormant Neon project costs ~$0.10–0.50/mo** (scale-to-zero), so you can run **50 isolated, exit-separable databases for less than one Supabase Pro project.** That **neutralizes the entire cost argument for born-shared incubation** — isolation is no longer in tension with cost. *Born-isolated doesn't mean born-expensive; it means born-clean.*

## Compounding vs isolation is a FALSE dichotomy — the three-layer answer
All three providers converged: compounding does **NOT** require sharing databases or customer data. The clean pattern is a strict **three-layer separation**:
1. **Per-venture customer-data layer** — fully isolated Neon DB per venture, never cross-accessed.
2. **Shared capability layer** — reusable code/modules/service APIs (monorepo / package registry), **zero data coupling**.
3. **Shared intelligence hub** — holds **only sanitized, aggregated, non-PII metadata** (patterns, conversion benchmarks, what-worked playbooks, prompt libraries, A/B results). Ventures **emit learnings UP** (one-way async events); ventures **consume FROM the hub DOWN** (one-way config/recommendation pull). **Customer data never crosses a venture boundary.**

So compounding (capabilities + intelligence) and isolation (customer data) operate on **entirely separate planes**. You get both.

## Verdict: Model A (born-isolated on Neon) + the three-layer hub
- **Anthropic** (deepest reasoning): strongly Model A — B/C "defer pain rather than eliminate it"; **exit-separability is the silent decision-killer for B/C** (live data migration + re-auth + URL cutover under a *buyer's* timeline is the highest-risk event a solo+AI operator will face); Model A turns that future crisis into a non-event ("hand the buyer a connection string and a repo").
- **OpenAI + Google**: leaned Model C (staged hybrid) — **but only "with strict separation boundaries defined upfront"** (schema-per-venture, venture-namespaced auth, API-based access from day zero).
- **The reconciliation:** those Model-C caveats *collapse into* born-isolated. The triangulation's sharpest point: **the hardest separation artifact is NOT the database — it's shared auth (identity spanning ventures) + cross-venture foreign keys.** If you incubate shared you must enforce schema-per-venture + namespaced auth from day zero *anyway* to keep separation possible — at which point you've taken on born-isolated's discipline **without** its clean payoff, and Neon already made it free. → **Born-isolated wins.**

This **externally validates the existing approved Venture Hosting Standard** (born-isolated Neon/Replit/Clerk) and the Neon choice — and adds the missing piece: the **three-layer hub** for compounding.

## The gotchas (already handled by the standard)
Neon's real risks aren't price — they're **cold starts** (500ms–3s first query after idle) and the **loss of Supabase's bundled auth/storage/realtime**, requiring substitutions. The venture-hosting standard **already mandates those substitutions** (Clerk for auth, Replit Object Storage) — so the gotchas are pre-solved. Cold-start mitigation (connection pooling / warming) is the one operational item to note.

## Implications for venture-1
- **Born-isolated on Neon from day one** (= the existing standard; no change). The cost concern that prompted "keep-in-EHG-then-peel-off" is *better* solved this way.
- **The new build implication is the three-layer hub** — specifically the **shared intelligence hub** (one-way emit-up / consume-down of non-PII learnings) and the **capability layer** (the `sd_capabilities` reuse registry, already partially built but the cross-venture learning loop is orphaned). Venture-1, as the first venture, should **establish the hub contribution/consumption pattern** (emit its learnings up; consume shared capabilities) — or at minimum not preclude it. This connects directly to the orphaned compounding loop the assessment flagged.

## Bottom line
**Stay born-isolated (Model A) on Neon, and build the three-layer hub for compounding.** Your cost instinct was correct (Supabase is expensive at scale) but it points to *Neon-isolation*, not shared-then-peel — because Neon makes isolation nearly free while peel-off carries real exit/separation risk. Compounding rides a non-PII intelligence hub, never the customer data. The internal code-grounded review (running) will confirm how much of that hub is built vs. gap.
