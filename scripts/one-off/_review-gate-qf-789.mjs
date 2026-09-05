import { execSync } from 'node:child_process';
import { runReview } from '../../lib/ship/review-gate.js';

const diff = execSync('git diff 47c0984ddaa..HEAD -- lib/fleet/seat-idle-predicate.mjs scripts/coordinator-idle-qf-hint.mjs tests/unit/coordinator/idle-qf-hint.test.js tests/unit/seat-idle-predicate.test.js', { maxBuffer: 1024 * 1024 * 20 }).toString();
const gateResult = runReview(diff, 'standard');
console.log('TIER: standard');
console.log('multiAgent:', gateResult.multiAgent);
console.log('verdict:', gateResult.verdict);
console.log('criticalFindings:', JSON.stringify(gateResult.criticalFindings || []));
