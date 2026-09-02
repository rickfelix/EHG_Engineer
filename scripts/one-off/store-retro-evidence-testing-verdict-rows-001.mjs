// SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001 — RETRO sub-agent evidence writer (PLAN-TO-LEAD gate).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001';
const PHASE = 'PLAN-TO-LEAD';

const results = {
  verdict: 'PASS',
  confidence: 95,
  summary:
    'Retrospective 5fc7aaf4-0d42-436e-a8cd-c8938beafebb generated (quality score 100, PUBLISHED, ' +
    'learning_category TESTING_STRATEGY). Captured: two mid-build premise corrections (source=manual ' +
    'unusable as discriminator, PLAN evidence 42436060; the measured=false exemption fix for a too-' +
    'aggressive first FR-1 implementation, EXEC-TO-PLAN evidence 4e655ac0), the SECURITY adversarial ' +
    're-verification that the exemption does not reopen the bypass (evidence row 82d33f55), the safeEchoValue() ' +
    'hardening, the honest ~87% (not table-wide) storeSubAgentResults coverage figure, and a git index.lock ' +
    'process incident during the origin/main merge. Filed 3 protocol_improvement_queue candidates for scoped-out ' +
    'follow-up work (CHECK/trigger for direct-insert bypass writers, cross-field numeric consistency, ' +
    'artifact_sha/runner provenance).',
  critical_issues: [],
  warnings: [],
  recommendations: [],
  detailed_analysis: {
    retro_id: '5fc7aaf4-0d42-436e-a8cd-c8938beafebb',
    quality_score: 100,
    status: 'PUBLISHED',
    protocol_improvement_queue_ids: [
      'a68ecfec-a29a-4b5e-95c1-0b10975b0bf0',
      '4df36caa-d27e-4eff-90cc-62fd8e89bf44',
      '95061d4a-d671-440b-aaa5-6f8085c43288',
    ],
  },
  metadata: {
    retro_id: '5fc7aaf4-0d42-436e-a8cd-c8938beafebb',
  },
  execution_time_ms: 247586,
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
