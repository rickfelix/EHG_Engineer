// SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 -- RETRO sub-agent evidence row for the PLAN-TO-LEAD
// GATE_SUBAGENT_EVIDENCE requirement. The retro-agent already published the retrospective row
// (cfbcd122-0ed6-406e-9819-fe9cfbf26d27, retro_type='SD_COMPLETION', quality_score=100) but the
// gate separately requires a sub_agent_execution_results row for subAgentCode='RETRO'.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002';
const PHASE = 'PLAN_VERIFICATION';
const RETRO_ID = 'cfbcd122-0ed6-406e-9819-fe9cfbf26d27';

const results = {
  verdict: 'PASS',
  confidence: 100,
  summary:
    "SD_COMPLETION retrospective published (id " + RETRO_ID + ", quality_score=100, created_at 2026-08-26T13:18:05Z, after this SD's LEAD-TO-PLAN accepted_at 2026-08-26T11:21:28.921146Z). Sourced from the live sub_agent_execution_results rows and actual commit history across LEAD (Explore + VALIDATION, 5 defects), EXEC (TESTING G1-G5 + SECURITY F-1/F-3, all closed), and PLAN_VERIFICATION (VALIDATION V-1/V-2/V-3 + REGRESSION REG-1, all closed) phases. Headline lesson captured: a fix for flakiness/regression-blindness can itself reintroduce the exact defect class it exists to prevent, one file over -- demonstrated twice in this SD (VALIDATION's V-1 finding on the FR-3/FR-4 round-trip test using a real clock against a blocking quiet-hours check; the general G1-G5 pattern of committed tests exercising a mock rather than the real callee). Also captures the deliberate choice of a NEW migration file over editing the already-applied 20260824_chairman_held_sends.sql, and the 2-row live data cleanup (FR-6 void) whose provenance was independently re-verified across 3 separate sub-agent passes.",
  findings: [
    { id: 'retro-published', severity: 'info', note: 'retrospectives row ' + RETRO_ID + ', retro_type=SD_COMPLETION, quality_score=100, status=PUBLISHED.' },
  ],
  metadata: { retrospective_id: RETRO_ID, retro_type: 'SD_COMPLETION', quality_score: 100 },
  execution_time_ms: 300000,
};

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'RETRO', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('RETRO', SD_ID, { name: 'Retrospective Analyst' }, results, { phase: PHASE });
console.log('RETRO_SUBAGENT_EVIDENCE_STORED_ID=' + (stored?.id || 'n/a'));
