import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_KEY = 'SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B';
const mode = process.argv[2] || 'provisional';
const payloadPath = process.argv[3];

const provisional = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 40,
  summary: 'PROVISIONAL regression row (crash insurance). Validation in progress: comment-only change to scripts/modules/ai-quality-evaluator/config.js + 1 new unit assertion in tests/unit/quality/ai-quality-evaluator-config.test.js.',
  findings: [{ severity: 'INFO', issue: 'Row written up-front per SD-FDBK-ENH-REGRESSION-SUB-AGENT-001; final verdict written by the same script in --final mode.' }],
  metrics: { provisional: true },
};

let results = provisional;
if (mode === 'final') {
  const { readFileSync } = await import('node:fs');
  results = JSON.parse(readFileSync(payloadPath, 'utf8'));
}

const resolution = await resolveSubAgentRepo({
  sdId: SD_KEY,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'REGRESSION',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('REGRESSION', SD_KEY, { metadata: { version: '1.0.0' } }, results, {
  sdKey: SD_KEY,
  phase: 'PLAN_TO_LEAD',
});
console.log('MODE:', mode);
console.log('VERDICT:', results.verdict, 'CONF:', results.confidence);
console.log('STORED:', JSON.stringify(stored));
