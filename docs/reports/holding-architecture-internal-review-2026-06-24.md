# Holding Architecture — Internal Code-Grounded Review (2026-06-24)

Verdict: Model C (staged hybrid) = portfolio TARGET; venture-1 = Model A (born-isolated). Companion to holding-architecture-triangulation (external). Full raw in task wol51964w.

## Holding portfolio picture
CONCRETE FUTURE PORTFOLIO. Per the chairman-approved canonical vision (docs/vision/ehg-mission-vision-canonical.md:18-39), EHG's end-state is "a handful (3-5) of self-operating, self-sustaining businesses concurrently," with a leading sub-target of "10+ validated businesses" and a north_star of $18,000/mo net sustained 6 months. The shape is HUB-AND-SPOKE:

SPOKES (the ventures) — many isolated runtimes. Each venture is "a real business" that "must stand on its own" (line 24): its own Replit deploy + own Neon/Helium Postgres + own Clerk auth + own Object Storage + own Secrets (venture-hosting-standard.md:27-38). The venture's RAW CUSTOMER DATA lives ONLY in its spoke and NEVER leaves it. The spoke boundary IS the future sale boundary — exit-separability is a primary rationale for isolation.

HUB (the platform) — ONE shared intelligence/capability substrate on EHG_Engineer + shared Supabase (dedlbzhpgkmetvhbkyzq). The hub is what compounds and is "hard to copy" (line 26). It holds: (a) the capability registry (sd_capabilities) — reusable code-shapes a later venture inherits instead of re-deriving; (b) the cross-venture learning engine (lib/eva/cross-venture-learning.js) — kill-stage rankings, failed-assumption patterns, calibrated decision-filter thresholds mined across 5+ ventures; (c) the 26-stage lifecycle SSOT + governance/north-star/VDR accounting; (d) the AI agent bench (RD_DEPARTMENT model: agents are company_id=NULL global resources serving every venture, reuse tracked by reuse_count via service_role, humans see only their own company by RLS); (e) the exit/separability engine (lib/eva/exit/**).

WHAT COMPOUNDS: operating principle 7 — "Everything compounds and self-improves. Calibration, patterns, capabilities, and lessons transfer automatically across ventures" (line 39). The DUAL MANDATE (line 24): every venture must both stand alone AND make the whole system smarter (add a reusable capability, sharpen judgment, harden governance). The compounding loop is contribute-UP (each venture writes its capabilities/patterns/decisions to hub tables keyed by venture_id) and consume-DOWN (the next venture starts from a higher baseline by reading those). CRITICALLY, what flows is CAPABILITIES + JUDGMENT + GOVERNANCE + LESSONS (intelligence) — the vision never names raw customer data as a compounding input. So each new venture is cheaper/smarter/faster because the HUB got richer, not because ventures share a database.

## Provisioning model comparison
WHAT COMPOUNDING ACTUALLY REQUIRES (the decisive finding, confirmed across all six lenses + verified in DB): compounding rides a HUB of CAPABILITY METADATA (sd_capabilities — type/category/description shapes, no customer-data columns) + INTELLIGENCE PATTERNS (kill-rates, failed-assumption keys, calibration bias) + thin AGGREGATES (GET /v1/metrics, 6-field allowlist). It does NOT require a shared CUSTOMER DB. The RD_DEPARTMENT pattern already physically proves this: AI agents (company_id=NULL) reuse across companies via service_role while RLS keeps customer rows isolated per company_id — cross-venture compounding WITHOUT cross-venture data leakage, in the same shared Supabase, today. THEREFORE A/B/C do NOT differ on whether compounding is possible (it rides the hub in all three); they differ ONLY on INCUBATION OVERHEAD vs SEPARATION DEBT. This collapses the decision to economics.

MODEL A (born-isolated + hub) — the current approved standard.
- Incubation overhead: HIGH. Every venture provisions Neon+Replit+Clerk+Object-Storage from day one, even the ones killed at gate 3/5. Given the portfolio kills most ventures early, this pays full-stack cost for short-lived experiments. Note: much of this is ISOLATION-PROVISIONING cost that ANY eventually-isolated model (A and C) must pay for survivors anyway — A just pays it earlier and for losers too.
- Separation debt: ZERO by construction (spoke = sale boundary from birth).
- Compounding richness: full (hub-mediated, runtime-location-neutral).
- Exit-readiness: best — already separable.
- Security: best — data-minimization + isolation native.
- Standard alignment: PERFECT — it IS the approved standard; the fail-closed S19 stack gate (venture-stack-compliance.js) enforces it.
- Lifecycle fit: isolation from stage 0.

MODEL B (born-shared, peel-off at maturity) — chairman proposal.
- Incubation overhead: LOWEST — near-zero per-venture infra; ventures incubate inside shared infra.
- Separation debt: HIGHEST and UNBACKED. The peel-off machinery to physically extract a venture is essentially UNBUILT (see separation_strategy): no data-extraction dump script, asset/dependency registry empty (0 rows), no repo-split/auth-cutover design. The eva_ventures-vs-ventures split-brain (12/12, 0 shared ids — verified) is concrete co-mingling debt ALREADY present in shared infra, making "untangle later" a real, not hypothetical, risk.
- Compounding richness: full (same hub).
- Exit-readiness: poor until separation is built and proven.
- Security: weakest during incubation (co-tenant customer data).
- Standard alignment: CONTRADICTS the approved born-isolated standard; requires formally revising a chairman-approved directive AND relaxing the fail-closed S19 gate.
- Lifecycle fit: 26 stages = incubation, but with no graduation cutover built.

MODEL C (staged hybrid) — incubate-in-shared through pre-revenue, graduate to isolated at a threshold, compound via hub throughout.
- Incubation overhead: LOW — cheap shared incubation through the high-kill early stages; only survivors pay isolated-stack cost.
- Separation debt: BOUNDED and CONDITIONAL (only survivors graduate), BUT presently unbacked because the peel-off pipeline is unbuilt — same gap as B, just incurred less often.
- Compounding richness: full.
- Exit-readiness: clean once graduated (= Model A mature-state).
- Security: shared during incubation, isolated at maturity.
- Standard alignment: needs the standard reframed as "isolated-at-graduation" rather than "isolated-at-birth," and the S19 gate to fire at graduation not creation — a smaller revision than B.
- Lifecycle fit: BEST — maps directly onto the lifecycle (26 stages = incubation; operations/scale/exit = post-graduation) AND the stakes-router (lib/venture-deploy/stakes-router.js) ALREADY encodes a Model-C answer at the DB-PROVIDER layer: cheap D1 by default, graduate to Neon on any of 5 stakes triggers (collects_irreplaceable_data, revenue_bearing, etc.). C just extends that same proven staged policy up to the company/tenancy/runtime layer.

ECONOMIC VERDICT: A wastes isolated-stack overhead on the many ventures that die at gates 3/5; C avoids that by incubating cheap and only isolating survivors — and C ends in A's clean state. C is economically superior IF the separation machinery is real. It is NOT real today (it is the crux gap).

## Recommended model
RECOMMENDED: MODEL C (staged hybrid) as the STRATEGIC TARGET, executed as MODEL A FOR VENTURE-1 SPECIFICALLY.

The honest tension: C is the economically and lifecycle-correct destination (cheap incubation for high-kill early stages, clean isolation for survivors, compounding via hub throughout, and it generalizes the stakes-router policy already in code). BUT C's viability hinges entirely on a real architectural-separation pipeline, and that pipeline is essentially UNBUILT (data-extraction script missing, asset registry 0 rows, repo-split/auth-cutover undesigned, the one drift tracker separability-delta.js writes to a non-existent table). Betting venture-1 — the single most important dogfood — on an unproven automated peel-off is the wrong risk.

THEREFORE: adopt C as the portfolio standard, but run VENTURE-1 as Model A (born-isolated: own Neon+Clerk+Replit from day one). Venture-1 thereby (a) honors the currently-approved standard with zero standard-revision needed to ship, (b) becomes the first true end-to-end dogfood of the born-isolated contract (no venture has ever exercised it — all 9 venture rows are unconfigured local artifacts, 100% of metric pulls skip), and (c) populates venture_asset_registry with REAL assets so the separability scorer's 3495 rows of noise finally become signal — which is the prerequisite to ever proving C's peel-off for venture-2+.

GROWTH-THRESHOLD TRIGGER for C (ventures 2+): REUSE the stakes-router's 5 canonical triggers, lifted from the DB-provider layer to the tenancy/runtime layer — graduate from shared incubation to isolated infra on the FIRST of: collects_irreplaceable_data, revenue_bearing, write_amplifying_jobs, needs_postgres_features, needs_portable_migration. These map onto the lifecycle's first-revenue / operations boundary (consistent with the vision deferring "Compound venture-level learning" to V2/post-first-revenue).

CAN THE TRIGGER BE AUTOMATED? PARTIALLY. The TRIGGER DETECTION is already automatable (stakes-router is a pure function over a stack descriptor; revenue_bearing is detectable from venture_revenue_entries; irreplaceable-data from trust_tier). What is NOT yet automatable is the EXECUTION of separation (the extraction/repo-split/auth-cutover pipeline does not exist). So C should ship with AUTOMATED trigger-detection + alert, and an initially MANUAL/semi-automated graduation runbook, building toward automated execution only after venture-1 proves the extraction path on real assets.

## Separation strategy
VENTURE-1 IS MODEL A — so its job is to MAINTAIN isolation, not execute peel-off:
- Born on its own Neon + Clerk + Replit + Object Storage from day one (venture-hosting-standard.md stack). Raw customer data never enters shared Supabase.
- Day-one hub contract = thin: (1) GET /v1/metrics aggregates endpoint + register metrics_base_url + metrics_api_key_ref in applications so the daily pull stops skipping it; (2) capability contribute-up at build (flip PREBUILD_PANEL_ENRICHMENT for its build); (3) populate venture_asset_registry with its real assets (repo, domain, DB, IP) so separability scoring has real inputs.
- This keeps venture-1 trivially separable forever (the spoke IS the sale boundary) and dogfoods the born-isolated contract no venture has yet exercised.

FOR VENTURES 2+ UNDER MODEL C — the concrete peel-off strategy (graduate shared→isolated at the stakes threshold), built-vs-must-build using/extending the EHG exit machinery:

ALREADY BUILT (decision support, advisory): separability-scorer.js (5-dim score), separation-rehearsal.js (5-dim simulation, PASS_THRESHOLD=70, detectSharedResources/detectCriticalDependencies), data-room-generator.js (6 exit models), the daily worker (domain-handler.js:139-177 → eva-master-scheduler:82-83 — RUNNING, 3495 score rows), acquirability stage steps (stages 0,19-22,25). These MEASURE separability.

MUST BUILD (execution — the actual peel-off, none exists end-to-end):
1. DATA EXTRACTION — a venture-scoped logical export of all venture_id-keyed rows into a standalone Postgres with referential integrity. The architecture doc's own Risk 5 admits data-room generation is "filtered queries (WHERE venture_id=$1), not physical database separation"; the punted "migration script that exports a venture's data into a standalone SQL dump" is NOT built. PREREQ: resolve the eva_ventures-vs-ventures split-brain (0 shared ids — VERIFIED) so "this venture's rows" is unambiguous.
2. ASSET/DEPENDENCY REGISTRY POPULATION — venture_asset_registry=0 (VERIFIED); without it every separability score is fiction (sample reasoning literally reads "0 infrastructure assets registered"). Need automatic asset discovery (scan repo/DB/domains) feeding the registry from day one.
3. REPO/DEPLOY SPLIT — carve venture-specific code out of the shared model onto its own Replit; needs a code-ownership manifest (which lives in the empty asset registry).
4. AUTH/BILLING CUTOVER — migrate users off shared auth to the venture's own Clerk tenant + stand up independent billing. No machinery, no design today.
5. HUB RE-WIRING (zero-downtime) — after peel-off the venture keeps consuming capabilities + contributing learnings via the hub over a network boundary; the consume-down + learning loops are themselves orphaned, so the post-separation compounding path is unbuilt on BOTH ends.
6. GRADUATION GATE — make separability >= threshold against a REAL asset registry + a passing rehearsal a precondition to graduate (today the score is informational-only and gates nothing).
7. RETIRE/FIX the broken drift tracker — separability-delta.js writes to venture_separability_snapshots which does not exist (42P01); either migrate the table in or retire the script. Purge the legacy 78-score cluster (1748 empty-metadata rows) so portfolio-readiness rollups stop reporting phantoms.

## Whats built vs gap
HONEST BUILT / ORPHANED / MISSING READ (verified against DB + source):

HUB — CAPABILITY COMPOUNDING:
- BUILT + wired (persist-up): sd_capabilities table, 217 rows / 84 SDs; LEAD-FINAL trigger (trg_capability_lifecycle) registers each SD's delivered capabilities.
- BROKEN/MISLEADING: the 217 rows are LEO-HARNESS internals (tool=127, service=26, agent=18...), NOT venture-delivered capabilities. The venture-capability writer (writeLeafCapabilities via enrich-leaf-live.js) is gated behind PREBUILD_PANEL_ENRICHMENT (default OFF) with no live driver — never run on a real venture build. venture_capabilities=0 (verified).
- ORPHANED + STRUCTURALLY BLOCKED (consume-down): findReusable + getReuseSuggestions have ZERO production callers; capability_key is venture-namespaced so cross-venture matches can never hit. Reuse is dead: caps_reused=1, max_reuse=1, and that one event is a labeled "VALIDATION AGENT PROBE - DISCARD"; capability_reuse_log=0 (all verified). compounding-score.js explicitly EXCLUDES sd_capabilities ("zero edges").
- SCHEMA DRIFT: capability-persistence.js / capability-writer.js emit capability_id + source_venture_id; the LIVE table has NEITHER (keyed sd_id/sd_uuid/capability_key). This is a plan-helper, not the live writer — must be reconciled before relying on it.

HUB — INTELLIGENCE/LEARNING:
- WIRED-BUT-STARVED (the live path): eva-orchestrator:865 → retrieveKnowledge injects cross-venture patterns every stage (best-effort, excludes current venture). Genuinely production-wired. But keyword-only (no embeddings: 0/229 venture_artifacts embedded) and feeds on real data (artifacts=287, issue_patterns=1448, retrospectives=6482).
- ORPHANED (the analytics engine): analyzeCrossVenturePatterns + runCalibration have ZERO production callers (no scheduler/cron). Data-starved: chairman_decisions kills=0, assumption_sets=0 (verified), dfe_context rows < minSamples=5. SHELL BUGS: filters on venture status 'draft'/'killed' that don't exist in venture_status_enum — written against a schema it never ran against. chairman-override handler is a SHELL (audits + marks applied; feeds no learning).
- BUILT + exercised: auto-learning-capture (issue_patterns=1448, retrospectives=6482).

HUB — METRICS:
- BUILT contract + platform enforcement: KPI_ALLOWLIST, validateKpis drops unknown keys, by-reference key, fail-soft, never opens a venture DB.
- UNEXERCISED: all 9 venture rows have no metrics_base_url/key_ref; venture_telemetry=7, ingested=0 (100% skipped — verified). Pull ran today, skipped everything.

SEPARATION/EXIT MACHINERY:
- BUILT + daily worker RUNNING: separability-scorer, separation-rehearsal (threshold 70), data-room-generator (6 models), acquirability stages. venture_separability_scores=3495 (verified).
- FICTION ON EMPTY INPUTS: venture_asset_registry=0, venture_data_room_artifacts=0, venture_exit_profiles=1, venture_exit_readiness=0 (verified) → every score is noise (sample reasoning: "0 infrastructure assets registered"). The 78-cluster (1748 rows, empty metadata) is legacy/seeded.
- MISSING (execution): physical data-extraction dump script, repo-split, auth/billing cutover — NONE exist. separability-delta.js writes to venture_separability_snapshots which DOESN'T EXIST (42P01) — dead tool.

PORTFOLIO SUBSTRATE:
- SPLIT-BRAIN (verified): ventures=12, eva_ventures=12, 0 shared ids. Live co-mingling hazard; must be reconciled before any shared incubation or peel-off.
- No economics ever flowed: venture_revenue_entries=0 (verified).

NET: the hub is a write-pipe with persist mostly populated by the wrong producer, a consume-down arrow that is shelf-ware, a learning loop that is orphaned + starved + schema-drifted, and a separation engine that MEASURES (on empty data) but cannot EXECUTE. Completing the compounding layer requires: fix capability namespacing + wire a real consume-down step; wire the analytics engine to a scheduler + fix enum drift + populate assumption_sets/kills; backfill embeddings; configure venture metrics endpoints; populate venture_asset_registry; build the extraction/repo-split/auth-cutover pipeline; resolve the split-brain.

## Summary
EHG's future portfolio is hub-and-spoke: 3-5 (target 10+) isolated venture runtimes (own Neon/Clerk/Replit, customer data never leaving the spoke) plus ONE forever-shared platform hub (capability registry, cross-venture learning, lifecycle SSOT, governance, AI agent bench, exit engine) on EHG_Engineer + shared Supabase. The decisive, verified finding: compounding requires sharing only CAPABILITIES + INTELLIGENCE + thin aggregates — NOT a shared customer DB (proven live by the RD_DEPARTMENT cross-company-reuse-with-RLS pattern). This collapses Models A/B/C to a single tradeoff — incubation overhead vs separation debt — because compounding rides the hub identically under all three. RECOMMENDATION: adopt Model C (cheap shared incubation -> graduate-to-isolated at a stakes threshold -> compound via hub throughout) as the portfolio standard, generalizing the D1->Neon stakes-router policy already in code; BUT run venture-1 as Model A (born-isolated) because C's peel-off pipeline is essentially unbuilt and venture-1 is too important to be the unproven separation experiment. Venture-1's day-one hub hooks are thin and all worth doing now: an aggregates-only GET /v1/metrics endpoint + registry config, real venture_asset_registry population (turning 3495 fiction scores into signal), capability contribute-up (after fixing venture-namespacing), and picking one canonical venture registry (the ventures/eva_ventures split-brain — 0 shared ids — must not widen). DEFER the orphaned + data-starved cross-venture learning loop (vision itself defers it to V2; needs MIN_VENTURES=5) and the unbuilt automated peel-off (venture-1 maintains isolation rather than executing separation). HONEST STATE: the hub is a write-pipe whose persist side is populated by the wrong producer (LEO harness, not ventures), whose consume-down is shelf-ware (0 callers, namespacing blocks matches, reuse_count maxes at 1), whose learning engine is orphaned + schema-drifted + starved, and whose separation engine measures (on empty inputs) but cannot execute. Completing the compounding layer is the real chairman investment decision; venture-1 should ship isolated and dogfood the inputs (asset registry, metrics, capability contribute) that make Model C provable for venture-2+.