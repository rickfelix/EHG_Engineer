import fs from 'fs';
import crypto from 'crypto';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';
const P = '.artifacts/testing-exec-to-plan-receipts-evidence.json';
const LOG = '.artifacts/testing-fullsuite-run2.log';
const sha = crypto.createHash('sha256').update(fs.readFileSync(LOG)).digest('hex');
const j = JSON.parse(fs.readFileSync(P, 'utf8'));
j.metadata = j.metadata || {};
j.metadata.test_execution = buildTestExecution({
  executed: 48261, passed: 47963, failed: 23, skipped: 272,
  artifactSha: sha, runner: 'npx vitest run --project unit',
  artifactPath: LOG, source: 'fresh'
});
fs.writeFileSync(P, JSON.stringify(j, null, 2));
console.log('artifact_sha:', sha);
console.log(JSON.stringify(j.metadata.test_execution, null, 2));
