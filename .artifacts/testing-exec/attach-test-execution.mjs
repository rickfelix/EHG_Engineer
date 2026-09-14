import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';

const ARTIFACT = '.artifacts/testing-exec/checkpoint-send-results.json';
const EVIDENCE = '.artifacts/testing-exec/evidence.json';

const raw = fs.readFileSync(ARTIFACT);
const sha = createHash('sha256').update(raw).digest('hex');
const report = JSON.parse(raw);

const evidence = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));
evidence.metadata.test_execution = buildTestExecution({
  executed: report.numTotalTests,
  passed: report.numPassedTests,
  failed: report.numFailedTests,
  skipped: report.numPendingTests ?? 0,
  artifactSha: sha,
  runner: 'vitest',
  artifactPath: ARTIFACT,
  source: 'fresh',
  mappedCandidates: report.numTotalTestSuites,
  foundFiles: report.testResults?.length ?? 0,
});
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence.metadata.test_execution, null, 2));
