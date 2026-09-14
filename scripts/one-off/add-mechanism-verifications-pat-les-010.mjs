#!/usr/bin/env node
// GATE_MECHANISM_CLAIM_VERIFIER (LEAD-TO-PLAN) requires named file:line verifications for the
// spine's mechanism claims. These are real citations from this session's own verification work
// (Explore + VALIDATION sub-agents both independently opened and confirmed these exact locations).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: before, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', 'SD-LEARN-FIX-ADDRESS-PAT-LES-010')
  .maybeSingle();

if (readErr) { console.error('READ ERROR', readErr.message); process.exit(1); }
if (!before) { console.error('SD not found'); process.exit(1); }

const mechanism_verifications = [
  {
    verified_by: 'Explore sub-agent (LEAD-TO-PLAN, evidence row ecb402ed-add7-4394-a893-961d08b3081b)',
    verified_at: 'lib/eva/stage-templates/stage-23.js:1',
    note: 'Read in full: current stage-23.js is "Dedicated Venture UAT" (35 lines), no evaluateKillGate/stage22Data/promotion_gate reference at all.',
  },
  {
    verified_by: 'Explore sub-agent (LEAD-TO-PLAN, evidence row ecb402ed-add7-4394-a893-961d08b3081b)',
    verified_at: 'lib/eva/stage-templates/stage-24.js:20',
    note: 'Confirmed TEMPLATE.analysisStep delegates to analyzeStage23LaunchReadiness; no inline promotion_gate check.',
  },
  {
    verified_by: 'VALIDATION sub-agent (LEAD-TO-PLAN, evidence row 7744eca8-2090-4905-8a59-805b296c437e)',
    verified_at: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js:149',
    note: 'preflightUpstream() confirmed as an artifact-existence predicate (venture_artifacts by artifact_type, is_current=true) -- structurally replaces the old raw boolean-flag read.',
  },
  {
    verified_by: 'VALIDATION sub-agent (LEAD-TO-PLAN, evidence row 7744eca8-2090-4905-8a59-805b296c437e)',
    verified_at: 'tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js:310',
    note: 'The new regression-guard test verified BY EXECUTION (npx vitest run), 17/17 passing.',
  },
];

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: { ...(before.metadata || {}), mechanism_verifications },
  })
  .eq('id', before.id);

if (updateErr) { console.error('UPDATE ERROR', updateErr.message); process.exit(1); }

console.log('metadata.mechanism_verifications written:', mechanism_verifications.length, 'entries.');
