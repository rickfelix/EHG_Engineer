#!/usr/bin/env node
/**
 * Insert PRD row for SD-LEO-FEAT-S20-VERDICT-BLOCK-UI-001
 * INLINE_LLM_MODE flow — add-prd-to-database.js printed the prompt and exited.
 */
import { createDatabaseClient } from '../lib/supabase-connection.js';

const PRD_ID = 'PRD-SD-LEO-FEAT-S20-VERDICT-BLOCK-UI-001';
const SD_ID = 'SD-LEO-FEAT-S20-VERDICT-BLOCK-UI-001';
const TITLE = 'Stage 20 Code Quality Gate — EHG-side Verdict-Block UI + Advance Refusal';

const functional_requirements = [
  {
    id: 'FR-1',
    requirement: 'Stage20VerdictPanel.tsx component renders code_quality_report verdict + venture_quality_findings',
    description: 'New React component at src/components/ventures/Stage20VerdictPanel.tsx. Mounts inside the Stage 20 venture detail surface (mirrors S19/S22 panel patterns). Reads latest code_quality_report row for the active venture (artifact_type=code_quality_report, stage_number=20) plus all venture_quality_findings rows for that report. Renders: (a) verdict badge (PASS/WARN/FAIL/BLOCKED) with distinct color + icon, (b) findings list grouped by severity with severity badges, (c) remediation SD links from code_quality_report.remediation_sd_ids if present, (d) loading + empty states. No quality logic in UI — pure render of backend state.',
    acceptance_criteria: [
      'Component file exists at src/components/ventures/Stage20VerdictPanel.tsx and is exported as default',
      'Component renders when latest code_quality_report row exists for the venture with stage_number=20',
      'Verdict badge uses 4 distinct visual treatments for PASS, WARN, FAIL, BLOCKED (color + icon, not color alone)',
      'Findings list groups by severity (critical, high, medium, low, info); each group shows count + items',
      'Remediation SD chips render only when code_quality_report.remediation_sd_ids array is non-empty; each chip links to the SD detail page',
      'Loading state renders while query in flight; empty state renders when no code_quality_report row exists with copy explaining S20 analyzer has not run yet'
    ]
  },
  {
    id: 'FR-2',
    requirement: 'advanceStage refuses S20→S21 transition when verdict=FAIL + (high|critical) findings AND flag ON',
    description: 'src/lib/ventures/advanceStage.ts gains a pre-RPC verdict-read guard. Before invoking advance_venture_stage RPC for a S20→S21 transition, the function reads the latest code_quality_report verdict for the venture+stage_number=20. When LEO_S20_VERDICT_BLOCK_ENABLED=true AND verdict=FAIL AND at least one finding has severity in (high, critical): refuse the advance, do NOT invoke the RPC, return a structured refusal { ok:false, reason:"S20_QUALITY_BLOCK", verdict, findings_summary }. When verdict=BLOCKED (precondition): refuse with reason="S20_PRECONDITION_BLOCK" routing operator to S19, regardless of flag state. Otherwise: invoke the RPC normally.',
    acceptance_criteria: [
      'advanceStage.ts reads latest code_quality_report row for (venture_id, stage_number=20) BEFORE invoking advance_venture_stage RPC',
      'When NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED is "true" AND verdict=FAIL AND any finding severity in (high,critical): function returns { ok:false, reason:"S20_QUALITY_BLOCK", verdict, findings_summary } without RPC call',
      'When verdict=BLOCKED (precondition state): function returns { ok:false, reason:"S20_PRECONDITION_BLOCK", verdict, return_to_stage:19 } regardless of flag state',
      'When flag OFF AND verdict=FAIL+high/critical: function logs warning to console + RPC proceeds (informational mode)',
      'When verdict=PASS or WARN OR no code_quality_report exists: RPC proceeds normally',
      'Vitest unit tests cover all 5 branches (FAIL+flagON refuse, BLOCKED refuse, FAIL+flagOFF info, PASS proceed, missing-row proceed)'
    ]
  },
  {
    id: 'FR-3',
    requirement: 'Manual override CTA writes audit_log row with full snapshot',
    description: 'When advanceStage returns S20_QUALITY_BLOCK refusal, the Stage20VerdictPanel exposes a "Manual override" CTA (button) that opens a modal requiring a non-empty reason text. On submit: (a) insert audit_log row with action="stage_advance_override", actor=auth.uid, reason=input text, verdict_snapshot=full code_quality_report row, venture_id, stage_number=20, attempted_transition="20->21", timestamp=NOW(); (b) re-invoke advanceStage with override flag set; (c) show success/error toast. CTA is hidden when verdict=BLOCKED (no override path for precondition state).',
    acceptance_criteria: [
      'Manual override button appears only when advance was just refused with reason=S20_QUALITY_BLOCK and verdict=FAIL',
      'Manual override button is hidden when verdict=BLOCKED (precondition); Return-to-S19 CTA renders instead',
      'Override modal requires non-empty reason text (submit disabled until reason >= 10 characters); modal has focus-trap and Esc-to-close',
      'On submit: audit_log INSERT runs FIRST and must succeed before advanceStage retry; failure surfaces as error toast and override does not proceed',
      'audit_log row contains action="stage_advance_override", actor (auth.uid), reason, verdict_snapshot (full code_quality_report row as JSONB), venture_id, stage_number=20, attempted_transition="20->21", created_at',
      'After successful override + advance, panel re-renders showing the venture has moved to S21'
    ]
  },
  {
    id: 'FR-4',
    requirement: 'useStagePolicy + useVentureArtifacts hooks surface stage 20 verdict',
    description: 'src/hooks/useStagePolicy.ts gains awareness of artifact_type=code_quality_report so stage 20 policy queries return the latest verdict. src/hooks/useVentureArtifacts.ts gains a derived selector `latestS20Verdict` returning { verdict, findings, remediation_sd_ids, fetched_at, is_loading }. Both hooks consume existing supabase query infra (no new RPC or fetch helper).',
    acceptance_criteria: [
      'useStagePolicy returns artifact_type=code_quality_report alongside existing artifact types when stage_number=20',
      'useVentureArtifacts exposes latestS20Verdict selector returning { verdict, findings, remediation_sd_ids, fetched_at, is_loading } shape',
      'Hook returns is_loading=true during initial fetch; is_loading=false after success or error',
      'When no code_quality_report exists: latestS20Verdict returns { verdict: null, findings: [], remediation_sd_ids: [], is_loading: false }',
      'Vitest tests with mocked supabase verify the hook shapes for: loading, success, empty, error states'
    ]
  },
  {
    id: 'FR-5',
    requirement: 'Feature flag wiring with default OFF + safe phased rollout',
    description: 'Introduce NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED environment variable. Read via existing config helper (or new minimal helper if absent) returning boolean (default false). Flag controls only the refusal behavior — verdict + findings always render in the panel regardless of flag state. Document rollout phases in code comment + PR description: Phase 1 ship UI flag OFF → Phase 2 enable on canary venture for 7d observation → Phase 3 portfolio-wide enable.',
    acceptance_criteria: [
      'Helper returns false when NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED is unset, "false", "0", "" or any non-true value',
      'Helper returns true only when NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED is exactly "true" (case-sensitive) per existing convention',
      'Stage20VerdictPanel renders verdict + findings unconditionally; only the override-UI flow + advance-refusal logic consult the flag',
      'README or CHANGELOG entry documents the flag default + phased rollout plan',
      'E2E test verifies: flag off + FAIL+critical → advance succeeds (informational); flag on + same → advance refused with override available'
    ]
  }
];

const acceptance_criteria = [
  { criterion: 'Stage20VerdictPanel renders code_quality_report verdict + findings + remediation SD links', measure: 'E2E: navigate to Stage 20 venture detail with seeded code_quality_report; verify panel + verdict badge + findings list + chip(s) all visible' },
  { criterion: 'advanceStage refuses S20→S21 when flag ON + verdict=FAIL + high/critical findings', measure: 'Vitest: mock supabase to return seed verdict; assert advanceStage returns { ok:false, reason:"S20_QUALITY_BLOCK" } without RPC call' },
  { criterion: 'Manual override writes audit_log row with full verdict snapshot', measure: 'Integration test (HAS_REAL_DB): submit override; SELECT audit_log row; verify schema match + verdict_snapshot is non-empty JSONB' },
  { criterion: 'verdict=BLOCKED hides override + shows Return-to-S19 CTA', measure: 'Component test with verdict=BLOCKED fixture: assert override button absent + Return-to-S19 button present + onClick navigates to /ventures/<id>/stages/19' },
  { criterion: 'Feature flag default OFF surfaces verdict informationally without enforcement', measure: 'E2E with flag unset: panel renders + advance succeeds despite FAIL verdict; no audit_log override row written' }
];

const test_scenarios = [
  {
    id: 'TS-1',
    name: 'Panel renders verdict + findings + remediation chips',
    type: 'integration',
    gating: 'Component test with mocked useVentureArtifacts',
    steps: [
      'Mock useVentureArtifacts to return latestS20Verdict={ verdict:"FAIL", findings:[{severity:"high",...},{severity:"critical",...}], remediation_sd_ids:["SD-X","SD-Y"], is_loading:false }',
      'Render Stage20VerdictPanel inside Stage 20 detail surface',
      'Assert: verdict badge shows "FAIL" with red treatment + icon; findings list groups show "Critical (1)" + "High (1)" headings; 2 remediation chips render with text "SD-X" and "SD-Y"'
    ],
    expected: 'All visual elements present; remediation chip onClick navigates to SD detail route'
  },
  {
    id: 'TS-2',
    name: 'advanceStage refusal: flag ON + FAIL + critical finding',
    type: 'unit',
    gating: 'Vitest with vi.mock supabase + process.env.NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED="true"',
    steps: [
      'Mock supabase select to return code_quality_report row with verdict="FAIL" and venture_quality_findings with one severity="critical"',
      'Spy on advance_venture_stage RPC',
      'Invoke advanceStage({ ventureId, fromStage:20, toStage:21 })'
    ],
    expected: 'Function returns { ok:false, reason:"S20_QUALITY_BLOCK", verdict:"FAIL", findings_summary:{critical:1,...} }; RPC spy was NOT called'
  },
  {
    id: 'TS-3',
    name: 'BLOCKED precondition refusal regardless of flag',
    type: 'unit',
    gating: 'Vitest, flag both ON and OFF (parameterized)',
    steps: [
      'Mock supabase to return code_quality_report row with verdict="BLOCKED"',
      'Invoke advanceStage with both NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED="true" and "false"'
    ],
    expected: 'Both invocations return { ok:false, reason:"S20_PRECONDITION_BLOCK", return_to_stage:19 }; RPC never invoked'
  },
  {
    id: 'TS-4',
    name: 'Manual override writes audit_log row then proceeds',
    type: 'integration',
    gating: 'HAS_REAL_DB sentinel-gated; seeds code_quality_report verdict=FAIL fixture',
    steps: [
      'Render panel with FAIL verdict + flag ON; click "Manual override" CTA',
      'Type reason "Risk accepted by chairman per ticket EVA-1234" (>=10 chars) in modal; submit',
      'Wait for advance to complete',
      'SELECT * FROM audit_log WHERE action=\'stage_advance_override\' AND venture_id=\'<test_venture>\' ORDER BY created_at DESC LIMIT 1',
      'SELECT current_stage FROM ventures WHERE id=\'<test_venture>\''
    ],
    expected: 'audit_log row exists with action=stage_advance_override, reason text matches, verdict_snapshot is non-empty JSONB containing the original code_quality_report row, actor is set to test user; venture current_stage advanced to 21'
  },
  {
    id: 'TS-5',
    name: 'Flag OFF: informational mode, no refusal, no override prompted',
    type: 'integration',
    gating: 'Playwright E2E with NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED unset',
    steps: [
      'Seed venture with code_quality_report verdict=FAIL + critical finding',
      'Navigate to Stage 20 detail page; click Advance to Stage 21',
      'SELECT current_stage FROM ventures + COUNT(*) FROM audit_log WHERE action=\'stage_advance_override\' AND venture_id=...'
    ],
    expected: 'Stage advances to 21; zero audit_log override rows; panel still renders verdict + findings (informational)'
  },
  {
    id: 'TS-6',
    name: 'Empty state when no code_quality_report exists',
    type: 'unit',
    gating: 'Component test with mocked useVentureArtifacts returning null verdict',
    steps: [
      'Mock latestS20Verdict={ verdict:null, findings:[], remediation_sd_ids:[], is_loading:false }',
      'Render Stage20VerdictPanel'
    ],
    expected: 'Empty-state copy renders explaining S20 analyzer has not produced findings yet; no error; no verdict badge; advance button still functional'
  }
];

const risks = [
  {
    risk: 'Analyzer produces FAIL verdicts that block legitimate advances (false positives)',
    severity: 'medium',
    mitigation: 'Feature flag default OFF + canary venture observation period before portfolio enable; manual override available with audit trail; analyzer rules can be tuned in parent SD if patterns emerge'
  },
  {
    risk: 'Manual override abused to silently bypass quality gates',
    severity: 'medium',
    mitigation: 'audit_log row mandatory before advance retries (ordering enforced in FR-3 acceptance); chairman dashboard surfaces overrides; reason field required with >= 10 char minimum'
  },
  {
    risk: 'BLOCKED verdict confuses operators (visually similar to FAIL)',
    severity: 'low',
    mitigation: 'Distinct visual treatment per FR-1 (color + icon + copy); explicit Return-to-S19 CTA replaces override button; component test asserts both treatments differ'
  },
  {
    risk: 'Component renders before backend produces code_quality_report row (race on first analyzer run)',
    severity: 'low',
    mitigation: 'Loading state during query; empty state with explanatory copy when no row exists; advance still functional from empty state (no quality data = no enforcement)'
  }
];

const technical_requirements = {
  language: 'TypeScript + React (existing EHG repo conventions)',
  dependencies_added: 'None — reuses existing supabase client, hooks pattern, design system components',
  observability: 'audit_log writes for every manual override; React Query devtools surface hook state; advance refusal returns structured reason for downstream telemetry',
  feature_flag: 'NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED via existing config helper, default false, only consulted by advance refusal logic (UI render is unconditional)',
  testing_framework: 'Vitest for unit + component tests; Playwright for E2E; audit_log integration test gated on HAS_REAL_DB sentinel',
  accessibility: 'Severity badges combine color + icon + text; override modal has focus-trap + keyboard navigation + Esc-to-close; chips are keyboard-focusable with aria-labels',
  backend_dependencies: 'code_quality_report + venture_quality_findings tables (shipped by parent SD-LEO-FEAT-STAGE-CODE-QUALITY-001); audit_log table (existing); advance_venture_stage RPC (existing)'
};

const system_architecture = `
## Components

1. **Stage20VerdictPanel.tsx** (NEW — FR-1)
   - Renders verdict badge + findings list + remediation chips + override CTA
   - Pure render of backend state; no quality logic
   - Mounts inside existing Stage 20 venture detail surface

2. **src/lib/ventures/advanceStage.ts** (MODIFIED — FR-2)
   - Pre-RPC guard reads latest code_quality_report verdict for S20→S21 transitions
   - Refuses on FAIL+critical/high (flag ON) or BLOCKED (always)
   - Returns structured refusal reason for UI consumption

3. **src/hooks/useStagePolicy.ts + useVentureArtifacts.ts** (MODIFIED — FR-4)
   - useStagePolicy: artifact_type=code_quality_report awareness for stage 20
   - useVentureArtifacts: latestS20Verdict derived selector
   - Both reuse existing supabase query infra

4. **Manual override modal + audit trail** (NEW — FR-3)
   - Modal component for reason input (focus-trap, validation)
   - audit_log INSERT precedes advance retry (ordering enforced)
   - verdict_snapshot captures full code_quality_report row at override time

5. **Feature flag helper** (NEW or REUSED — FR-5)
   - NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED, default false
   - Boolean accessor; case-sensitive "true" check

## Data flow (advance attempt)

\`\`\`
User clicks Advance to S21
  → advanceStage({ ventureId, fromStage:20, toStage:21 })
    → SELECT * FROM code_quality_report WHERE venture_id=? AND stage_number=20 ORDER BY created_at DESC LIMIT 1
      → if verdict=BLOCKED: return { ok:false, reason:"S20_PRECONDITION_BLOCK", return_to_stage:19 }
      → if NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED="true" AND verdict=FAIL AND has high|critical finding:
          return { ok:false, reason:"S20_QUALITY_BLOCK", verdict, findings_summary }
      → otherwise: invoke advance_venture_stage RPC normally
  → UI renders refusal banner (or success/navigate)
  → If S20_QUALITY_BLOCK: panel exposes Manual Override CTA
    → User clicks → modal opens → enters reason >=10 chars → submit
      → INSERT audit_log row (must succeed first)
      → re-invoke advanceStage with override flag
        → bypass verdict check; invoke RPC
      → toast success or error; re-render panel
  → If S20_PRECONDITION_BLOCK: panel exposes Return-to-S19 CTA (no override path)
\`\`\`

## Failure isolation

Backend code_quality_report contracts already exist (parent SD shipped them). This SD only adds UI + client-side guard. Failure modes:
- Backend down: hooks return error state; panel shows error message; advance still attempts (no client-side block on missing data)
- audit_log INSERT fails on override: override path aborts, error toast surfaces, advance not retried (no silent bypass)
- Flag misconfig (typo): defaults to false, informational mode (safe-by-default)
`.trim();

const executive_summary = `Ship the EHG-side operator surface for Stage 20 Code Quality Gate. Backend (code_quality_report + venture_quality_findings + remediation SD generation) already shipped in SD-LEO-FEAT-STAGE-CODE-QUALITY-001 but has no UI representation — verdicts are invisible to the chairman and the gate has no enforcement surface. This SD delivers: (1) Stage20VerdictPanel rendering verdict + findings + remediation SD links, (2) advanceStage pre-RPC verdict-read with refusal logic gated by feature flag, (3) manual override CTA writing audit_log row with full verdict snapshot, (4) hook surface for the verdict, (5) feature flag NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED defaulting OFF for safe phased rollout (off → canary → portfolio). All five FRs are EHG-repo only; zero EHG_Engineer changes; ~200-300 LOC including tests.`;

const business_context = `Stage 20 Code Quality Gate backend was shipped to detect quality issues in venture deliverables, but the chairman currently has no visible representation of the verdict and no way to enforce the gate without manual database queries. This SD makes the gate operationally complete: chairman sees verdict + findings + remediation chips, can advance ventures normally when quality is acceptable, is blocked from advancing when critical issues exist, and has an audited override path when business circumstances demand. The phased flag rollout (off → canary → portfolio) de-risks introduction of enforcement on a live operator workflow.`;

const technical_context = `Built on existing EHG infrastructure: src/components/ventures/* component patterns (mirrors S19 BUILD panel + S22 distribution panel), src/hooks/useVentureArtifacts pattern, src/lib/ventures/advanceStage existing RPC client, audit_log table (existing schema), supabase client. No new external dependencies. Zero EHG_Engineer changes — all backend contracts (code_quality_report row shape, venture_quality_findings shape, advance_venture_stage RPC, audit_log schema) already exist. Feature flag uses existing NEXT_PUBLIC_* env-var convention. Tests run under existing vitest + Playwright setup.`;

const implementation_approach = `Phase 1 (FR-4): Add useStagePolicy artifact_type awareness + useVentureArtifacts latestS20Verdict selector. Pure additive hook work, fully unit-testable. Phase 2 (FR-1): Build Stage20VerdictPanel with all 4 verdict states (PASS/WARN/FAIL/BLOCKED) + loading + empty states; component tests with mocked hooks. Phase 3 (FR-5): Feature flag helper + wiring. Phase 4 (FR-2): advanceStage pre-RPC guard with all 5 branch unit tests. Phase 5 (FR-3): Override modal + audit_log integration test under HAS_REAL_DB sentinel. Phase 6: Playwright E2E covering panel render + override flow + flag toggle. Each phase ships as a small commit; total ~200-300 LOC src + ~250 LOC tests.`;

const metadata = {
  sd_uuid_id: '98b442a5-e9c1-4b70-bcbe-6421e03e36bd',
  sd_key: SD_ID,
  generated_by: 'inline_llm_mode',
  generated_at: new Date().toISOString(),
  parent_sd: 'SD-LEO-FEAT-STAGE-CODE-QUALITY-001',
  fr_to_objective_trace: {
    'FR-1': ['Make S20 verdict visible to chairman', 'UI parity for backend contract'],
    'FR-2': ['Enable enforcement of code quality gate', 'Phased rollout via flag'],
    'FR-3': ['Establish auditable manual-override pattern', 'Risk-2 mitigation: audit trail'],
    'FR-4': ['Reusable hook surface for verdict consumers'],
    'FR-5': ['Safe phased rollout (off -> canary -> portfolio)', 'Risk-1 mitigation: flag default OFF']
  }
};

async function main() {
  if (!process.env.DISABLE_SSL_VERIFY) process.env.DISABLE_SSL_VERIFY = 'true';
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    const existing = await client.query(
      `SELECT id, sd_id FROM product_requirements_v2 WHERE id = $1 OR sd_id = $2`,
      [PRD_ID, SD_ID]
    );
    if (existing.rows.length > 0) {
      console.error(`[ERROR] PRD already exists for id=${PRD_ID} or sd_id=${SD_ID}:`);
      console.error(JSON.stringify(existing.rows, null, 2));
      process.exit(1);
    }

    const insertResult = await client.query(
      `INSERT INTO product_requirements_v2 (
        id, sd_id, directive_id, title, status, phase, category, priority,
        document_type, created_by, executive_summary, business_context,
        technical_context, system_architecture, implementation_approach,
        functional_requirements, technical_requirements, acceptance_criteria,
        test_scenarios, risks, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, $15,
        $16::jsonb, $17::jsonb, $18::jsonb,
        $19::jsonb, $20::jsonb, $21::jsonb
      ) RETURNING id, sd_id, status, phase, created_at`,
      [
        PRD_ID,                                 // 1 id
        SD_ID,                                  // 2 sd_id (FK to strategic_directives_v2.id, which is varchar SD-key form for this SD)
        SD_ID,                                  // 3 directive_id (sd_key form, no FK)
        TITLE,                                  // 4 title
        'in_progress',                          // 5 status (LEAD-TO-PLAN already accepted)
        'plan',                                 // 6 phase
        'feature',                              // 7 category
        'medium',                               // 8 priority
        'prd',                                  // 9 document_type
        'PLAN',                                 // 10 created_by
        executive_summary,                      // 11
        business_context,                       // 12
        technical_context,                      // 13
        system_architecture,                    // 14
        implementation_approach,                // 15
        JSON.stringify(functional_requirements),// 16
        JSON.stringify(technical_requirements), // 17
        JSON.stringify(acceptance_criteria),    // 18
        JSON.stringify(test_scenarios),         // 19
        JSON.stringify(risks),                  // 20
        JSON.stringify(metadata)                // 21
      ]
    );

    console.log('[OK] PRD inserted:');
    console.log(JSON.stringify(insertResult.rows[0], null, 2));

    const verify = await client.query(
      `SELECT id, sd_id, directive_id, title, status, phase, category, priority,
              document_type, created_by,
              jsonb_array_length(functional_requirements) AS fr_count,
              jsonb_array_length(acceptance_criteria) AS ac_count,
              jsonb_array_length(test_scenarios) AS ts_count,
              jsonb_array_length(risks) AS risks_count,
              jsonb_typeof(technical_requirements) AS tech_type,
              jsonb_typeof(metadata) AS metadata_type,
              length(executive_summary) AS exec_len,
              length(system_architecture) AS sysarch_len
       FROM product_requirements_v2 WHERE id = $1`,
      [PRD_ID]
    );
    console.log('[OK] Verification:');
    console.log(JSON.stringify(verify.rows[0], null, 2));
  } catch (err) {
    console.error('[ERROR] Insert failed:');
    console.error(`  message: ${err.message}`);
    if (err.code) console.error(`  code: ${err.code}`);
    if (err.constraint) console.error(`  constraint: ${err.constraint}`);
    if (err.column) console.error(`  column: ${err.column}`);
    if (err.detail) console.error(`  detail: ${err.detail}`);
    process.exit(2);
  } finally {
    await client.end();
  }
}

main();
