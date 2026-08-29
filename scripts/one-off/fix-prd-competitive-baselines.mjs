import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-COMPETITIVE-BASELINES-RECURRING-001';

async function main() {
  const { data: prd, error: readErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, test_scenarios')
    .eq('id', PRD_ID)
    .single();
  if (readErr) throw readErr;

  // TESTING sub-agent PLAN-phase review (a102e16b, CONDITIONAL_PASS, 4 blocking findings) --
  // fixing all before EXEC per this session's established discipline.

  const frById = Object.fromEntries(prd.functional_requirements.map((f) => [f.id, f]));

  // FR-1/FR-2: pin produced_at as the ONLY name (drift risk with "analyzed_at" elsewhere in PRD).
  frById['FR-1'].description = "ADD COLUMN produced_at timestamptz, expires_at timestamptz to competitive_baselines (supabase/migrations/, plain additive -- no CHECK-constraint widening, no NOT NULL without default, self-applies under the TIER-1 provably-additive path per database/chairman-gated/README.md). Mirrors the fetched_at/expires_at convention on product_hunt_cache (supabase/migrations/20260323_product_hunt_cache.sql). NAMING PINNED: produced_at is the only name used anywhere in this PRD/implementation -- 'analyzed_at' is a DIFFERENT pre-existing column on the sibling competitors table and must never be confused with this one. Both columns stored as full ISO-8601 with explicit Z/offset (never a date-only or offset-stripped string) so Postgres never reads a naive literal in the session TimeZone.";

  // FR-3: fail-closed eligibility, TS-1 spies on the real search entry point.
  frById['FR-3'].description = "The recurring pass MUST filter active ventures through a FAIL-CLOSED eligibility check before any Tavily call is issued. isFixtureVenture (lib/chairman/chairman-actionable.mjs) is NOT reusable as-is here -- it deliberately fails OPEN (null/unreadable venture => eligible), which is correct for its own console-fairness use case and WRONG for a Tavily-spending, gate-table-writing loop. This SD's own wrapper must fail CLOSED: `typeof v.name === 'string' && v.name.trim() !== '' && !isFixtureVenture(v)` -- a venture with a missing/unreadable name is EXCLUDED, not included. The query feeding this filter MUST select `name` and `is_demo` explicitly (a `.select('id, status')` that omits them silently defeats the filter, since a missing name defaults to eligible under a naive predicate). Of 92 status=active ventures, only ApexNiche AI (809ec7e7-...) is currently real -- 91 must be excluded.";

  // FR-6: explicit await, non-empty-array check, and a timeout budget, not just try/catch.
  frById['FR-6'].description = "lib/eva/chairman-product-review.js:generateReviewPacket() gains a competitive-baseline section. IMPORTANT CORRECTION: the cited precedent (lines 209-215, `if (verdict) {...}`) has NO try/catch at its call site -- its fail-softness lives entirely in the CALLEE (loadVerdictSummary / post-build-convergence-gate.js), which swallows its own query error and returns null. This SD's baseline read is different: CompetitiveBaselineService.getByVentureId() THROWS on a query error (`if (error) throw new Error(...)`), so mirroring the caller pattern literally (a bare un-guarded await) would let that throw escape into the S24 choke-point. Required, explicitly: (1) the call MUST be awaited -- a missing await lets a Promise object serialize into the packet and produces an unhandled rejection later, not a caught error; (2) the read MUST be wrapped in an explicit try/catch AND a time budget (e.g. Promise.race against a short timeout) since Supabase JS has no default request timeout and a stalled read is a hang, not an exception, so try/catch alone cannot bound it; (3) presence must be checked as `Array.isArray(baselines) && baselines.length > 0`, NOT `if (baselines)` -- getByVentureId returns [] for no rows, and [] is truthy, so a bare truthiness check silently emits an empty section instead of the required gap-labelled marker.";

  // FR-4/FR-5: NULL-safe refresh query, injectable clock, create() column whitelist fix, fallback poisoning.
  frById['FR-4'].description = "CompetitiveBaselineService (lib/discovery/competitive-baseline-service.js) gains a real research path using lib/eva/utils/web-search.js (Tavily wrapper, already used by Stage 4) to populate pricing_data/feature_coverage/performance_metrics/epistemic_tag/citations/produced_at/expires_at with cited, non-placeholder data for eligible ventures. CORRECTION (TESTING sub-agent finding): create() is currently a hard-coded 6-column whitelist with NO spread of its argument (unlike update(), which does spread) -- passing produced_at/expires_at/citations to create() as written today silently writes them as NULL with no error. create() must be extended to accept and persist these new columns explicitly. A transient research failure (e.g. Tavily timeout) must NOT fall back to writing a STATUS_QUO placeholder with a full-shelf-life expires_at -- that poisons the venture's baseline for the entire TTL while the system reports healthy. A failed-research fallback row gets a SHORT expires_at (retry-soon), not the standard shelf-life.";
  frById['FR-5'].description = "A scheduled or stage-triggered refresh (reuse an existing cron/quiet-tick cadence per this repo's established convention -- do not build new scheduler infra) re-runs the baseline research per eligible venture. The refresh query MUST treat NULL expires_at as ALWAYS-STALE (needs research), not as never-matching -- a naive `.lt('expires_at', now)` filter never returns NULL rows, which would leave the 4 pre-existing STATUS_QUO placeholder rows (NULL produced_at/expires_at) permanently un-upgraded, forever, on exactly the rows that motivated this SD. Use `.or('expires_at.is.null,expires_at.lt.' + now)` or equivalent. The 'now' comparison value MUST come from an injectable clock function (not a bare `new Date()` inlined at call time), so tests can advance time between ticks rather than relying on a frozen module-scope timestamp that would make a two-tick test pass regardless of whether expires_at is actually respected.";

  // FR-7: fix unreachability -- specimen production is explicit, not routed through the active-only loop.
  frById['FR-7'].description = "Produce one real, cited baseline row for AltifyAI (50763b6a-1fad-4e1e-b2fc-296a1d66ebf9) via an EXPLICIT, direct call to the FR-4 research path (e.g. a one-off invocation script or a dedicated specimen-production entry point) -- NOT by relying on AltifyAI passing through the FR-3/FR-5 recurring eligibility loop, which filters to status=active ventures and would therefore NEVER reach a status=cancelled venture like AltifyAI. Routing the specimen through the eligibility loop (by temporarily flipping AltifyAI's status, or by bypassing the fence) would make FR-7 zero evidence for TR-2's fence-holds claim. Because AltifyAI is status=cancelled at stage 23 (verified by coordinator 2026-08-29T21:39Z; a chairman-facing 'AltifyAI is in live UAT' receipt was independently found false on the same measurement and routed to Adam/Solomon), do NOT claim a live S24 sitting consumed this baseline. Verify the never-wait property via SIMULATED packet assembly (call generateReviewPacket()-equivalent logic directly against AltifyAI's venture_id) with the baseline present, then again with it absent/stale -- both must complete without blocking, AND the absent/stale case must show the labelled gap marker (per the corrected FR-6), not merely 'did not throw'.";

  const functional_requirements = Object.values(frById);

  // Fix test scenarios matching the corrected FRs.
  const test_scenarios = [
    {"id": "TS-1", "description": "Eligibility filter, driven from the REAL entry point (not a standalone predicate unit test) with isSearchEnabled forced true and the search export spied: 91 known fixture-pattern ventures produce ZERO calls to the spied search function; only ApexNiche AI (and any future real active venture) reaches it. A venture row missing `name` is EXCLUDED (fail-closed), not included."},
    {"id": "TS-2", "description": "Using an injectable clock: a fresh (non-expired) baseline is not re-researched on a second tick when the clock has NOT advanced past expires_at; the SAME baseline IS re-researched once the clock is advanced past expires_at. A baseline with NULL produced_at/expires_at (the pre-existing STATUS_QUO rows) IS treated as stale and re-researched. Exact-boundary (clock == expires_at) is asserted explicitly, not just before/after."},
    {"id": "TS-3", "description": "A baseline written via create() (not a hand-built fixture) round-trips produced_at/expires_at/citations as non-null on read-back -- proving create()'s column whitelist was actually extended, not just described as extended."},
    {"id": "TS-4", "description": "Simulated packet assembly with a present, fresh AltifyAI baseline includes the competitive-baseline section with real content (not a serialized Promise object)."},
    {"id": "TS-5", "description": "Simulated packet assembly with the baseline absent, OR with getByVentureId() throwing, OR with the read hanging past the timeout budget: in ALL THREE cases the packet PROCEEDS and the section shows an explicit baseline-unavailable/gap-labelled marker -- never a thrown error propagating to the caller, never an unresolved await, and never a silently-empty section that reads as 'nothing to report' instead of 'could not check'."},
    {"id": "TS-6", "description": "Migration applies cleanly (additive, no CHECK widening, no backfill of the 4 existing STATUS_QUO rows required); a write immediately after migration apply does not fail on PGRST204 schema-cache lag (verify via retry-on-204 or an explicit cache-refresh step, not assumed away)."},
    {"id": "TS-7", "description": "A simulated transient research failure (Tavily error/timeout) results in a fallback row with a SHORT expires_at (retry-soon), not the standard shelf-life -- proving a single transient failure cannot poison the venture's baseline for a full TTL."}
  ];

  const { error: updErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements, test_scenarios })
    .eq('id', PRD_ID);
  if (updErr) throw updErr;

  console.log('✅ PRD corrected: FR-1,FR-2,FR-3,FR-4,FR-5,FR-6,FR-7 amended; test_scenarios expanded to 7 (TS-6, TS-7 added)');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
