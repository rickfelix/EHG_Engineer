#!/usr/bin/env node
/**
 * Create user stories for SD-LEO-FEAT-S20-VERDICT-BLOCK-UI-001.
 * One US per FR (5 stories). story_key = <SD_KEY>:US-NNN (3-digit zero-padded).
 * Per reference_user_stories_schema_gotchas:
 *  - priority lowercase
 *  - status='ready'
 *  - no 'description' column (use user_role/user_want/user_benefit/technical_notes)
 * Per reference_user_story_validator_test_scenarios_array_short_circuits_gwt:
 *  - populate test_scenarios + testing_scenarios with same array as given_when_then
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FEAT-S20-VERDICT-BLOCK-UI-001';

const stories = [
  {
    story_key: `${SD_KEY}:US-001`,
    sd_id: SD_KEY,
    title: 'Render Stage 20 verdict + findings + remediation chips',
    user_role: 'Chairman',
    user_want: 'I want to see the Stage 20 code quality verdict and supporting findings on the venture detail page',
    user_benefit: 'so that I can assess code quality without querying the database manually',
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Stage20CodeQuality.tsx (extended) renders verdict badge with one of 4 states (PASS/WARN/FAIL/BLOCKED) using color + icon + text',
      'Findings list groups by severity (critical, high, medium, low, info) with counts',
      'Remediation SD chips render when findings have remediation_sd_id; chips link to SD detail page',
      'Empty state copy renders when no venture_quality_findings exist for the venture at stage 20',
      'Loading state renders during initial fetch; error state renders on query failure'
    ],
    technical_notes: 'Extends src/components/stages/Stage20CodeQuality.tsx (do NOT create parallel component at src/components/ventures/). Uses latestS20Verdict from useVentureArtifacts hook. Verdict computed in code from venture_quality_findings rows: BLOCKED if any precondition; FAIL if any high/critical; WARN if any medium; PASS otherwise. Severity badges combine color+icon+text (WCAG 1.4.1).',
    given_when_then: [
      { given: 'venture_quality_findings rows exist for venture V at stage 20 with one critical finding', when: 'Chairman opens Stage 20 detail page', then: 'Stage20CodeQuality renders FAIL verdict badge in red, findings list shows "Critical (1)" group, no remediation chips' },
      { given: 'venture_quality_findings rows include remediation_sd_id values', when: 'Chairman views findings list', then: 'Each finding with remediation_sd_id renders as a chip linking to /ventures/<id>/sds/<sd_id>' },
      { given: 'no venture_quality_findings exist for venture V at stage 20', when: 'Chairman opens Stage 20 detail page', then: 'Component renders PASS verdict + empty-state copy explaining analyzer has not produced findings' }
    ]
  },
  {
    story_key: `${SD_KEY}:US-002`,
    sd_id: SD_KEY,
    title: 'Refuse S20->S21 advance when verdict=FAIL+critical and flag ON',
    user_role: 'Chairman',
    user_want: 'I want the system to refuse to advance a venture from Stage 20 to Stage 21 when code quality has critical issues and the enforcement flag is on',
    user_benefit: 'so that I cannot accidentally promote a venture with known critical quality defects',
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'advanceStage.ts reads venture_quality_findings before invoking advance_venture_stage RPC for 20->21 transitions',
      'When NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED=true AND any finding severity in (high, critical): function returns { ok:false, reason:"S20_QUALITY_BLOCK" } without RPC call',
      'When verdict=BLOCKED (precondition): function returns { ok:false, reason:"S20_PRECONDITION_BLOCK", return_to_stage:19 } regardless of flag state',
      'When flag OFF AND verdict=FAIL: function logs warning + RPC proceeds (informational mode)',
      'When verdict=PASS or no findings: RPC proceeds normally without log noise'
    ],
    technical_notes: 'Pre-RPC verdict-read guard in src/lib/ventures/advanceStage.ts. Feature flag s20VerdictBlock added to src/constants/featureFlags.ts mirroring s17StallBanner pattern. Vitest unit tests cover all 5 branches.',
    given_when_then: [
      { given: 'flag s20VerdictBlock=true and verdict=FAIL with critical finding', when: 'Chairman clicks Advance to S21', then: 'advanceStage returns { ok:false, reason:"S20_QUALITY_BLOCK" } and advance_venture_stage RPC is NOT called' },
      { given: 'flag s20VerdictBlock=true and verdict=BLOCKED', when: 'Chairman clicks Advance to S21', then: 'advanceStage returns { ok:false, reason:"S20_PRECONDITION_BLOCK", return_to_stage:19 }' },
      { given: 'flag s20VerdictBlock=false (default) and verdict=FAIL', when: 'Chairman clicks Advance to S21', then: 'console.warn fires; advance_venture_stage RPC is called; venture advances to stage 21' }
    ]
  },
  {
    story_key: `${SD_KEY}:US-003`,
    sd_id: SD_KEY,
    title: 'Manual override writes audit_log row via SECURITY DEFINER RPC',
    user_role: 'Chairman',
    user_want: 'I want to override an S20 quality block with a recorded reason when business circumstances demand it',
    user_benefit: 'so that I can resume venture progression while preserving an audit trail of the decision',
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Manual override CTA appears only when refusal reason=S20_QUALITY_BLOCK (not for BLOCKED state)',
      'Modal requires reason text >=10 chars before Submit becomes enabled',
      'New SECURITY DEFINER RPC log_stage_advance_override(p_venture_id uuid, p_reason text, p_verdict_snapshot jsonb) writes audit_log row with event_type=stage_advance_override, entity_type=venture, entity_id=venture_id::text, severity=warning, created_by=auth.uid()::text, metadata={reason, verdict_snapshot, attempted_transition:"20->21", stage_number:20, actor:auth.uid()::text}',
      'RPC INSERT must succeed BEFORE advanceStage retry is invoked; if RPC fails, override aborts with error toast',
      'After successful RPC + advance, panel re-renders showing venture moved to S21'
    ],
    technical_notes: 'New migration: database/migrations/<date>_log_stage_advance_override_rpc.sql with CREATE FUNCTION + GRANT EXECUTE TO authenticated. Modal component (Stage20OverrideModal.tsx) uses Radix DialogPrimitive (focus-trap, ESC-close). audit_log RLS forbids direct authenticated INSERT; SECURITY DEFINER RPC is the canonical pattern.',
    given_when_then: [
      { given: 'Stage20CodeQuality shows refusal banner with reason=S20_QUALITY_BLOCK', when: 'Chairman clicks Manual override', then: 'Modal opens with reason textarea autofocused; Submit disabled until reason.length >= 10' },
      { given: 'Chairman submits override with reason="Risk accepted per ticket EVA-1234"', when: 'Submit clicked', then: 'log_stage_advance_override RPC called first; audit_log row inserted; advance_venture_stage RPC then called; venture advances to S21' },
      { given: 'log_stage_advance_override RPC throws an error', when: 'Chairman submits override', then: 'Error toast surfaces; advance_venture_stage RPC is NOT called; venture remains at S20' }
    ]
  },
  {
    story_key: `${SD_KEY}:US-004`,
    sd_id: SD_KEY,
    title: 'BLOCKED verdict shows Return-to-S19 CTA and hides override',
    user_role: 'Chairman',
    user_want: 'I want a clear path back to Stage 19 when Stage 20 cannot run due to upstream preconditions',
    user_benefit: 'so that I am not stuck and do not bypass legitimate gating',
    priority: 'medium',
    status: 'ready',
    acceptance_criteria: [
      'When verdict=BLOCKED: panel renders Return-to-S19 CTA (button or link) with distinct visual treatment from FAIL',
      'When verdict=BLOCKED: Manual override CTA is hidden (no override path for precondition state)',
      'Return-to-S19 onClick navigates to /ventures/<id>/stages/19 (or equivalent route)',
      'Component test asserts BLOCKED + FAIL render different button sets'
    ],
    technical_notes: 'BLOCKED is a distinct verdict from FAIL — different copy, different icon (Ban vs XCircle), no override CTA. Tests must parameterize verdict state to assert each rendering.',
    given_when_then: [
      { given: 'verdict=BLOCKED rendered in Stage20CodeQuality', when: 'Chairman views the panel', then: 'Return-to-S19 CTA visible; Manual override button is absent' },
      { given: 'verdict=FAIL rendered in Stage20CodeQuality with flag ON', when: 'Chairman views the panel', then: 'Manual override CTA visible; Return-to-S19 CTA absent' },
      { given: 'Chairman clicks Return-to-S19 CTA', when: 'BLOCKED verdict is shown', then: 'Browser navigates to /ventures/<id>/stages/19 route' }
    ]
  },
  {
    story_key: `${SD_KEY}:US-005`,
    sd_id: SD_KEY,
    title: 'Feature flag default OFF surfaces verdict informationally without enforcement',
    user_role: 'Operations engineer',
    user_want: 'a safe phased rollout where the verdict surfaces without enforcing refusal until I explicitly enable it',
    user_benefit: 'so that I can observe the analyzer behavior on production data before triggering operator-facing blocks',
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      's20VerdictBlock added to src/constants/featureFlags.ts: { s20VerdictBlock: process.env.NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED === "true" }',
      'Helper returns false when env var unset, "false", "0", "" or any non-"true" value',
      'Stage20CodeQuality renders verdict + findings unconditionally (flag does not affect rendering)',
      'Only advanceStage refusal logic + manual override visibility consult the flag',
      'README/CHANGELOG entry documents flag default + 3-phase rollout plan (off -> canary -> portfolio)',
      'E2E test verifies: flag off + verdict=FAIL+critical -> advance succeeds (informational); flag on + same -> refused with override available'
    ],
    technical_notes: 'NEXT_PUBLIC_* env var is build-time inlined by Vite. Centralized featureFlags.ts mirrors existing s17StallBanner convention. Flag does NOT gate visibility of verdict/findings (always shown), only enforcement behavior.',
    given_when_then: [
      { given: 'NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED is unset (production default)', when: 'Build runs and bundle deploys', then: 'featureFlags.s20VerdictBlock evaluates to false; advanceStage informational mode active' },
      { given: 'flag=false and venture has FAIL verdict with critical finding', when: 'Chairman clicks Advance to S21', then: 'console.warn logged with verdict; advance_venture_stage RPC called; venture advances to S21; panel still showed verdict + findings' },
      { given: 'flag=true after canary enable', when: 'Chairman clicks Advance to S21 with same FAIL+critical state', then: 'Refusal banner shown; Manual override CTA visible; venture remains at S20 until override completes' }
    ]
  }
];

(async () => {
  const enriched = stories.map(s => ({
    ...s,
    test_scenarios: s.given_when_then,
    testing_scenarios: s.given_when_then,
    implementation_context: s.technical_notes
  }));

  const { data, error } = await supabase
    .from('user_stories')
    .insert(enriched)
    .select('story_key, status, priority');

  if (error) { console.error('INSERT FAILED:', error); process.exit(1); }
  console.log(`[OK] Inserted ${data.length} user stories:`);
  data.forEach(s => console.log(`  ${s.story_key}  [${s.priority}/${s.status}]`));
})();
