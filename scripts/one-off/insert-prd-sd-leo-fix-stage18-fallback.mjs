#!/usr/bin/env node
/**
 * One-off: insert PRD for SD-LEO-FIX-STAGE18-SILENT-FALLBACK-001
 *
 * Background: add-prd-to-database.js ran in INLINE mode and emitted the
 * generation prompt without inserting a row. This script materializes the
 * PRD informed by the validation-agent + risk-agent evidence rows and the
 * exploration_summary written at LEAD.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '42c60c0c-4156-428f-ab19-9f8bad01d271';
const SD_KEY = 'SD-LEO-FIX-STAGE18-SILENT-FALLBACK-001';
const PRD_ID = 'PRD-' + SD_KEY;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const functional_requirements = [
  {
    id: 'FR-1',
    priority: 'CRITICAL',
    description: 'analyzeStage18MarketingCopy currently returns top-level llmFallbackCount (0|1) only. To support per-row fallback flagging, the analyzer must mark each section in copyOutput when it came from buildFallbackCopy(). Without per-section marking, storeMarketingArtifacts cannot tag individual venture_artifacts rows correctly when partial fallback is added later.',
    requirement: 'analyzer exposes per-section fallback marker',
    acceptance_criteria: [
      'AC-1: When LLM throws or returns invalid structure, every section in copyOutput carries an explicit fallback indicator (e.g., section._isFallback=true on each of the 9 COPY_SECTIONS)',
      'AC-2: When LLM succeeds, sections do NOT carry the marker (or carry it as false)',
      'AC-3: result.metadata still contains the existing llmFallbackCount=0|1 batch-level signal — no breaking change',
      'AC-4: Vitest covers both branches — buildFallbackCopy adds markers; valid LLM JSON does not'
    ]
  },
  {
    id: 'FR-2',
    priority: 'CRITICAL',
    description: 'storeMarketingArtifacts in server/routes/stage18.js writes 9 venture_artifacts rows from copyResult but never propagates fallback origin. The /:ventureId/regenerate/:section path also drops the signal. Both write paths must set venture_artifacts.metadata.is_fallback so downstream consumers can detect fallback origin without text-pattern parsing.',
    requirement: 'persistence writes metadata.is_fallback on both /generate-copy and /regenerate/:section paths',
    acceptance_criteria: [
      'AC-1: storeMarketingArtifacts insert payload includes metadata: { is_fallback: <per-section flag from FR-1> } for each row',
      'AC-2: /:ventureId/regenerate/:section insert payload includes metadata.is_fallback for the regenerated section',
      'AC-3: When a section is real-LLM, metadata.is_fallback is false (explicit, not omitted) so frontend can rely on the field existing',
      'AC-4: Vitest unit covers both routes — fallback path writes is_fallback=true; success path writes is_fallback=false'
    ]
  },
  {
    id: 'FR-3',
    priority: 'CRITICAL',
    description: 'Stage18MarketingCopy.tsx currently renders <Badge>{hasContent ? "Generated" : "Pending"}</Badge> at lines 527-529 — a binary badge with no fallback signal. Replace with three-state rendering using the existing amber-token alert pattern (lines 422-426) for the fallback case. NOTE: SD plan mentioned a per-section "Approve" button — no such control exists in current UI; only the Regenerate button (lines 539-547). PRD scope corrects to the actual UI surface.',
    requirement: 'frontend reads metadata.is_fallback per section and renders amber Fallback pill plus inline section warning',
    acceptance_criteria: [
      'AC-1: Frontend query loads metadata.is_fallback alongside artifact_data for each marketing_* row of the current venture',
      'AC-2: When section.metadata.is_fallback === true, badge renders with amber tokens (border-amber-500/50 bg-amber-500/10 text-amber-700) and label "Fallback" — reuse existing tokens from lines 422-426, do not introduce a new component',
      'AC-3: When metadata.is_fallback is false or null, badge renders the existing default "Generated" variant (no regression)',
      'AC-4: Section card surfaces a one-line inline warning beneath the title: "LLM was unavailable — click Regenerate to retry."',
      'AC-5: data-testid="stage18-fallback-badge-{section}" added so smoke tests can assert presence/absence'
    ]
  },
  {
    id: 'FR-4',
    priority: 'HIGH',
    description: 'The venture-level PROMOTION GATE at lines 410-417 (rendered via GateOverlay) currently allows promotion regardless of section provenance. Operator could promote a venture whose marketing copy is entirely fallback. PROMOTION GATE button must be disabled (or its decision normalized to a non-approving state) when ANY current marketing_* row has metadata.is_fallback=true. Tooltip explains the gating reason.',
    requirement: 'venture-level Promote disables when any current section has metadata.is_fallback=true; tooltip explains',
    acceptance_criteria: [
      'AC-1: Boolean derived: anyFallback = sections.some(s => s.metadata?.is_fallback === true)',
      'AC-2: When anyFallback is true, the Promote button surface is disabled or the gate decision UI shows a blocking state',
      'AC-3: Tooltip on the disabled control reads: "Regenerate fallback sections before promoting." (matches risk-agent recommendation a629fd46-...)',
      'AC-4: After regenerating all 9 sections successfully, anyFallback flips to false and Promote re-enables — verified by Vitest unit'
    ]
  },
  {
    id: 'FR-5',
    priority: 'HIGH',
    description: 'PrivacyPatrol AI venture (venture_id=08d20036-03c9-4a26-bbc5-f37a18dfdf23) has 9 existing marketing_* rows, all is_current=true, all containing the literal "[Fallback —" substring in artifact_data and persona_target="our target user". These predate this fix. Backfill MUST be scoped to that single venture (per VALIDATION warning W2 — NOT a blanket UPDATE) so the fix is observable on the originating venture without touching unrelated marketing rows that may legitimately mention the word "fallback" elsewhere.',
    requirement: 'one-off backfill migration sets metadata.is_fallback=true on the 9 existing PrivacyPatrol AI rows in a single transaction with audit log',
    acceptance_criteria: [
      'AC-1: Migration is a Node script (not a SQL migration) so it can run via the database-agent and be re-runnable safely (idempotent)',
      "AC-2: Migration is scoped: WHERE venture_id = 08d20036-03c9-4a26-bbc5-f37a18dfdf23 AND artifact_type LIKE 'marketing_%' AND is_current = true",
      'AC-3: Migration writes a single audit_log row with row_count=9 and execution context (script name, sd_key, timestamp)',
      'AC-4: After migration, frontend renders amber Fallback pill on all 9 sections of the PrivacyPatrol AI venture without any code being deployed (validates FR-3 against existing data)'
    ]
  },
  {
    id: 'FR-6',
    priority: 'MEDIUM',
    description: 'The check used by PROMOTION GATE for fallback presence (FR-4 AC-1) MUST rely on canonical metadata.is_fallback rather than text-substring detection of "[Fallback —" in artifact_data. Text-substring is a defense-in-depth ONLY for the backfill script (FR-5), not for runtime. This addresses risk-agent concern about false positives on legitimate copy that may use the word "fallback".',
    requirement: 'runtime fallback detection uses metadata.is_fallback exclusively, not text matching',
    acceptance_criteria: [
      'AC-1: Codebase grep confirms no /\\[Fallback —/ regex or substring check at runtime in Stage18MarketingCopy.tsx',
      'AC-2: Backfill script (FR-5) is the only place text-pattern matching is permitted; comment in script explains why (one-time cleanup of pre-fix rows)',
      'AC-3: After fix is deployed, all NEW rows rely solely on metadata.is_fallback for downstream gating'
    ]
  }
];

const technical_requirements = [
  {
    id: 'TR-1',
    requirement: 'Backend writes use additive jsonb merge — never overwrite existing metadata keys',
    rationale: 'venture_artifacts.metadata may carry other keys in future. Use { ...existingMetadata, is_fallback } pattern in inserts (insert is fresh, but the principle applies if any update path exists).'
  },
  {
    id: 'TR-2',
    requirement: 'Frontend type definition for marketing artifact row extends to include metadata.is_fallback?: boolean',
    rationale: 'Stage18MarketingCopy.tsx uses CopySectionData type. Either extend that type or add a sibling type for the persisted row shape so TypeScript prevents missed-read regressions.'
  },
  {
    id: 'TR-3',
    requirement: 'Backend-first deploy ordering — ship server/routes/stage18.js + analyzer changes before the EHG frontend Stage18MarketingCopy.tsx changes',
    rationale: 'Forward-compat: backend writes is_fallback into rows that pre-update UI ignores; frontend update later picks them up. Reverse ordering causes UI to expect a field that does not yet exist (still safe — falsy default — but suboptimal). Per risk-agent a629fd46 recommendation.'
  },
  {
    id: 'TR-4',
    requirement: 'Per-section marker in analyzer must NOT include the literal "_isFallback" string in any persisted artifact_data field — keep it in section.metadata or strip before persistence',
    rationale: 'artifact_data is rendered to humans (operator). A leaking "_isFallback":true would be visible noise. Recommend: storeMarketingArtifacts reads the marker from a shape like copyResult.__sectionFlags[section] = { is_fallback }, NOT inlined into copyResult[section].'
  }
];

const test_scenarios = [
  {
    id: 'TS-1',
    scenario: 'Analyzer emits per-section fallback flag when LLM throws',
    given: 'analyzeStage18MarketingCopy called with stub LLM client that throws',
    when: 'Function returns',
    then: 'Returned object contains per-section fallback indicator on all 9 COPY_SECTIONS; result.metadata.llmFallbackCount === 1',
    test_type: 'unit'
  },
  {
    id: 'TS-2',
    scenario: 'Analyzer does NOT emit fallback flag when LLM succeeds',
    given: 'Stub LLM client returns valid JSON with all 9 sections',
    when: 'Function returns',
    then: 'No section carries the fallback marker; result.metadata.llmFallbackCount === 0',
    test_type: 'unit'
  },
  {
    id: 'TS-3',
    scenario: 'storeMarketingArtifacts writes is_fallback=true for fallback rows',
    given: 'Mock supabase, copyResult with per-section fallback markers from buildFallbackCopy',
    when: 'storeMarketingArtifacts runs',
    then: 'Each of 9 inserted rows includes metadata.is_fallback=true; mark-old-as-not-current pattern preserved',
    test_type: 'unit'
  },
  {
    id: 'TS-4',
    scenario: 'storeMarketingArtifacts writes is_fallback=false for real-LLM rows',
    given: 'Mock supabase, copyResult from valid LLM response',
    when: 'storeMarketingArtifacts runs',
    then: 'Each of 9 inserted rows includes metadata.is_fallback=false (explicit, not undefined)',
    test_type: 'unit'
  },
  {
    id: 'TS-5',
    scenario: 'Regenerate route also writes metadata.is_fallback',
    given: 'POST /:ventureId/regenerate/:section with stub LLM that throws',
    when: 'Handler responds',
    then: 'Inserted row has metadata.is_fallback=true; existing mark-not-current pattern preserved',
    test_type: 'integration'
  },
  {
    id: 'TS-6',
    scenario: 'Frontend renders amber Fallback badge for is_fallback=true sections',
    given: 'Stage18MarketingCopy mounted with mocked artifacts where one section has metadata.is_fallback=true',
    when: 'Component renders',
    then: 'data-testid="stage18-fallback-badge-tagline" present with class containing "border-amber-500/50"; default "Generated" badge absent for that section',
    test_type: 'component'
  },
  {
    id: 'TS-7',
    scenario: 'Frontend renders default Generated badge for is_fallback=false sections',
    given: 'Stage18MarketingCopy mounted with all artifacts metadata.is_fallback=false',
    when: 'Component renders',
    then: 'No fallback badge present; existing "Generated" badge rendered (regression guard)',
    test_type: 'component'
  },
  {
    id: 'TS-8',
    scenario: 'Promote button disabled when any section is fallback',
    given: '8 sections is_fallback=false, 1 section is_fallback=true',
    when: 'Promote control rendered',
    then: 'Promote disabled state asserted; tooltip text contains "Regenerate fallback sections"',
    test_type: 'component'
  },
  {
    id: 'TS-9',
    scenario: 'Backfill migration is idempotent and scoped',
    given: 'PrivacyPatrol AI venture has 9 marketing_* rows with metadata IS NULL',
    when: 'Backfill script runs twice',
    then: 'Both runs succeed; row count 9 each time; no other ventures touched (SELECT count from venture_artifacts WHERE artifact_type LIKE marketing_% AND venture_id != 08d20036 returns same value before and after)',
    test_type: 'integration'
  },
  {
    id: 'TS-10',
    scenario: '30-second smoke (manual UAT)',
    given: 'Pre-existing PrivacyPatrol AI venture (08d20036) loaded after backfill+frontend deploy',
    when: 'Operator opens Stage 18',
    then: 'All 9 section cards display amber Fallback pill; Promote button disabled with tooltip; click Regenerate on one section, on success that pill clears; after regenerating all 9 Promote enables',
    test_type: 'smoke'
  }
];

const acceptance_criteria = [
  'Analyzer exposes per-section fallback marker on fallback path; not present on success path (FR-1)',
  'Both /generate-copy and /regenerate/:section persistence paths write metadata.is_fallback (FR-2)',
  'Stage18MarketingCopy renders amber Fallback pill (with existing amber tokens) when metadata.is_fallback=true; no regression of default Generated pill (FR-3)',
  'Venture-level Promote disables when any current section is fallback; tooltip explains (FR-4)',
  'Backfill migration scoped to venture_id=08d20036 only; idempotent; audit log row written (FR-5)',
  'Runtime detection uses metadata.is_fallback exclusively — no text-substring matching at render time (FR-6)',
  'PrivacyPatrol AI venture demos correctly post-deploy: amber pills on all 9 sections, Promote disabled, regenerate clears pill (Q9 demo)',
  'All Vitest unit + component tests pass (TS-1 through TS-9); zero regressions on existing Stage18 tests',
  'Branch ≤100 LOC src target (likely 80-100 src + 100-150 tests + 30-50 backfill); cross-repo PRs (EHG_Engineer + EHG)'
];

const risks = [
  {
    risk: 'False-positive fallback detection in backfill — text "[Fallback —" could legitimately appear in real LLM copy (rare but possible if a venture themed around fallback systems)',
    impact: 'LOW',
    mitigation: 'Backfill is scoped to ONE venture_id (08d20036). Risk applies only if that venture happens to use the word fallback in real copy — manually inspected, it does not. Future runs of backfill on other ventures are explicitly out of scope.',
    probability: 'LOW',
    rollback_plan: "UPDATE venture_artifacts SET metadata = metadata - 'is_fallback' WHERE venture_id = 08d20036 AND artifact_type LIKE marketing_%. Single revert query."
  },
  {
    risk: 'Cross-repo deploy ordering desync — frontend ships first, reads is_fallback before backend writes it',
    impact: 'LOW',
    mitigation: 'Frontend default-renders Generated pill when is_fallback is undefined or false (FR-3 AC-3). Old behavior preserved during desync window. Per TR-3, deploy backend first as defense in depth.',
    probability: 'MEDIUM',
    rollback_plan: 'Frontend revert is single-PR; backend revert is single-PR. Both safe.'
  },
  {
    risk: 'Operator surprise — Promote suddenly disabled on a venture they expected to ship',
    impact: 'MEDIUM',
    mitigation: 'Tooltip explicitly states the reason and remediation ("Regenerate fallback sections before promoting"). Per FR-4 AC-3. Q9 smoke covers the regenerate-and-unblock flow end-to-end.',
    probability: 'MEDIUM',
    rollback_plan: 'Feature flag is_fallback gating behind a frontend flag if needed; revert removes the gate while preserving the badge for awareness.'
  }
];

const system_architecture = {
  components: [
    'EHG_Engineer/lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js — analyzer, adds per-section fallback marker on fallback branches',
    'EHG_Engineer/server/routes/stage18.js — storeMarketingArtifacts + regenerate handler write metadata.is_fallback on insert',
    'ehg/src/components/stages/Stage18MarketingCopy.tsx — reads metadata.is_fallback per section; renders amber Fallback pill; gates Promote',
    'EHG_Engineer/scripts/migrations/<date>-backfill-stage18-fallback-metadata.mjs — one-off, scoped, idempotent backfill for PrivacyPatrol AI venture'
  ],
  data_flow: 'LLM call (or fallback) → analyzer marks per-section flag → storeMarketingArtifacts persists with metadata.is_fallback → Stage18MarketingCopy renders badge + gates Promote → operator clicks Regenerate → POST /regenerate/:section runs analyzer again → if success, new row metadata.is_fallback=false → UI re-fetches → pill clears',
  observability: 'audit_log row from backfill provides one-time count. Per-row metadata.is_fallback queryable via Supabase for ongoing monitoring. Existing console.error logs in analyzer (lines 264, 290) flag LLM errors at run time.'
};

const ui_ux_requirements = {
  badge: 'Amber Fallback pill replaces default Generated pill when section.metadata.is_fallback=true. Reuse existing tokens from lines 422-426 of Stage18MarketingCopy.tsx. Do NOT introduce a new shadcn/ui Badge variant.',
  inline_warning: 'One-line text beneath section card title when fallback: "LLM was unavailable — click Regenerate to retry." (no exclamation, no emoji)',
  promote_gate: 'Existing Promote control disabled when any section.metadata.is_fallback=true. Tooltip on disabled state: "Regenerate fallback sections before promoting." Use existing Tooltip primitive (already imported in Stage18MarketingCopy.tsx).',
  accessibility: 'aria-label="Fallback content from LLM unavailability" on the amber pill. Disabled Promote retains aria-disabled="true". Color is NOT the only signal — text label "Fallback" + tooltip explanation provide non-color affordance.'
};

const implementation_approach = `1. Backend (EHG_Engineer worktree):
   - stage-18-marketing-copy.js: add per-section fallback flag in buildFallbackCopy output (e.g., wrap each section with { ...sectionData, _isFallback: true } OR keep parallel __sectionFlags map). Prefer the parallel map per TR-4 to avoid leaking _isFallback into operator-visible artifact_data.
   - server/routes/stage18.js: storeMarketingArtifacts reads the parallel map and writes metadata: { is_fallback: <bool> } per insert; regenerate handler does same for the single section.
   - Vitest unit covering both branches (LLM success + LLM throw) for both routes.

2. Frontend (EHG repo):
   - Stage18MarketingCopy.tsx: extend type for marketing artifact row to include metadata.is_fallback?. In the section-card render block (lines 506-557), conditionally render amber Fallback pill OR default Generated pill. Add inline warning beneath title when fallback. Compute anyFallback boolean at top of component and feed into Promote gate.
   - Vitest component tests via @testing-library/react.

3. Backfill (EHG_Engineer worktree):
   - scripts/migrations/<YYYYMMDD>-backfill-stage18-fallback-metadata.mjs.
   - Idempotent SELECT-then-UPDATE scoped to venture_id=08d20036. Writes one audit_log row.
   - Documented as one-time; not added to migration runner.

4. Order of PRs (per TR-3 backend-first):
   - PR 1: Backend (analyzer + stage18.js + tests) — EHG_Engineer
   - PR 2: Backfill migration — EHG_Engineer (run once after PR 1 ships)
   - PR 3: Frontend — EHG repo

   Each PR ≤100 LOC src target, max 200 LOC inc tests.`;

const prd_row = {
  id: PRD_ID,
  directive_id: SD_KEY, // varchar reference per memory
  sd_id: SD_UUID,
  title: 'Stage18 silent fallback persistence — surface fallback state to UI',
  version: '1.0.0',
  status: 'approved',
  category: 'bugfix',
  priority: 'medium',
  executive_summary: 'Fix a silent failure mode where Gemini-timeout fallback marketing copy persists to venture_artifacts indistinguishable from real LLM output. Add metadata.is_fallback at write time (analyzer + 2 backend write paths), surface as amber pill in Stage18MarketingCopy.tsx, gate venture-level Promote when any section is fallback, and backfill the 9 existing PrivacyPatrol AI rows. Cross-repo (EHG_Engineer + EHG), backend-first deploy.',
  business_context: 'Operator running PrivacyPatrol AI venture on 2026-05-03 was shown 9 marketing artifacts marked "Generated" with no signal that all 9 came from the fallback path after a Gemini 3-attempt TIMEOUT. Without this fix, ANY LLM unavailability produces shippable-looking-but-placeholder marketing copy — the venture promotion path could push fallback text to production.',
  technical_context: 'Backend already tracks llmFallbackCount at the analyzer batch level (stage-18-marketing-copy.js:248-267) but storeMarketingArtifacts (server/routes/stage18.js:55-85) does not propagate it. Frontend renders <Badge>{hasContent ? "Generated" : "Pending"}</Badge> at lines 527-529 — no fallback awareness. Per LEAD exploration, the SD plan referenced a per-section "Approve" button that does not exist; PRD scope corrects to actual UI surface (per-section Regenerate already exists; Promote is venture-level).',
  functional_requirements,
  technical_requirements,
  system_architecture,
  ui_ux_requirements,
  implementation_approach,
  test_scenarios,
  acceptance_criteria,
  risks,
  exploration_summary: 'See SD.exploration_summary for the 6-file deep dive. Validation evidence: 9437fdb4-... (sub_agent_execution_results, PASS-with-CONCERNS). Risk evidence: a629fd46-... (CONCERNS, two warnings encoded into FR-4 and FR-6). Scope correction logged in exploration: SD plan FR-3/FR-4 had per-section Approve which does not exist; PRD aligns to the venture-level Promote gate that does exist.',
  metadata: {
    sd_uuid: SD_UUID,
    sd_key: SD_KEY,
    plan_phase_evidence: ['9437fdb4-dfc2-4693-a7cc-7449802e7c88', 'a629fd46-d306-4c23-8e05-384e71f7d466'],
    cross_repo: ['EHG_Engineer', 'ehg'],
    deploy_order: 'backend-first',
    estimated_loc: { src: '80-100', tests: '100-150', backfill: '30-50' },
    pr_plan: 3,
    venture_id_in_scope_for_backfill: '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
  }
};

async function main() {
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd_row)
    .select('id, sd_id, status, version')
    .single();

  if (error) {
    console.error('PRD insert failed:', error.message);
    console.error('details:', error);
    process.exit(1);
  }
  return data;
}

const data = await main();

console.log('PRD inserted:', JSON.stringify(data, null, 2));
console.log('FR count:', functional_requirements.length);
console.log('TR count:', technical_requirements.length);
console.log('TS count:', test_scenarios.length);
console.log('AC count:', acceptance_criteria.length);
console.log('Risk count:', risks.length);
