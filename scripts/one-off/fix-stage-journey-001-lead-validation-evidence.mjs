#!/usr/bin/env node
/**
 * SD-LEO-INFRA-FIX-STAGE-JOURNEY-001 — VALIDATION evidence at LEAD phase (LEAD-TO-PLAN gate).
 *
 * GATE 1 duplicate/overlap check, independent re-derivation of Solomon finding 2bd2ab2f from
 * code + live artifact data, ratification verification (212909b9 / 3c4a6781), and a structural
 * assessment of the success criterion as written.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-FIX-STAGE-JOURNEY-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 93,
    phase: 'LEAD',
    execution_time_ms: 0,
    summary: "GATE 1 DUPLICATE CHECK: PASS. The automated metadata.dedup_match_sd_key pointer to SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 is a FALSE POSITIVE -- that SD (completed 2026-05) widens a harness_backlog status filter on scripts/modules/sd-next/data-loaders.js and touches no Stage-15 code. Swept strategic_directives_v2 on 'journey generator' / 'stage-15 journey' / 'user journey' / 'provenance' / 'sitemap' / 'null route' / 'journey' and quick_fixes on 'journey' / 'sitemap' / 'provenance' / 'stage-15' / 'stage 15': ZERO SDs or QFs deliver a fix to the Stage-15 journey generator. Nearest neighbours are not duplicates -- SD-LEO-INFRA-FIRST-CLASS-USER-001 (completed 2026-07-09, commit eafdaf7c3dc) BUILT this generator and is the origin of all three defects; SD-LEO-FIX-REMEDIATION-JOURNEY-COHERENCE-001 (draft) remediates per-venture venture_quality_findings rows for ApexNiche (809ec7e7) and fixes no generator code. SOLOMON FINDING 2bd2ab2f VERIFIED REAL: session_coordination row 2bd2ab2f-455f-4795-b3aa-0257ae57b02f, Solomon (d3430608) -> Adam (49eabb23) 2026-09-14T16:43:28Z, delivered/read/acknowledged. RATIFICATIONS VERIFIED LIVE in chairman_ratifications: 212909b9-5499-4959-bbe5-eb9bdc83d76c (2026-09-14T17:38Z, chairman verbatim 'Yeah, I'd say let's build this before the clean slate test venture', quote_hash e5d6ad41..., target_contracts adam/coordinator/solomon) -- its stated effect is that Phase 0 correctives C1-C5 land BEFORE the clean-slate venture and Phase 2 is COMMISSIONING on it, exactly matching this SD's framing (metadata.original_plan_path names org-build-C5.md, so this SD IS item C5); 3c4a6781-026b-4389-b476-0836599ad0b7 (2026-09-14T16:50Z) confirms AltifyAI (50763b6a) and ApexNiche (809ec7e7) are deleted and a new clean-slate test venture replaces AltifyAI as the commissioning test; e38df53f confirms the chairman-directed-scope exemption from the critical check; 902ec060 (crews) confirmed real. ALL THREE DEFECTS INDEPENDENTLY CONFIRMED FROM CODE **AND** FROM LIVE ARTIFACT DATA -- not taken on Solomon's word. Live blueprint_user_journey for venture 50763b6a (is_current, built 2026-08-11): 12 journeys / 14 steps, route===null on 14/14 steps (100%), story_refs on 14/14 steps are composite pipe-delimited strings such as 'upload a single image from my computer|screen-2|upload a single image from my computer' (not pointers to anything), and generated_from.stories===[] on the sampled journey. Root causes located: C1 provenance -- lib/eva/blueprint-agents/user-story-pack.js:17 systemPrompt never asks for a per-story identifier, so live stories carry exactly {mvp,as_a,so_that,i_want_to,story_points,acceptance_criteria} (measured 18/18 on AltifyAI, 0 with id, 0 with title, 0 with name), which makes stage-15-user-journey.js:188 story_refs:[story.id||provisionalId] fall through to the synthesized composite key and stage-15-user-journey.js:340 generated_from.stories .filter(Boolean) collapse to []. C2 routes -- stage-15-user-journey.js:183 derives route from screen.page_type, but page_type is populated ONLY when EVA_SURFACE_AWARE_ENABLED==='true' (stage-15-wireframe-generator.js:722, flag-gated), and that flag is absent from .env, so page_type is null on all 9 live AltifyAI screens and route is null BY CONSTRUCTION, not intermittently. C3 sitemap flows -- stage-15-user-journey.js:299 reads only ia_sitemap.pages; the live ia_sitemap carries user_flows (4 populated flows on AltifyAI, each an ordered page-name sequence) which no line of the generator ever reads. CRITICALLY, the remedy inputs are PROVABLY PRESENT in the payload the generator already receives: ia_sitemap.pages[].path holds real routes ('/', '/signup', '/login', '/dashboard'), and stage-15.js:224 already passes the whole iaResult into the journey call -- so C2 and C3 are read-side defects fixable inside the generator without touching the shared normalizer. FOURTH DEFECT NOT IN THE SD TEXT: screen_ref is positional. The wireframe generator emits no screen_id (stage-15-wireframe-generator.js:725-745 returns name/purpose/persona/... only), so stage-15-screens.js:33 falls back to `screen-${idx}`; live data confirms screen_ref:'screen-2'. Because assignDurableStepIds keys carry-forward on goal|screen_ref|action, ANY reordering of the screen list silently re-ids every step -- which defeats SD-LEO-INFRA-FIRST-CLASS-USER-001's own durable-step-id success criterion. WHY CI NEVER CAUGHT ANY OF THIS (the single most important input for PLAN): tests/unit/stage-15-user-journey.test.js is a fixture that masks all three defects -- every story literal hand-supplies id:'S1'/'S2'/'S9' (lines 66-68, 77, 89, 95, 100, 116-117, 128, 218-219, 252), which the real producer never emits; every generateUserJourneys call passes ia_sitemap:{pages:[]} with no user_flows key at all (lines 230, 244, 254, 264); no test ever passes page_type; and the file contains ZERO assertions on `route` and ZERO on user_flows/navigation_flows. A CI test written against this fixture shape would go green without fixing anything.",
    critical_issues: [],
    warnings: [
      {
        id: 'VAL-1',
        severity: 'HIGH',
        issue: "SUCCESS-CRITERION RISK -- the fixture the criterion assumes does not durably exist. Only TWO ventures in the entire DB have ever had a blueprint_user_journey artifact: 50763b6a (AltifyAI) and 809ec7e7 (ApexNiche AI). Ratification 3c4a6781 deletes BOTH by name. So 'run against a fixture venture with known stories and sitemap' has no surviving subject, and the new clean-slate venture does not reach Stage 15 until AFTER this build lands (that is the whole point of 212909b9). PLAN must decide the fixture strategy explicitly and should NOT assume a live venture will be available.",
        evidence: "venture_artifacts WHERE artifact_type='blueprint_user_journey' returns exactly 2 rows (venture 50763b6a 2026-08-11, venture 809ec7e7 2026-07-11); ratification 3c4a6781 names both ventures for deletion.",
      },
      {
        id: 'VAL-2',
        severity: 'HIGH',
        issue: "SUCCESS-CRITERION RISK -- 'zero null routes' is not satisfiable by an honest name-join on live data, and forcing it invites fabrication. On AltifyAI, wireframe screen names and IA page names only partially align: 'Landing Page'->'Landing Page' and 'Dashboard'->'Dashboard' match exactly, but 'Signup/Registration' (screen) has no exact IA page ('Sign Up' is the IA name), and screens 'Integrations' / 'Subscription & Billing' have no IA page at all, while IA pages 'Login' / 'Generation History' have no screen. A literal 'zero null routes' rule therefore pressures the generator into synthesizing a route -- which directly contradicts its own stated never-fabricate doctrine (stage-15-user-journey.js:8-9 and :94-95, 'absence is surfaced as a finding, never fabricated'). RECOMMEND PLAN restate the criterion as 'zero null routes for every step whose screen resolves to a sitemap page, and an explicit ROUTE_UNRESOLVED finding for every step that does not' -- preserving the honest-gauge discipline rather than trading it for a green number.",
        evidence: "Live AltifyAI wireframe_screens.screens[].screen_name (9 names) compared against ia_sitemap.pages[].name; generator doctrine comments read in full at stage-15-user-journey.js:8-9, :94-95, :143-145.",
      },
      {
        id: 'VAL-3',
        severity: 'HIGH',
        issue: "The CI test demanded by the success criterion will be VACUOUS unless its fixture is derived from real producer output. The existing tests/unit/stage-15-user-journey.test.js hand-feeds story.id on every story, passes ia_sitemap:{pages:[]} with no user_flows, never sets page_type, and asserts nothing about route or flows -- which is precisely why 14/14 null routes and 24/24 empty generated_from.stories shipped green. PLAN must require the new fixture to mirror the MEASURED producer shape: stories carrying exactly {mvp,as_a,so_that,i_want_to,story_points,acceptance_criteria} and NO id; screens carrying page_type:null; ia_sitemap carrying populated pages[].path AND user_flows[].",
        evidence: "tests/unit/stage-15-user-journey.test.js lines 33-34, 66-68, 230/244/254/264; grep -c 'route' -> 0 assertions, grep -c 'user_flows|navigation_flows' -> 0.",
      },
      {
        id: 'VAL-4',
        severity: 'MEDIUM',
        issue: "SCOPE / LOC DRIVER -- fixing C1 honestly cannot be done by 'reading story.id', because no writer anywhere produces one. PLAN must choose between (a) changing the user-story-pack producer (lib/eva/blueprint-agents/user-story-pack.js systemPrompt + stage-15-user-story-pack.js normalization) to mint stable story identifiers, which changes the blueprint_user_story_pack artifact shape and affects its other consumers, or (b) computing a content-derived pointer inside the journey generator over the immutable story text. Chairman ratification df3186e6 ('every capture pointer names an immutable or versioned record ... values are not copied by default') favours (b) via a content hash, and (b) keeps the change local. This is a genuine architecture decision, not an implementation detail.",
        evidence: "lib/eva/blueprint-agents/user-story-pack.js:17 systemPrompt output-key list; live measurement 18/18 AltifyAI stories with 0 id / 0 title / 0 name; ratification df3186e6 encoded in CLAUDE.md prologue item 18.",
      },
      {
        id: 'VAL-5',
        severity: 'MEDIUM',
        issue: "SCOPE-CREEP TRAP -- the obvious place to add a route/path field is normalizeWireframeScreens (lib/eva/stage-templates/stage-15-screens.js:30-43), but that normalizer is SHARED by two writers by deliberate design (the S15 producer and the daemon post-hook) and its output is the wireframe_screens artifact consumed at the 15->16 boundary. Widening it re-opens SD-LEO-INFRA-S15-WIREFRAME-SCREENS-REGRESSION-001's territory. The journey generator ALREADY receives the full ia_sitemap object (stage-15.js:224 passes ia_sitemap:iaResult into buildWireframeScreensPayload, and stage-15-screens.js:52 preserves it verbatim), so route resolution can be done read-side with no change to the shared normalizer. Recommend PLAN fence the shared normalizer as OUT OF SCOPE.",
        evidence: "lib/eva/stage-templates/stage-15-screens.js header comment lines 1-13 and :47-54; lib/eva/stage-templates/stage-15.js:224.",
      },
      {
        id: 'VAL-6',
        severity: 'MEDIUM',
        issue: "GATE-INTEGRITY FINDING (for RETRO/DOCMON, not a blocker here) -- SD-LEO-INFRA-FIRST-CLASS-USER-001 was accepted as completed on success criteria that the shipped code does not meet: 'Every journey step is traceable to a real story and a real wireframe screen ... not synthesized placeholders' (violated: 14/14 story_refs are synthesized composite keys) and 'Step IDs ... do not change on regeneration of the same venture' (violated: screen_ref is positional `screen-${idx}`, so any screen reordering re-ids every step). The same producer/reader field-name disagreement is venture-quality-programme root cause B (ratification 0afc86e4). This SD is closing an acceptance criterion a prior gate already certified as met.",
        evidence: "SD-LEO-INFRA-FIRST-CLASS-USER-001.success_criteria entries 2 and 3, compared against live venture_artifacts payload for venture 50763b6a.",
      },
      {
        id: 'VAL-7',
        severity: 'LOW',
        issue: "COORDINATION -- SD-LEO-FIX-REMEDIATION-JOURNEY-COHERENCE-001 (draft) remediates journey_coherence findings on venture 809ec7e7, and those findings are plausibly downstream symptoms of the same three generator defects. It is NOT a duplicate (per-venture data remediation vs generator fix) and must not block this SD, but its subject venture is also named for deletion by 3c4a6781, so it may be moot. Worth surfacing to the coordinator rather than resolving in this lane.",
        evidence: "SD-LEO-FIX-REMEDIATION-JOURNEY-COHERENCE-001.scope; ratification 3c4a6781 venture deletion list.",
      },
    ],
    recommendations: [
      'PROCEED to PLAN. GATE 1 duplicate check passes; the dedup_match_sd_key pointer is a false positive and should be cleared or annotated so a later reader does not re-litigate it.',
      "PLAN must resolve the fixture question FIRST (VAL-1/VAL-3): recommend a committed, checked-in fixture built from the MEASURED AltifyAI artifact shapes (stories with no id, screens with page_type:null, ia_sitemap with populated pages[].path and user_flows[]) captured before the clean-slate deletion, rather than any live venture. Capturing that snapshot is time-sensitive -- ratification 3c4a6781 deletes both source ventures.",
      "PLAN should restate 'zero null routes' as 'zero null routes among resolvable steps + an explicit finding for each unresolvable one' (VAL-2), so the exit predicate cannot be met by fabricating a route in a generator whose stated contract is never to fabricate.",
      'PLAN should scope C2/C3 as read-side changes inside stage-15-user-journey.js (it already receives ia_sitemap with pages[].path and user_flows[]) and explicitly fence lib/eva/stage-templates/stage-15-screens.js as out of scope (VAL-5).',
      'PLAN should decide C1 provenance addressing (producer-minted story id vs content-hash pointer computed in the reader) as an explicit PRD decision, weighing ratification df3186e6 (VAL-4).',
      'PLAN should consider folding in the positional screen_ref defect: it is the same class, is required for the durable-step-id contract to hold, and is cheap once the sitemap join exists. If excluded, record it as a named deferral rather than leaving it silently unaddressed.',
    ],
    detailed_analysis: {
      commands_run: [
        "strategic_directives_v2 keyword sweep (title/description/scope ilike) on 'journey generator', 'stage-15 journey', 'stage 15 journey', 'user journey', 'provenance', 'sitemap', 'null route', 'journey' -- 0 duplicates found",
        "quick_fixes keyword sweep on 'journey', 'sitemap', 'provenance', 'stage-15', 'stage 15' -- 0 duplicates found",
        'Fetched SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 in full and confirmed it is a harness_backlog/feedback-table SD with no Stage-15 surface -- dedup match is a false positive',
        'Fetched SD-LEO-INFRA-FIRST-CLASS-USER-001 and SD-LEO-FIX-REMEDIATION-JOURNEY-COHERENCE-001 scope + success_criteria in full to rule them out as duplicates',
        'Scanned chairman_ratifications (137 rows) and chairman_decisions (842 rows) -- confirmed 212909b9, 3c4a6781, e38df53f, 902ec060 are live rows with verbatim chairman quotes and quote_hashes; read each source field in full to confirm the SD framing matches the ruling',
        'Scanned session_coordination -- located Solomon finding 2bd2ab2f-455f-4795-b3aa-0257ae57b02f (Solomon->Adam 2026-09-14T16:43Z, delivered/read/acknowledged) and read its body',
        'Read lib/eva/stage-templates/analysis-steps/stage-15-user-journey.js in full (361 lines)',
        'Read lib/eva/stage-templates/analysis-steps/stage-15-ia-generator.js SYSTEM_PROMPT -- confirmed pages[].path and user_flows[] are contract fields of ia_sitemap',
        'Read lib/eva/stage-templates/analysis-steps/stage-15-wireframe-generator.js:700-860 -- confirmed screens emit no screen_id and page_type only under EVA_SURFACE_AWARE_ENABLED',
        'Read lib/eva/stage-templates/stage-15-screens.js in full and lib/eva/stage-templates/stage-15.js:200-260 -- confirmed the journey generator receives the full ia_sitemap object',
        'Read lib/eva/blueprint-agents/user-story-pack.js systemPrompt -- confirmed no per-story identifier is ever requested',
        'Checked .env for EVA_SURFACE_AWARE_ENABLED -- absent, so page_type is null by construction',
        'Queried live venture_artifacts blueprint_user_journey for venture 50763b6a -- measured 12 journeys / 14 steps / 14 null routes / 14 composite-string story_refs / generated_from.stories===[]',
        'Queried live wireframe_screens and blueprint_user_story_pack for venture 50763b6a -- measured 9 screens all page_type:null, ia_sitemap.user_flows length 4, 18 stories with 0 id / 0 title / 0 name',
        'git log on stage-15-user-journey.js -- single commit eafdaf7c3dc 2026-07-09 (SD-LEO-INFRA-FIRST-CLASS-USER-001), consistent with the SD text that no commits touch it recently',
        'Read tests/unit/stage-15-user-journey.test.js (275 lines) and grepped assertion coverage -- 0 route assertions, 0 flow assertions, story ids hand-supplied throughout, ia_sitemap.pages always empty',
      ],
      gate_1_duplicate_check: 'PASS -- no SD or QF delivers this fix',
      defects_confirmed: 3,
      defects_found_beyond_sd_text: 1,
    },
    metadata: { independent_verification: true, live_data_measured: true, solomon_finding_reverified: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'lib/eva/stage-templates/analysis-steps/stage-15-user-journey.js',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Validation' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
  console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase, repo_path: stored?.metadata?.repo_path, repo_resolved: stored?.metadata?.repo_resolved }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
