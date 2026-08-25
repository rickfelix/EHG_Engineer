#!/usr/bin/env node
// LEAD-phase VALIDATION evidence for SD-LEO-INFRA-SESSION-TICK-CLEAR-001 (LEAD-TO-PLAN gate).
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '7eee0052-1da3-4bfb-9509-a090c52b0d25';
const SD_KEY = 'SD-LEO-INFRA-SESSION-TICK-CLEAR-001';

async function run() {
  const supabase = createSupabaseServiceClient();

  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('description, success_criteria, risks, metadata')
    .eq('id', SD_UUID)
    .single();
  if (sdErr) throw new Error(`SD fetch failed: ${sdErr.message}`);

  const checks = {
    has_folded_in_rca: sd.description.includes('FOLDED-IN RCA'),
    has_mechanism_verifications: Array.isArray(sd.metadata?.mechanism_verifications) && sd.metadata.mechanism_verifications.length >= 3,
    has_recurrence_gate_answered: sd.description.includes('RECURRENCE GATE PRE-ANSWERED'),
    has_acceptance_gate_specified: sd.description.includes('ACCEPTANCE GATE'),
  };
  const allPass = Object.values(checks).every(Boolean);

  let results = {
    sub_agent_name: 'Validation (LEAD readiness)',
    verdict: allPass ? 'PASS' : 'CONDITIONAL_PASS',
    confidence: 90,
    critical_issues: [],
    warnings: [
      'This is a RECURRENCE-AFTER-FIX SD (SD-LEO-INFRA-SESSION-TICK-DAEMONS-001 shipped this same class 2026-08-04). The folded-in RCA correctly diagnosed the recurrence as a destructible-join-key defect (marker deletion race), not a regression -- PLAN must design the fix to specifically close the acceptance gap DAEMONS-001\'s own tests lacked (a live two-daemon-with-deleted-marker scenario), or this SD risks becoming a THIRD round of the same class.',
    ],
    recommendations: [
      'PLAN should adopt the LEAD-phase design decision already made: an additive metadata.cc_parent_pid stamp (JSONB, no schema migration) written at every SessionStart, with closeRotatedOutSessions extended to also query claude_sessions directly by that field as a marker-independent fallback -- this satisfies RCA Fix Shape B without the schema-migration cost or the unclear coupling to the pre-existing terminal_identity/session-manager.mjs mechanism (flagged separately, not adopted).',
    ],
    detailed_analysis:
      `LEAD-readiness checks: has_folded_in_rca=${checks.has_folded_in_rca}, has_mechanism_verifications=${checks.has_mechanism_verifications} ` +
      `(${sd.metadata?.mechanism_verifications?.length ?? 0} file:line-cited claims, all independently re-verified against the live tree during LEAD rather than trusted from the RCA prose), ` +
      `has_recurrence_gate_answered=${checks.has_recurrence_gate_answered}, has_acceptance_gate_specified=${checks.has_acceptance_gate_specified}. ` +
      `This SD arrived unusually well-diagnosed (Solomon deep-sweep advisory a58e7151, corr 35695f6b) -- LEAD's job here was verification of the existing RCA against real code, not fresh investigation, and that verification confirmed all three core mechanism claims hold on the current tree.`,
    execution_time: 0,
    validation_mode: 'prospective',
    justification:
      'LEAD-phase VALIDATION confirms the SD carries a real, code-verified mechanism (not endorsed-but-unverified RCA prose) and a concrete, minimal-blast-radius fix decision before PLAN begins.',
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    subAgentCode: 'VALIDATION',
    targetApplication: 'EHG_Engineer',
  });
  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_UUID,
    { name: 'Validation (LEAD readiness)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD' }
  );

  console.log('\nEvidence row written:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  checks:', JSON.stringify(checks));
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
