import { readFileSync } from 'node:fs';
import { logFindings } from '../../lib/ship/review-findings-logger.js';

const { owner, name } = JSON.parse(readFileSync('.claude-work/ship-repo-resolved.json', 'utf8'));

await logFindings({
  prNumber: 8234,
  reviewTier: 'standard',
  riskScore: 0.3,
  findings: [],
  verdict: 'pass',
  sdKey: 'QF-20260905-185',
  branch: 'qf/QF-20260905-185',
  multiAgent: false,
  repo: `${owner}/${name}`,
});
console.log('logged');
