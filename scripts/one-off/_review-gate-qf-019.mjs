import { execSync } from 'node:child_process';
import { runReview } from '../../lib/ship/review-gate.js';

const diff = execSync('git diff baff19e40ef..HEAD -- scripts/modules/handoff/HandoffOrchestrator.js scripts/modules/handoff/HandoffOrchestrator.artifact-preflight.test.js', { maxBuffer: 1024 * 1024 * 20 }).toString();
const gateResult = runReview(diff, 'standard');
console.log('TIER: standard');
console.log('multiAgent:', gateResult.multiAgent);
console.log('verdict:', gateResult.verdict);
console.log('criticalFindings:', JSON.stringify(gateResult.criticalFindings || []));
console.log('---REVIEW PROMPT---');
console.log(gateResult.reviewPrompt || '(none)');
