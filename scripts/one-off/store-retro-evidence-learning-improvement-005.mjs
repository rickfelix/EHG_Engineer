// SD-LEARN-FIX-LEARNING-IMPROVEMENT-005 — RETRO sub-agent evidence writer (PLAN-TO-LEAD gate).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEARN-FIX-LEARNING-IMPROVEMENT-005';
const PHASE = 'PLAN-TO-LEAD';

const results = {
  verdict: 'PASS',
  confidence: 95,
  summary:
    'Retrospective 5dd16311-2e56-461d-8599-9164f84f5e04 generated (quality score 100, PUBLISHED). ' +
    'Captured: this SD is a write-side-only fix (artifact_path/artifact_sha/source provenance stamping) ' +
    'with the gate-side read (FR-2) deliberately deferred pending PR #7978 -- metadata.test_execution ' +
    'fields still have ZERO readers post-SD, tracked as protocol_improvement_queue 242c0a5a. Four ' +
    'independent review passes (LEAD prospective TESTING, PLAN TESTING, EXEC TESTING+SECURITY, VERIFY ' +
    'VALIDATION+REGRESSION) each caught a distinct real defect: a wrong premise, an unimplementable ' +
    'design detail, a recurred evidence_reused-vs-from_cache defect class, a TOCTOU split-read, and ' +
    'PRD/code drift -- all fixed same-session, not deferred as debt. Full 39,614-test regression run ' +
    'confirmed zero regressions.',
  critical_issues: [],
  warnings: [],
  recommendations: [],
  detailed_analysis: {
    retro_id: '5dd16311-2e56-461d-8599-9164f84f5e04',
    quality_score: 100,
    status: 'PUBLISHED',
    followup_protocol_improvement_id: '242c0a5a-c36a-4013-950f-e661da8f68b4',
    zero_readers_still_true: true,
  },
  metadata: {
    retro_id: '5dd16311-2e56-461d-8599-9164f84f5e04',
  },
  execution_time_ms: 139704,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'RETRO',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('RETRO', SD_ID, { name: 'Retrospective Sub-Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
