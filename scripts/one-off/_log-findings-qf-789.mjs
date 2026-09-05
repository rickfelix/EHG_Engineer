import { readFileSync } from 'node:fs';
import { logFindings } from '../../lib/ship/review-findings-logger.js';

const { owner, name } = JSON.parse(readFileSync('.claude-work/ship-repo-resolved.json', 'utf8'));

await logFindings({
  prNumber: 8230,
  reviewTier: 'standard',
  riskScore: 0.49,
  findings: [],
  verdict: 'pass',
  sdKey: 'QF-20260903-789',
  branch: 'qf/QF-20260903-789',
  multiAgent: false,
  repo: `${owner}/${name}`,
});
console.log('logged');
