#!/usr/bin/env node
/**
 * build-marketlens-triage-pack.mjs — SD-LEO-INFRA-MARKETLENS-REMEDIATION-TRIAGE-001
 *
 * FABLE-framing pack builder (split-verb doctrine: this frames, the ordinary fleet builds).
 * Idempotent + re-runnable. Default is DRY RUN (prints the pack); --execute writes:
 *   1. strategic_directives_v2.metadata.triage_pack on the source SD (DB-first truth)
 *   2. docs/ventures/marketlens-remediation-triage-pack.md (human render)
 *   3. One belt-claimable draft row per cluster via the EXISTING writers
 *      (createSD from scripts/leo-create-sd.js; quick_fixes insert in the canonical
 *      create-quick-fix.js column shape), each with metadata.remediation_pack +
 *      co_author_pending=true for coordinator convergence.
 *   4. Verification: 22/22 verdict set-difference + spec-field lint (exits non-zero on drift).
 *
 * GROUNDING (EXEC evidence fan-out 2026-07-05): the 22 PARTIAL/MISSING dispositions in
 * post_build_verdicts come from a KEYWORD-TOKEN heuristic (lib/eva/post-build-verdict-engine.js
 * computeDisposition/findEvidenceForClaim) that greps the product repo for artifact-type name
 * tokens — ALL 22 artifacts exist in venture_artifacts with substantial content. Only 6 verdicts
 * feed the adherence gate (post_build_adherence_v1: architecture_conformance=1 FAIL is the primary
 * gate failure; three other dimensions sit at floor 3). The chairman's SEND-BACK anchors
 * (unstyled landing — zero CSS repo-wide; absent trust surface; copy-vs-product mismatch) are NOT
 * verdict rows at all — they enter the pack as chairman-anchored cluster scope. ANTI-GAMING RULE
 * baked into every spec: remediation is REAL wiring (docs, styling, pages, contracts); never
 * token-stuff the repo to flip the heuristic.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createSD } from '../leo-create-sd.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

const SOURCE_SD = 'SD-LEO-INFRA-MARKETLENS-REMEDIATION-TRIAGE-001';
const VENTURE_ID = 'ecbba50e-3c98-4493-9e77-1719cf6b6f00';
const VENTURE_REPO = 'C:/Users/rickf/Projects/_EHG/marketlens';
const EXECUTE = process.argv.includes('--execute');

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Triage axes per artifact_type (authored; reasoning recorded per row) ──────
// gating: RE_REVIEW_GATING = fails the chairman machine-precheck calibration
// (styling/brand incl. canonical logo, trust surface, core-journey breaks) OR feeds
// the failing/at-floor adherence gate. Everything else POST_REVIEW_ACCEPTABLE.
const TRIAGE = {
  truth_idea_brief:            { cluster: 'CL-7', gating: false, tier: 2, spec_mode: 'document_deviation', reasoning: 'Heuristic false-positive: WEAK match on the lone token "truth" in code comments/fixtures. Strategy-layer artifact (5,132 chars in venture_artifacts) not meant to live in product source. Out of adherence-rubric scope.' },
  truth_ai_critique:           { cluster: 'CL-7', gating: false, tier: 2, spec_mode: 'document_deviation', reasoning: 'Heuristic false-positive (lone token "truth"); artifact is the largest of all (48,590 chars). Out of rubric scope.' },
  truth_competitive_analysis:  { cluster: 'CL-7', gating: false, tier: 2, spec_mode: 'document_deviation', reasoning: 'WEAK cross-file token match ("truth" + "competitive" in the hero subtitle). Analysis artifact exists (7,521 chars); product wiring not intended. Out of rubric scope.' },
  truth_financial_model:       { cluster: 'CL-7', gating: false, tier: 2, spec_mode: 'document_deviation', reasoning: 'Heuristic false-positive ("truth" + "model" in unrelated comments). Artifact exists (3,159 chars/25 keys). Out of rubric scope.' },
  engine_pricing_model:        { cluster: 'CL-2', gating: true,  tier: 3, spec_mode: 'integrate', reasoning: 'Genuine integration gap doubling as trust-surface content: pricing artifact exists (5,757 chars/21 keys) but the product has NO pricing surface at all — the missing pricing page is a chairman trust-surface anchor, so it rides CL-2.' },
  engine_business_model_canvas:{ cluster: 'CL-7', gating: false, tier: 2, spec_mode: 'document_deviation', reasoning: 'Heuristic false-positive ("engine" in a layout comment + "model" elsewhere). BMC artifact exists (8,753 chars). Out of rubric scope.' },
  engine_exit_strategy:        { cluster: 'CL-7', gating: false, tier: 2, spec_mode: 'document_deviation', reasoning: 'Heuristic false-positive at its purest: "exit" matched process.exit() in the SIGTERM handler. Artifact exists (5,664 chars). Out of rubric scope.' },
  identity_naming_visual:      { cluster: 'CL-1', gating: true,  tier: 3, spec_mode: 'integrate', reasoning: 'Genuine + gate-feeding (persona_surface_coverage at floor 3) + chairman styling/brand anchor: brandAssets.js falls back to bare text (no local logo asset exists anywhere in the repo); /app views render zero brand. Naming/visual artifact exists (16,286 chars).' },
  identity_gtm_sales_strategy: { cluster: 'CL-7', gating: false, tier: 2, spec_mode: 'document_deviation', reasoning: 'Heuristic false-positive (lone "identity" token in a comment). GTM artifact exists (9,334 chars). Unmapped in the rubric.' },
  blueprint_product_roadmap:   { cluster: 'CL-3', gating: true,  tier: 3, spec_mode: 'integrate', reasoning: 'Gate-feeding: half of architecture_conformance=1 — THE primary adherence-gate failure. Roadmap artifact exists (4,082 chars); zero repo trace.' },
  blueprint_technical_architecture: { cluster: 'CL-3', gating: true, tier: 3, spec_mode: 'create_from_scratch', reasoning: 'Gate-feeding MISSING (empty evidence_refs): drives architecture_conformance=1. Architecture artifact EXISTS upstream (27,301 chars/23 keys) — "create" here means materialize it into the repo as living docs with as-built drift notes, not re-author.' },
  blueprint_erd_diagram:       { cluster: 'CL-4', gating: true,  tier: 3, spec_mode: 'create_from_scratch', reasoning: 'Gate-feeding MISSING (empty evidence_refs): one of data_model_fidelity\'s inputs (dimension at floor 3). ERD artifact exists upstream (2,486 chars); repo has no docs/, no ERD, data model implicit in in-memory services.' },
  blueprint_api_contract:      { cluster: 'CL-4', gating: true,  tier: 3, spec_mode: 'integrate', reasoning: 'Gate-feeding (data_model_fidelity at floor): no OpenAPI/spec exists; the de-facto contract is the Zod schemas under src/schemas/. Contract artifact is the thinnest (1,432 chars) — generate the real contract from the Zod truth.' },
  wireframe_screens:           { cluster: 'CL-7', gating: false, tier: 2, spec_mode: 'document_deviation', reasoning: 'MISSING by token-absence only; wireframes exist upstream (9,580 chars). Out of rubric scope; product ships real screens already.' },
  blueprint_user_story_pack:   { cluster: 'CL-5', gating: true,  tier: 3, spec_mode: 'decision', reasoning: 'Genuine: the ONLY non-BUILT story of 14 (user_story_coverage at floor 3) — the chartered compare-two-competitors feature has ZERO product files; worse, the landing hero SELLS "competitive intelligence" while the app delivers personas+WTP (copy-vs-product mismatch, chairman-adjacent). Decision spec: build the feature OR document the deviation; either way fix the copy mismatch.' },
  blueprint_financial_projection: { cluster: 'CL-7', gating: false, tier: 2, spec_mode: 'document_deviation', reasoning: 'MISSING by token-absence; projection artifact exists upstream (12,893 chars/26 keys). Out of rubric scope; closest runtime code (costs.js cash-burn feed) is a live feature, not a projection doc.' },
  system_devils_advocate_review: { cluster: 'CL-7', gating: false, tier: 2, spec_mode: 'document_deviation', reasoning: 'Pure comment-noise match (generic token "review" hits "adversarial review finding" comments). Artifact exists (2,486 chars). Out of rubric scope.' },
  marketing_tagline:           { cluster: 'CL-7', gating: false, tier: 2, spec_mode: 'document_deviation', reasoning: 'Heuristic false-positive ("marketing" in test fixtures). Note: artifact genuinely minimal (99 chars) — flagged for content refresh in the deviation record, but not product-wiring work.' },
  marketing_social_posts:      { cluster: 'CL-7', gating: false, tier: 2, spec_mode: 'document_deviation', reasoning: 'Heuristic false-positive; social posts (2,007 chars) are launch collateral, not product source. Out of rubric scope.' },
  marketing_seo_meta:          { cluster: 'CL-6', gating: false, tier: 2, spec_mode: 'integrate', reasoning: 'Genuine small integration gap with real UX value: the SEO meta artifact (494 chars) is NOT wired into the hardcoded <head> blocks (no meta description/OG tags anywhere). Post-review-acceptable: not a chairman anchor, not gate-feeding.' },
  marketing_blog_draft:        { cluster: 'CL-7', gating: false, tier: 2, spec_mode: 'document_deviation', reasoning: 'Heuristic false-positive ("marketing" in fixtures); blog draft (1,638 chars) is launch collateral. Out of rubric scope.' },
  build_mvp_build:             { cluster: 'CL-7', gating: false, tier: 2, spec_mode: 'document_deviation', reasoning: 'Near-miss heuristic artifact: "build" appears in bodies but never filenames. The MVP demonstrably WAS built (the repo). Least actionable of the 18.' },
};

// ── Clusters: tier-coherent belt-claimable work items ─────────────────────────
// Ordering: RE_REVIEW_GATING chairman anchors first (styling/brand, trust), then
// gate-feeding conformance, then decision + post-review items.
const DEVIATION_VALVE = 'Deviation valve: a documented-skip with reason + weight recorded on the verdict (deviation ledger) is a LEGAL completion outcome; a silent pass is not. Never token-stuff the product repo to flip the keyword heuristic — acceptance is the real artifact wiring, the verdict flip is a side effect.';
const J2A = 'J2a settlement (SD-LEO-INFRA-J2A-EVA-GENERATION-001, proceed-unchanged 2026-07-05T14:17Z): regeneration at a higher model tier does NOT close these gaps — they are spec/logic/integration problems.';

const CLUSTERS = [
  {
    id: 'CL-1', order: 1, kind: 'sd', tier: 3, gating: true, estimated_loc: 180,
    title: 'MarketLens: style + brand the product (landing, app shells, local logo) — chairman styling anchor',
    verdicts: ['identity_naming_visual'],
    spec: {
      remediation: 'Add a real stylesheet (design tokens from the identity_naming_visual artifact, 16,286 chars in venture_artifacts) served from src/public/, wired into BOTH page shells: src/views/layout.js htmlPage() <head> and src/routes/web.js PAGE_WRAPPER. Commit a local brand asset under src/public/ (source it from the identity_logo_image artifact; keep the remote fetch in src/lib/brandAssets.js as enrichment, local file as default so the no-env fallback is BRANDED, not bare text). Render brandHeader() in the /app views (src/views/appViews.js) which currently carry zero brand. Style the landing hero + CTA (src/routes/web.js lines ~25-49) with real classes.',
      acceptance_miss: 'Supertest DOM assertions (added by this cluster to tests/integration/web.test.js): GET / and GET /app/login responses contain a <link rel="stylesheet"> resolving 200, styled-class markup on hero/CTA, and a brand <img> (or inline svg) WITHOUT env vars set. These assertions are the walkthrough-#2 precheck P4 harness.',
      acceptance_pass: 'Existing suites stay green: npm test in ' + VENTURE_REPO + ' (all unit + integration incl. the full core-loop journey test) — styling must not break the flow or the text-fallback contract test (update that test to assert the NEW branded default instead).',
      targets: [
        { path: 'src/views/layout.js', verified: true }, { path: 'src/routes/web.js', verified: true },
        { path: 'src/lib/brandAssets.js', verified: true }, { path: 'src/views/appViews.js', verified: true },
        { path: 'src/public/', verified: true }, { path: 'tests/integration/web.test.js', verified: true },
      ],
    },
  },
  {
    id: 'CL-2', order: 2, kind: 'sd', tier: 3, gating: true, estimated_loc: 220,
    title: 'MarketLens: build the trust surface (pricing/about/privacy/terms pages + footer) — chairman trust anchor',
    verdicts: ['engine_pricing_model'],
    spec: {
      remediation: 'The public surface is 2 bare pages with NO pricing/about/testimonials/privacy/terms/security/footer anywhere (verified absence). Add trust routes to src/routes/web.js: /pricing (content sourced from the engine_pricing_model artifact, 5,757 chars/21 keys — this closes the pricing-artifact integration gap), /about, /privacy, /terms; add a shared <footer> (copyright + links) to both page shells. Content grounding: pricing tiers from the artifact; about from truth_idea_brief positioning.',
      acceptance_miss: 'Supertest assertions: GET /pricing|/about|/privacy|/terms return 200 with non-placeholder content (pricing page renders tier names/prices from the artifact); every public page contains <footer> with links to the four.',
      acceptance_pass: 'npm test green; landing CTA flow unchanged (web.test.js hero/CTA assertions untouched); no auth regressions (tests/integration/auth.test.js).',
      targets: [
        { path: 'src/routes/web.js', verified: true }, { path: 'src/views/layout.js', verified: true },
        { path: 'src/services/landing.js', verified: true },
      ],
    },
  },
  {
    id: 'CL-3', order: 3, kind: 'sd', tier: 3, gating: true, estimated_loc: 120,
    title: 'MarketLens: materialize architecture + roadmap into the repo (fixes architecture_conformance=1, the failing gate dimension)',
    verdicts: ['blueprint_technical_architecture', 'blueprint_product_roadmap'],
    spec: {
      remediation: 'architecture_conformance scored 1/5 — THE primary adherence-gate failure. Materialize the EXISTING upstream artifacts into the repo as living docs: docs/ARCHITECTURE.md from blueprint_technical_architecture (27,301 chars/23 keys in venture_artifacts) and docs/ROADMAP.md from blueprint_product_roadmap (4,082 chars/14 keys) — each with an AS-BUILT DRIFT section reconciling plan vs the real Express app (in-memory persistence, single-process, port 3001 vs compose 3000 defect README lines 19-24). This is materialization + reconciliation, NOT re-authoring; where the as-built diverges deliberately, record the deviation with reason (the valve).',
      acceptance_miss: 'docs/ARCHITECTURE.md + docs/ROADMAP.md exist with drift sections; re-running the post-build verdict walk flips both verdicts (technical_architecture MISSING→BUILT, product_roadmap PARTIAL→BUILT) LEGITIMATELY (docs contain the real content, not token stuffing); adherence architecture_conformance rescores >= 3.',
      acceptance_pass: 'npm test green (docs-only change); no product code touched beyond doc links.',
      targets: [
        { path: 'docs/', verified: false, discovery: 'docs/ does not exist yet in the venture repo (verified absent) — creating it IS the work; first task: mkdir docs + confirm no competing doc convention in README.md (verified present).' },
        { path: 'README.md', verified: true },
      ],
    },
  },
  {
    id: 'CL-4', order: 4, kind: 'sd', tier: 3, gating: true, estimated_loc: 150,
    title: 'MarketLens: real API contract from Zod truth + ERD of the actual data model (data_model_fidelity inputs)',
    verdicts: ['blueprint_erd_diagram', 'blueprint_api_contract'],
    spec: {
      remediation: 'data_model_fidelity sits at floor 3 with these two as its non-BUILT inputs. (a) Generate an OpenAPI document from the de-facto contract — the Zod schemas in src/schemas/{auth,costs,decisions,feedback,landing,personas,telemetry}.js — into docs/openapi.yaml (or generated docs/api-contract.md), reconciled against the upstream blueprint_api_contract artifact (1,432 chars; thin — the Zod truth wins, divergences recorded). (b) Author docs/ERD.md diagramming the ACTUAL in-memory data model (module-scoped arrays in src/services/{users,personas,costs,feedback,telemetry}.js), reconciled against the upstream blueprint_erd_diagram artifact (2,486 chars); note explicitly that persistence is in-memory by design (MVP scope).',
      acceptance_miss: 'docs/openapi.yaml validates (swagger-cli or zod-to-openapi output parses); every /api/* route in src/routes/ appears in the contract; docs/ERD.md covers every service-layer entity; verdict re-walk flips both rows legitimately; data_model_fidelity rescores > 3.',
      acceptance_pass: 'npm test green; zero runtime behavior change (docs + optional generator script only). RISK KEYWORD NOTE: "schema" here is documentation OF existing Zod schemas — no DB/schema migration exists in this repo (in-memory app); tier-3 routing applied anyway per the keyword rule.',
      targets: [
        { path: 'src/schemas/', verified: true }, { path: 'src/services/', verified: true },
        { path: 'docs/', verified: false, discovery: 'Shared with CL-3 (docs/ creation) — sequence after or alongside CL-3.' },
      ],
    },
  },
  {
    id: 'CL-5', order: 5, kind: 'sd', tier: 3, gating: true, estimated_loc: 300,
    title: 'MarketLens: competitor-comparison story — BUILD or DOCUMENT-DEVIATION decision (+ fix the copy-vs-product mismatch either way)',
    verdicts: ['blueprint_user_story_pack'],
    spec: {
      remediation: 'Story 5 ("As a Small Agency Owner, I want to compare the marketing spend and channel mix of two specified competitors…") is the ONLY non-BUILT story of 14 — zero product files implement comparison (verified: full-repo search). Meanwhile the landing hero SELLS "competitive intelligence for B2B teams" while the app delivers personas+WTP. DECISION SPEC — the building worker escalates the fork to the coordinator/chairman rather than choosing silently: OPTION A build the feature (new compare routes/views/service consuming two competitor inputs, reusing the persona-generation seam in src/services/personaGeneration.js; ~300 LOC); OPTION B document the deviation (story descoped-for-MVP with reason+weight on the verdict) AND align the landing copy to the real product. EITHER option MUST fix the copy mismatch: src/services/landing.js heroContent to truthfully describe shipped capability (A: keep competitive-intel copy once real; B: reposition to persona/WTP).',
      acceptance_miss: 'OPTION A: journey test extended — login → compare two competitors → rendered comparison (marketing spend + channel mix) passes; verdict flips BUILT. OPTION B: deviation record exists with chairman-visible reason; landing copy assertion updated (web.test.js hero text) to the truthful positioning; verdict carries DEVIATED_WITH_DOCUMENTED_REASON.',
      acceptance_pass: 'npm test green either way; existing persona/WTP flow untouched (tests/integration/app.test.js full core loop).',
      targets: [
        { path: 'src/services/landing.js', verified: true }, { path: 'src/services/personaGeneration.js', verified: true },
        { path: 'tests/integration/web.test.js', verified: true }, { path: 'tests/integration/app.test.js', verified: true },
      ],
    },
  },
  {
    // kind 'sd' despite tier-2 sizing: quick_fixes_target_application_check constrains the QF
    // lane to EHG/EHG_Engineer — venture-repo work structurally cannot ride a QF. Lane finding
    // recorded in the pack + completion flags.
    id: 'CL-6', order: 6, kind: 'sd', tier: 2, gating: false, estimated_loc: 40,
    title: 'MarketLens: wire marketing_seo_meta into the <head> blocks (meta description + OG tags)',
    verdicts: ['marketing_seo_meta'],
    spec: {
      remediation: 'The SEO meta artifact (494 chars) is not wired anywhere — both page shells hardcode <head> with zero meta description/OG tags. Add meta description + og:title/description (+ og:image when a brand asset lands via CL-1) to src/routes/web.js PAGE_WRAPPER and src/views/layout.js htmlPage(), content from the marketing_seo_meta artifact (fetch pattern: same venture_artifacts read as src/lib/brandAssets.js, with hardcoded fallback matching the artifact text).',
      acceptance_miss: 'Supertest: GET / response contains <meta name="description"> + og tags with non-empty content.',
      acceptance_pass: 'npm test green; page titles unchanged.',
      targets: [
        { path: 'src/routes/web.js', verified: true }, { path: 'src/views/layout.js', verified: true },
        { path: 'src/lib/brandAssets.js', verified: true },
      ],
    },
  },
  {
    id: 'CL-7', order: 7, kind: 'qf', tier: 2, gating: false, estimated_loc: 60,
    title: 'MarketLens: deviation-documentation sweep for the 14 strategy-layer verdicts (heuristic false-positives / out-of-rubric)',
    verdicts: [
      'truth_idea_brief', 'truth_ai_critique', 'truth_competitive_analysis', 'truth_financial_model',
      'engine_business_model_canvas', 'engine_exit_strategy', 'identity_gtm_sales_strategy',
      'system_devils_advocate_review', 'marketing_tagline', 'marketing_social_posts',
      'marketing_blog_draft', 'build_mvp_build', 'wireframe_screens', 'blueprint_financial_projection',
    ],
    spec: {
      remediation: 'These 14 verdicts are keyword-heuristic artifacts: every underlying artifact EXISTS in venture_artifacts with substantial content (grounding report), they are all out of adherence-rubric scope, and their PARTIAL/MISSING labels came from single-token comment/fixture collisions (e.g. engine_exit_strategy matched process.exit()). Remediation = write deviation records (EHG_Engineer-side script; the deviation-ledger row each verdict\'s deviation_artifact_id expects) with reason "strategy/launch-layer artifact, not product-wired by design" + weight, so the verdict engine reads DEVIATED_WITH_DOCUMENTED_REASON on its next walk instead of noise. Include a content-refresh note on marketing_tagline (genuinely minimal at 99 chars). ZERO product-repo changes.',
      acceptance_miss: 'All 14 verdicts carry a deviation record (deviation_artifact_id non-null or ledger row per the engine\'s expected shape — discover the exact shape from lib/eva/post-build-verdict-engine.js deviation handling as the first task); next verdict walk shows 0 undocumented PARTIAL/MISSING among these 14.',
      acceptance_pass: 'The 6 genuine gap verdicts (CL-1..CL-5) are NOT touched by this sweep; adherence scores unchanged by this cluster alone.',
      targets: [
        { path: 'EHG_Engineer:lib/eva/post-build-verdict-engine.js', verified: true },
        { path: 'EHG_Engineer:lib/eva/adherence-scorer.js', verified: true },
      ],
    },
  },
];

// ── Precheck: the machine-evaluable walkthrough-#2 re-staging gate ────────────
const PRECHECK = [
  { id: 'P1', description: 'Post-build adherence gate passes (post_build_adherence_v1: every dimension >= 3, mean >= 4). Currently FAILING: architecture_conformance=1, mean 2.5.',
    executable_form: 'node -e run of lib/eva/adherence-scorer.js against live post_build_verdicts for venture ' + VENTURE_ID + ' (the convergence-loop scoring entry point)', pass_condition: 'all dimension scores >= 3 AND mean >= 4', status: 'READY' },
  { id: 'P2', description: 'All RE_REVIEW_GATING cluster items (CL-1..CL-5) completed or chairman-approved-deviated.',
    executable_form: "SQL: created rows where metadata->'remediation_pack'->>'source_sd' = '" + SOURCE_SD + "' AND (metadata->'remediation_pack'->>'gating')::boolean — assert status IN (completed) or a chairman-approved deviation recorded", pass_condition: 'zero gating rows outstanding', status: 'READY' },
  { id: 'P3', description: 'Core journey green: full core loop (login → generate → results → feedback → telemetry) including the synthetic test persona.',
    executable_form: 'npm run test:e2e in ' + VENTURE_REPO + ' (tests/integration/app.test.js "full core loop" — HTTP-level supertest journey; NOTE: no browser-level walk exists, this is the honest current ceiling)', pass_condition: 'suite green', status: 'READY' },
  { id: 'P4', description: 'Landing styled + branded (stylesheet served, styled hero/CTA, brand asset rendered by default).',
    executable_form: 'npx vitest run tests/integration/web.test.js in the venture repo — the DOM assertions CL-1 adds (stylesheet link resolving 200 + brand img present without env vars)', pass_condition: 'assertions green', status: 'BLOCKED_UNTIL_CL-1', missing_harness: 'No styling/visual harness exists today (zero CSS repo-wide, no browser/visual-regression/DOM-CSS assertion tooling, no lint/build scripts) — CL-1 delivers the supertest DOM-assertion harness as part of its scope.' },
  { id: 'P5', description: 'Verdict re-walk shows 0 MISSING and 0 UNDOCUMENTED PARTIAL for the venture (legitimate flips via CL-3/CL-4 materialization + CL-7 deviation records — never token-stuffing).',
    executable_form: "SQL: SELECT count(*) FROM post_build_verdicts WHERE venture_id='" + VENTURE_ID + "' AND (disposition='MISSING' OR (disposition='PARTIAL' AND deviation_artifact_id IS NULL)) — after re-running the verdict walk", pass_condition: 'count = 0', status: 'READY' },
  { id: 'P6', description: 'Landing copy truthfully matches shipped capability (competitive-intel promise vs persona/WTP product resolved by the CL-5 decision).',
    executable_form: 'npx vitest run tests/integration/web.test.js hero-copy assertion as updated by CL-5', pass_condition: 'assertion green', status: 'BLOCKED_UNTIL_CL-5', missing_harness: 'Gate check depends on the CL-5 build-vs-deviate decision landing first; the updated hero assertion IS the check.' },
];

const SYSTEM_FINDING = 'REFERENT-AUDIT FINDING (routed to coordinator as symptom+hypothesis, not fixed here): post-build-verdict-engine.js computeDisposition/findEvidenceForClaim classify by artifact-type NAME-TOKEN grep over the product repo — all 22 "gap" artifacts exist upstream with substantial content; 14/22 dispositions are token-collision noise (e.g. engine_exit_strategy PARTIAL because of process.exit()). The engine needs a semantic evidence model; until then, deviation records are the honest control and token-stuffing is the failure mode to police in remediation PRs.';

// ── Build the table from LIVE verdicts (no re-derivation; FR-1) ───────────────
async function buildTable() {
  const { data, error } = await sb.from('post_build_verdicts')
    .select('id, artifact_type, claim_ref, claim_description, disposition, evidence_refs, created_at')
    .eq('venture_id', VENTURE_ID)
    .in('disposition', ['PARTIAL', 'MISSING'])
    .order('created_at', { ascending: true });
  if (error) throw new Error('verdict read failed: ' + error.message);

  const rows = data.map(v => {
    const t = TRIAGE[v.artifact_type];
    if (!t) throw new Error('UNTRIAGED artifact_type: ' + v.artifact_type + ' (verdict ' + v.id + ')');
    return {
      verdict_id: v.id,
      artifact_type: v.artifact_type,
      claim_ref: v.claim_ref,
      claim_description: v.claim_description,
      disposition: v.disposition,
      evidence_refs: v.evidence_refs, // verbatim
      gating: t.gating ? 'RE_REVIEW_GATING' : 'POST_REVIEW_ACCEPTABLE',
      gating_reasoning: t.reasoning,
      tier: t.tier,
      tier_rationale: t.tier === 3
        ? '>75 LOC and/or risk-forced (schema/feature keywords) per Work Item Routing — full SD'
        : '31-75 LOC, no risk keywords — standard QF',
      spec_mode: t.spec_mode,
      cluster: t.cluster,
      snapshot_created_at: v.created_at,
    };
  });

  // Completeness (both directions)
  const seen = new Set(rows.map(r => r.artifact_type + '|' + r.verdict_id));
  const expectedTypes = new Set(Object.keys(TRIAGE));
  const gotTypes = new Set(rows.map(r => r.artifact_type));
  const missingFromTable = [...expectedTypes].filter(x => !gotTypes.has(x));
  const unexpected = [...gotTypes].filter(x => !expectedTypes.has(x));
  if (rows.length !== 22 || missingFromTable.length || unexpected.length) {
    throw new Error(`SET-DIFFERENCE FAILURE: rows=${rows.length}, missing=${missingFromTable}, unexpected=${unexpected}`);
  }
  // Cluster coverage reconciliation (forward vs reverse mapping, TR-4)
  const clusterVerdictTypes = new Set(CLUSTERS.flatMap(c => c.verdicts));
  const uncovered = [...expectedTypes].filter(x => !clusterVerdictTypes.has(x));
  if (uncovered.length) throw new Error('CLUSTER COVERAGE GAP: ' + uncovered.join(','));
  return rows;
}

// ── Spec lint (FR-3 / TS-2) ──────────────────────────────────────────────────
function lintClusters(table) {
  const problems = [];
  for (const c of CLUSTERS) {
    if (!c.spec.remediation) problems.push(c.id + ': no remediation');
    if (!c.spec.acceptance_miss || !c.spec.acceptance_pass) problems.push(c.id + ': acceptance not both-directions');
    if (!Array.isArray(c.spec.targets) || !c.spec.targets.length) problems.push(c.id + ': no targets');
    for (const t of c.spec.targets) {
      if (!t.verified && !t.discovery) problems.push(c.id + ': unverified target without discovery step: ' + t.path);
    }
    const ids = table.filter(r => c.verdicts.includes(r.artifact_type)).map(r => r.verdict_id);
    if (ids.length !== c.verdicts.length) problems.push(c.id + ': verdict id resolution mismatch');
    c.resolved_verdict_ids = ids;
  }
  if (problems.length) throw new Error('SPEC LINT: ' + problems.join(' | '));
}

// ── Renderers + writers ───────────────────────────────────────────────────────
function renderDoc(table) {
  const lines = [];
  lines.push('# MarketLens Remediation Triage Pack');
  lines.push('');
  lines.push('> Source: `' + SOURCE_SD + '` · venture `' + VENTURE_ID + '` · generated ' + new Date().toISOString());
  lines.push('> DB-first truth: `strategic_directives_v2.metadata.triage_pack` on the source SD. This file is the render.');
  lines.push('');
  lines.push('**Chairman context**: walkthrough #1 SEND-BACK (unstyled landing, thin trust surface). Both CONFIRMED by inspection (zero CSS repo-wide; no pricing/about/privacy/terms/footer). Neither is a verdict row — they enter as chairman-anchored clusters CL-1/CL-2 and gate re-review via the precheck below.');
  lines.push('');
  lines.push('**' + SYSTEM_FINDING + '**');
  lines.push('');
  lines.push('**' + J2A + '**');
  lines.push('');
  lines.push('## Triage table (22 verdicts)');
  lines.push('');
  lines.push('| Verdict | Artifact | Disp. | Gating | Tier | Cluster | Mode | Why |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of table) {
    lines.push('| `' + r.verdict_id.slice(0, 8) + '` | ' + r.artifact_type + ' | ' + r.disposition + ' | '
      + (r.gating === 'RE_REVIEW_GATING' ? '**GATING**' : 'post-review') + ' | ' + r.tier + ' | ' + r.cluster
      + ' | ' + r.spec_mode + ' | ' + r.gating_reasoning.replace(/\|/g, '/') + ' |');
  }
  lines.push('');
  lines.push('## Clusters (build order)');
  for (const c of CLUSTERS) {
    lines.push('');
    lines.push('### ' + c.id + ' — ' + c.title + (c.gating ? ' 🔒 GATING' : ''));
    lines.push('- Kind: ' + c.kind.toUpperCase() + ' (tier ' + c.tier + ', ~' + c.estimated_loc + ' LOC) · verdicts: ' + c.verdicts.join(', '));
    lines.push('- **Remediation**: ' + c.spec.remediation);
    lines.push('- **Acceptance (miss direction)**: ' + c.spec.acceptance_miss);
    lines.push('- **Acceptance (pass direction)**: ' + c.spec.acceptance_pass);
    lines.push('- **Targets**: ' + c.spec.targets.map(t => t.path + (t.verified ? ' ✓' : ' (target_unverified — ' + t.discovery + ')')).join('; '));
    lines.push('- ' + DEVIATION_VALVE);
  }
  lines.push('');
  lines.push('## Walkthrough-#2 machine precheck (the coordinator arms this; chairman re-invite requires all green)');
  lines.push('');
  lines.push('| # | Check | Executable form | Pass condition | Status |');
  lines.push('|---|---|---|---|---|');
  for (const p of PRECHECK) {
    lines.push('| ' + p.id + ' | ' + p.description.replace(/\|/g, '/') + ' | `' + p.executable_form.replace(/\|/g, '/') + '` | ' + p.pass_condition + ' | ' + p.status + (p.missing_harness ? ' — ' + p.missing_harness.replace(/\|/g, '/') : '') + ' |');
  }
  lines.push('');
  return lines.join('\n');
}

async function persistPack(table) {
  const { data: sdRow, error } = await sb.from('strategic_directives_v2')
    .select('id, metadata').eq('sd_key', SOURCE_SD).maybeSingle();
  if (error || !sdRow) throw new Error('source SD read failed: ' + (error?.message || 'not found'));
  const pack = {
    generated_at: new Date().toISOString(),
    source_snapshot_created_at: table[0]?.snapshot_created_at || null,
    venture_id: VENTURE_ID,
    system_finding: SYSTEM_FINDING,
    j2a_settlement: J2A,
    table,
    clusters: CLUSTERS.map(c => ({ ...c, spec: { ...c.spec }, resolved_verdict_ids: c.resolved_verdict_ids })),
    precheck: PRECHECK,
  };
  const { error: upErr } = await sb.from('strategic_directives_v2')
    .update({ metadata: { ...sdRow.metadata, triage_pack: pack } })
    .eq('id', sdRow.id);
  if (upErr) throw new Error('triage_pack persist failed: ' + upErr.message);
  return sdRow.id;
}

function qfId() {
  const now = new Date();
  const r = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `QF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${r}`;
}

async function createClusterRows(table) {
  const created = [];
  for (const c of CLUSTERS) {
    // Idempotency guard: skip clusters whose row already exists (re-run safety —
    // createSD would otherwise auto-increment the key and create a duplicate).
    if (c.kind === 'sd') {
      const { data: existing } = await sb.from('strategic_directives_v2')
        .select('sd_key').eq('metadata->remediation_pack->>cluster_id', c.id)
        .eq('metadata->remediation_pack->>source_sd', SOURCE_SD).limit(1);
      if (existing && existing.length) {
        created.push({ cluster: c.id, kind: 'sd', key: existing[0].sd_key, existed: true });
        continue;
      }
    } else {
      const { data: existing } = await sb.from('quick_fixes')
        .select('id').ilike('description', '%"cluster_id":"' + c.id + '"%').limit(1);
      if (existing && existing.length) {
        created.push({ cluster: c.id, kind: 'qf', key: existing[0].id, existed: true });
        continue;
      }
    }
    const packMeta = {
      remediation_pack: {
        source_sd: SOURCE_SD, venture_id: VENTURE_ID, cluster_id: c.id, order: c.order,
        gating: c.gating, verdict_ids: c.resolved_verdict_ids, spec: c.spec,
        deviation_valve: DEVIATION_VALVE, j2a: J2A,
      },
      co_author_pending: true,
    };
    if (c.kind === 'sd') {
      const sdKey = `SD-VENTURE-MARKETLENS-${c.id.replace('CL-', 'REMED-')}-001`;
      const sd = await createSD({
        sdKey,
        title: c.title,
        description: c.spec.remediation + '\n\nAcceptance (miss): ' + c.spec.acceptance_miss + '\n\nAcceptance (pass): ' + c.spec.acceptance_pass + '\n\n' + DEVIATION_VALVE,
        type: 'feature',
        priority: c.gating ? 'critical' : 'high',
        rationale: 'MarketLens remediation cluster ' + c.id + ' from ' + SOURCE_SD + ' (chairman SEND-BACK walkthrough #1). ' + J2A,
        scope: 'Targets: ' + c.spec.targets.map(t => t.path + (t.verified ? '' : ' [target_unverified: ' + t.discovery + ']')).join('; ') + '. Venture repo: ' + VENTURE_REPO,
        metadata: packMeta,
        target_application: 'MarketLens',
        success_criteria: [
          { criterion: 'Miss direction closed', measure: c.spec.acceptance_miss },
          { criterion: 'Pass direction intact', measure: c.spec.acceptance_pass },
        ],
      });
      created.push({ cluster: c.id, kind: 'sd', key: sd.sd_key || sdKey });
    } else {
      const id = qfId();
      // quick_fixes has NO metadata column — the pack linkage rides the description
      // as a JSON trailer (queryable via ilike on "cluster_id").
      const packTrailer = JSON.stringify({
        source_sd: SOURCE_SD, venture_id: VENTURE_ID, cluster_id: c.id,
        gating: c.gating, verdict_ids: c.resolved_verdict_ids, co_author_pending: true,
      });
      const { error } = await sb.from('quick_fixes').insert({
        id,
        title: c.title,
        type: 'bug',
        severity: c.gating ? 'high' : 'medium',
        description: c.spec.remediation + '\n\nAcceptance (miss): ' + c.spec.acceptance_miss + '\nAcceptance (pass): ' + c.spec.acceptance_pass + '\nTargets: ' + c.spec.targets.map(t => t.path).join('; ') + '\n\n' + DEVIATION_VALVE + '\n\nremediation_pack: ' + packTrailer,
        // CL-7's work is EHG_Engineer-side (deviation records via an engine-side script) —
        // the QF lane's CHECK only admits EHG/EHG_Engineer, and that is genuinely correct here.
        target_application: 'EHG_Engineer',
        estimated_loc: c.estimated_loc,
        status: 'open',
        routing_tier: c.tier,
        created_at: new Date().toISOString(),
      });
      if (error) throw new Error(c.id + ' QF insert failed: ' + error.message);
      created.push({ cluster: c.id, kind: 'qf', key: id });
    }
  }
  return created;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const table = await buildTable();
  lintClusters(table);
  console.log('✓ 22/22 verdicts triaged (set-difference clean, both directions)');
  console.log('✓ spec lint clean: 7 clusters, coverage reconciled');
  console.log('  gating rows:', table.filter(r => r.gating === 'RE_REVIEW_GATING').length,
    '| post-review:', table.filter(r => r.gating === 'POST_REVIEW_ACCEPTABLE').length);

  const doc = renderDoc(table);
  const docPath = path.join(REPO_ROOT, 'docs', 'ventures', 'marketlens-remediation-triage-pack.md');

  if (!EXECUTE) {
    console.log('\nDRY RUN (pass --execute to write). Doc preview first 40 lines:\n');
    console.log(doc.split('\n').slice(0, 40).join('\n'));
    return;
  }

  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, doc);
  console.log('✓ doc written:', docPath);

  await persistPack(table);
  console.log('✓ metadata.triage_pack persisted on', SOURCE_SD);

  const created = await createClusterRows(table);
  console.log('✓ cluster rows created:');
  created.forEach(r => console.log('   ', r.cluster, '→', r.kind.toUpperCase(), r.key));

  // Reverse-mapping verification (TR-4): every verdict id appears in exactly one created row
  const allIds = CLUSTERS.flatMap(c => c.resolved_verdict_ids);
  if (new Set(allIds).size !== 22 || allIds.length !== 22) throw new Error('REVERSE MAPPING FAILURE: ' + allIds.length);
  console.log('✓ forward/reverse verdict mapping reconciled (22/22, no overlap)');
})();
