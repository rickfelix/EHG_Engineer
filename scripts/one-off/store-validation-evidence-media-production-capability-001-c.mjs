/**
 * VALIDATION (Principal Systems Analyst) LEAD-phase due-diligence evidence for
 * SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C.
 * Independent verification of the corrected scope + S21-vs-S23 gate-placement decision.
 */
import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C';
const supabase = await getSupabaseClient();

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  summary:
    'Every existence claim in the corrected SD description independently re-verified against source AND the live DB: ALL TRUE. '
    + 'daily_rollups.variant_id and marketing_attribution.variant_id exist live and FK marketing_content_variants; thompson-sampler.js:26 '
    + 'implements Beta-posterior selectVariant over {id,successes,failures}; creative_assets is live with 10 columns and NO variant_id; '
    + 'asset-view-gate.js is the sole sanctioned read path and keys off S23+S24, not S21. DUPLICATE SD CHECK IS CLEAN (1000 non-terminal SDs '
    + 'scanned; 2 high-signal hits, both COMPLETED and in unrelated domains). S21-vs-S23 RESOLVED IN FAVOUR OF S23 -- gating scoring-eligibility '
    + 'at S21 would let an asset become scoring-eligible while still being structurally UNVIEWABLE until S23 (sibling B fence), asking the chairman '
    + 'to express taste about pixels he is forbidden to see. S23 is clean, low-risk, and lets child C REUSE checkAssetViewAuthorized rather than '
    + 'minting a second predicate that can drift from the fence. CONDITIONAL because of one severe and three material scope gaps, headed by: '
    + 'daily_rollups HAS ZERO WRITERS -- every reference in lib/ and src/ is a .select(); the codebase models this as a first-class no_writer_yet '
    + 'state. Bridging creative_assets into that substrate yields a structurally-correct, functionally-INERT scoring path that will pass its own '
    + 'unit test on synthetic fixtures while being dead by construction in production.',
  findings: [
    'ALL SD EXISTENCE CLAIMS CONFIRMED (independent, live DB + source). marketing_engine_foundation.sql:134 daily_rollups.variant_id and :169 marketing_attribution.variant_id, both UUID REFERENCES marketing_content_variants(id) ON DELETE SET NULL. Live information_schema confirms daily_rollups (15 cols, variant_id present) and marketing_content_variants (10 cols). thompson-sampler.js:18 createSampler, :26 selectVariant(@param Array<{id,successes,failures}>), :110 sampleBeta, 157 LOC, table-agnostic as claimed. creative_assets live with exactly 10 columns (id, venture_id, capability, generator, prompt, brand_source_refs, cost, provenance, consumed_at, created_at) -- NO variant_id, confirming the bridge is genuinely unbuilt. asset-view-gate.js:39 imports PRODUCT_REVIEW_STAGE from chairman-product-review.js (:18 = 23), :43 REQUIRED_LIFECYCLE_STAGE = 24. Nothing in the handed-over summary was overstated.',
    'S21 ARTIFACT-CLASS CLAIM CONFIRMED, WITH AN IMPORTANT NUANCE THE EXPLORE PASS UNDERSTATED. stage-21-visual-assets.js writes ONLY venture_artifacts rows (artifact_type visual_device_screenshots / visual_social_graphics / launch_test_plan, :246-254) and has zero creative_assets or variant references -- so the ARTIFACT class is genuinely disjoint. BUT 20260607_s21_creative_handoff_gate.sql is not a table migration at all: it is a single UPDATE venture_stages SET review_mode=review, gate_label=creative_handoff WHERE stage_number=21. So S21 IS already a chairman visual-asset gate. Calling it completely unrelated is too strong; the accurate statement is that S21 gates TEXTUAL BRIEFS in venture_artifacts, while this SD scores GENERATED PIXELS in creative_assets. The gates are about different objects, not different concerns.',
    'THE S21 STANDING DIRECTION IS SUPERSEDED BY ITS OWN PREMISE, WHICH ANSWERS SUCCESS_CRITERION 3 CLEANLY. The 2026-06-07 migration header states S21 briefs are textual by design -- the chairman feeds them into a 3rd-party image/video tool. That direction is a workaround for NOT HAVING in-house generation. Sibling A (COMPLETED) built exactly that in-house generation adapter layer, so the premise no longer holds. Child C does not need to modify, supersede, or even touch the S21 gate: S21 keeps gating briefs, S23 gates produced pixels. Success_criterion 3 can therefore be answered at LEAD with a fact rather than deferred to PLAN as a judgement call.',
    'NO DESIGN TENSION AT S23 -- AND POSITIVE TENSION AT S21. Sibling B already bound creative_assets VIEWING to (latest chairman_decisions product_review row at lifecycle_stage=23 is approved) AND (current_lifecycle_stage >= 24). If scoring-eligibility were gated at S21 instead, an asset would become scoring-eligible ~2 stages BEFORE it is viewable, requiring the chairman to score media the fence forbids him to open. That is a genuine ordering contradiction, not a stylistic preference. Gating at S23 makes one chairman_decisions row authorize both you may look and your taste counts, using one predicate. VERDICT: S23 is clean and low-risk; S21 is actively incoherent. Recommend LEAD ratify S23 now and delete the resolve-with-PLAN clause from scope.',
    'SEVERE / SCOPE-CHANGING -- daily_rollups HAS ZERO WRITERS. Scoped grep over lib/ and src/ returns only readers: venture-activation-gate.js:216-217 .from(daily_rollups).select(spend_cents, conversions) and cpa-gauge-cli.mjs:40-41 identical. No .insert or .upsert anywhere. The codebase already NAMES this condition: venture-activation-gate.js:222 returns state no_writer_yet, and cpa-gauge.mjs:12 says this gauge only ever returns no_writer_yet. Live row counts confirm: creative_assets 0, marketing_content_variants 0, daily_rollups 0, marketing_attribution 0, experiments 0, experiment_assignments 0. The ENTIRE scoring substrate is empty with no ingestion path. Success_criterion 2 (verified by a test exercising at least one selection cycle) is satisfiable with synthetic fixtures while the production path yields nothing -- the sampler would see every variant at successes=0/failures=0, fall into the MIN_IMPRESSIONS_FOR_DECLARATION under-explored branch (:44-46) forever, and never declare a champion. This is a dead-by-construction requirement wearing the appearance of a wired one.',
    'MATERIAL / SCOPE-CHANGING -- THERE ARE TWO THOMPSON SAMPLERS, AND THE SD NAMES ONLY ONE. Besides lib/marketing/ai/thompson-sampler.js, lib/eva/experiments/experiment-assignment.js:130 exports its own thompsonSample(variants) with its own betaSample:156 / gammaSample:169 / normalSample:197 and its own live experiment_assignments table (:35), including 23505 race handling. These are independent duplicate implementations of the same algorithm. If child C reuses the marketing one without naming the eva one, the repo keeps two bandits and child C silently becomes the tie-breaker for which is canonical -- or, worse, sibling D adds a third in the ehg app. The PRD must state WHICH sampler is canonical for produced media and why the other is not used.',
    'MATERIAL / UNACKNOWLEDGED FORCING CONSTRAINT -- marketing_content_variants.content_id IS UUID NOT NULL REFERENCES marketing_content(id) ON DELETE CASCADE (migration :47, confirmed NOT NULL live). A bare creative_assets.variant_id FK therefore CANNOT stand alone: every bridged asset requires a synthetic parent marketing_content row plus a marketing_content_variants row, inventing marketing content that does not exist just to hang a score on a picture. Success_criterion 1 offers a new FK or join table as equivalent options -- they are NOT equivalent under this constraint. A join table (creative_asset_variants: creative_asset_id, variant_id, or a direct asset-scoped score table keyed to daily_rollups) avoids fabricating marketing_content rows. PLAN should be directed to this constraint rather than discovering it mid-EXEC.',
    'MATERIAL / MISSING DERIVATION -- daily_rollups HAS NO successes/failures COLUMNS. Live columns are impressions, engagements, clicks, conversions, spend_cents (+ generated engagement_rate, ctr, conversion_rate). The sampler contract is strictly {id, successes, failures}. Nothing in the SD names the mapping. successes=conversions vs clicks vs engagements are materially different bandits, and failures is presumably impressions-minus-successes but could equally be a no-op count. This derivation is a product decision, not an implementation detail, and it has a SECOND consumer already queued: sibling D scope item 3 requires PerformanceDashboard.tsx and VideoVariantTesting.tsx to read child C scoring. Two consumers deriving it independently guarantees divergence on which variant won.',
    'CROSS-CHILD -- SIBLING D NEEDS A READABLE SURFACE, NOT JUST A SCHEMA. D scope item 3 states VideoVariantTesting.tsx and PerformanceDashboard.tsx must read from child C scoring bridge rather than maintaining independent scoring logic. So child C must ship a queryable read API or view, not merely a table plus a sampler call. Separately, D own research confirmed creative_media_assets / creative_campaigns / video_variants are ABSENT from the consolidated DB -- child C must NOT assume any ehg-app-side table exists when designing the bridge identifier.',
    'SIBLING-B RETRO ALREADY PREDICTED THE ONE REAL RISK HERE, BY NAME. incorporate-validation-findings-media-production-capability-001-b.mjs:34 records the risk verbatim: A future consumer (e.g. Child C taste-gate UI) bypasses asset-view-gate.js and mints its own signed URL or reads storage_path directly, silently defeating the fence, with prescribed mitigation at :37 (Child C own SECURITY review should grep for direct createSignedUrl/getPublicUrl calls against creative-assets-private). The risk of this SD is NOT the stage choice -- it is child C building a second read path. This mitigation must be carried into child C PRD as an explicit SECURITY check, not left in sibling B retro where child C EXEC will never see it.',
    'DUPLICATE-SD CHECK CLEAN. Scanned all 1000 non-terminal strategic_directives_v2 rows against 13 high-signal terms (thompson, bandit, marketing_content_variants, creative_asset, beta-posterior, daily_rollups, variant scoring, taste-gate, asset-variant, ...). Only 2 hits, both COMPLETED and in unrelated domains: SD-PRICING-TESTING-001 (Pricing Experimentation Infrastructure -- bandit for pricing, not media) and SD-AUTOMATED-PIPELINE-RUNNER-FOR-ORCH-001-B (Operational Hardening: Diversity/Retry/Pruning -- thompson mentioned for pipeline diversity). Neither owns asset-variant scoring. No competing or overlapping active SD exists. Child C is genuinely unbuilt work.',
    'GATE 1 BACKLOG CHECK -- 0 items, NOT A BLOCKER BY FAMILY PRECEDENT. sd_backlog_map has 0 rows for child C. However siblings A and B ALSO carried 0 backlog rows and both reached COMPLETED, so this orchestrator family is success_criteria-driven rather than backlog-driven. The 4 success_criteria are specific and measurable, satisfying the anti-scope-ambiguity intent of the backlog rule. Flagging for consistency only; do not block on it.',
  ],
  warnings: [
    'SEVERE: daily_rollups has zero writers (readers only; codebase names the state no_writer_yet) and all six substrate tables are at 0 rows. As scoped, child C would ship a correct bridge into a substrate that can never produce a score. Success_criterion 2 is passable on fixtures while dead in production.',
    'Two independent Thompson Sampling implementations already exist (lib/marketing/ai/thompson-sampler.js and lib/eva/experiments/experiment-assignment.js:130). The SD names only one; the PRD must declare which is canonical or the repo keeps both plus whatever sibling D adds.',
    'marketing_content_variants.content_id is NOT NULL FK to marketing_content, so a new FK and a join table are NOT interchangeable as success_criterion 1 implies -- a bare FK forces fabrication of synthetic marketing_content rows per asset.',
    'The sampler needs {successes, failures}; daily_rollups provides impressions/engagements/clicks/conversions. The derivation is unspecified and has two independent consumers (child C and sibling D dashboards) that will diverge without a single named definition.',
    'Sibling B retro-flagged risk (Child C mints its own signed URL and defeats the fence) lives only in sibling B artifacts. Carry it into child C PRD as an explicit SECURITY grep, or child C EXEC will never encounter it.',
    'The scope clause resolve S21-vs-S23 gate placement with PLAN should be closed at LEAD in favour of S23; leaving it open invites PLAN to re-litigate a question that has a determinate answer (S21 would make assets scoring-eligible before they are viewable).',
  ],
  recommendations: [
    'LEAD: RATIFY S23 NOW and rewrite scope to state it as decided, not open. Rationale for the record: sibling B already bound creative_assets viewing to S23-approval + S24-lifecycle; gating scoring at S21 would make assets scoring-eligible while unviewable. Child C should REUSE checkAssetViewAuthorized() from lib/creative/asset-view-gate.js as the eligibility predicate so the taste-gate and the fence cannot drift apart.',
    'LEAD: rewrite success_criterion 3. It currently asks PLAN to decide S21-vs-S23 and to state what supersedes the S21 standing direction. Replace with the factual answer: sibling A in-house generation superseded the S21 direction PREMISE (3rd-party tool dependency); S21 continues to gate textual briefs in venture_artifacts and is NOT modified by this SD; S23 gates produced pixels in creative_assets.',
    'LEAD/PLAN: resolve the zero-writer problem EXPLICITLY before EXEC, choosing one of two honest options. (a) Expand scope to include the writer that populates daily_rollups.variant_id for creative-asset variants, and add a success_criterion requiring a non-synthetic row to exist end-to-end. (b) Keep C as schema-bridge-only and add a success_criterion that STATES the bridge is inert until a named successor SD supplies ingestion. Either is defensible; shipping without choosing produces a scoring system that cannot score. Per the SCOPE=SUCCESS_CRITERIA rule, this must land in success_criteria, not in the description.',
    'PLAN: name the canonical sampler and justify the rejection of the other. Recommend lib/marketing/ai/thompson-sampler.js (its {id,successes,failures} contract is table-agnostic and it already sits beside the marketing_content_variants/daily_rollups substrate), and explicitly record that lib/eva/experiments/experiment-assignment.js remains scoped to venture experiments over experiment_assignments.',
    'PLAN: prefer a join table (or an asset-scoped score table) over a bare creative_assets.variant_id FK, driven by the marketing_content_variants.content_id NOT NULL constraint. If a bare FK is chosen anyway, the PRD must state who mints the required parent marketing_content row and what it means semantically for a generated image to have marketing content.',
    'PLAN: define the successes/failures derivation from daily_rollups as a single named, documented mapping (e.g. successes=conversions, failures=impressions-conversions) in ONE place both child C and sibling D consume, so which variant won has exactly one answer.',
    'PLAN/EXEC: carry sibling B risk forward as a mandatory SECURITY check in child C -- grep for direct createSignedUrl / getPublicUrl calls against creative-assets-private and assert asset-view-gate.js remains the sole read path.',
    'PLAN: expose the bridge as a queryable read surface (view or API), not just a table, since sibling D dashboards are an already-committed downstream consumer.',
    'PLAN: apply the same RLS rigor as creative_assets (venture-scoped via user_company_access, per 20260712_creative_assets.sql:56-63) to the new bridge, and verify with a live-DB check per success_criterion 4 rather than assuming the default.',
  ],
  metadata: {
    gate: 'GATE_1_LEAD_PRE_APPROVAL',
    duplicate_sd_check: { scanned: 1000, high_signal_terms: 13, hits: 2, blocking_duplicates: 0, verdict: 'CLEAN' },
    existence_verification: {
      'database/migrations/20260214_marketing_engine_foundation.sql': 'CONFIRMED daily_rollups.variant_id:134, marketing_attribution.variant_id:169, marketing_content_variants:45-58',
      'database/migrations/20260712_creative_assets.sql': 'CONFIRMED 10 cols, no variant_id, RLS venture-scoped:56-63',
      'lib/marketing/ai/thompson-sampler.js': 'CONFIRMED 157 LOC, createSampler:18, selectVariant:26 {id,successes,failures}',
      'lib/creative/asset-view-gate.js': 'CONFIRMED S23 via PRODUCT_REVIEW_STAGE:39,77 + S24 REQUIRED_LIFECYCLE_STAGE:43',
      'lib/eva/chairman-product-review.js': 'CONFIRMED PRODUCT_REVIEW_STAGE=23 at :18',
      'database/migrations/20260607_s21_creative_handoff_gate.sql': 'CONFIRMED -- UPDATE venture_stages only, no tables; S21 gates textual briefs',
    },
    live_row_counts: { creative_assets: 0, marketing_content_variants: 0, daily_rollups: 0, marketing_attribution: 0, experiments: 0, experiment_assignments: 0 },
    daily_rollups_writers: 0,
    duplicate_sampler_implementations: ['lib/marketing/ai/thompson-sampler.js', 'lib/eva/experiments/experiment-assignment.js:130'],
    s21_vs_s23_decision: 'S23 -- clean and low-risk; S21 creates a scoring-eligible-but-unviewable ordering contradiction against sibling B fence',
    backlog_items: 0,
    backlog_precedent: 'siblings A and B also 0, both COMPLETED -- family is success_criteria-driven',
  },
};

// detailed_analysis is a TEXT column, and storeSubAgentResults deliberately drops
// results.findings (results-storage.js:716 "no findings column exists; content
// deliberately not copied"). Persist the findings as text so the row is not hollow.
results.detailed_analysis =
  'VALIDATION (Principal Systems Analyst) LEAD-phase findings for ' + SD_KEY + '. '
  + results.findings.length + ' findings, persisted as text because results.findings is dropped by the storage layer.'
  + String.fromCharCode(10) + String.fromCharCode(10)
  + results.findings.map((f, i) => 'FINDING ' + (i + 1) + '/' + results.findings.length + ': ' + f).join(String.fromCharCode(10) + String.fromCharCode(10));

const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'VALIDATION', supabase });
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('VALIDATION', SD_KEY, null, results, { phase: 'LEAD' });
console.log('Stored VALIDATION evidence id:', stored.id);
