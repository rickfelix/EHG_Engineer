import { readFileSync } from 'node:fs';
import { logFindings } from '../../lib/ship/review-findings-logger.js';

const { owner, name } = JSON.parse(readFileSync('.claude-work/ship-repo-resolved.json', 'utf8'));

await logFindings({
  prNumber: 8227,
  reviewTier: 'light',
  riskScore: 0.1,
  findings: [],
  verdict: 'pass',
  sdKey: 'QF-20260903-180',
  branch: 'qf/QF-20260903-180',
  multiAgent: false,
  repo: `${owner}/${name}`,
});
console.log('logged');
