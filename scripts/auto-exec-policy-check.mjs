#!/usr/bin/env node
/**
 * auto-exec-policy-check — operator/CI inspection CLI for the auto-exec policy gates.
 * SD-LEO-INFRA-POLICY-GATED-AUTO-001B.
 *
 * Given a candidate action, prints the reversibility classification, the
 * path-overlap verdict, and (if --action-class names a policy) the fail-closed
 * policy-load result + combined eligibility. Read-only; never executes anything.
 *
 * Usage:
 *   node --env-file=.env scripts/auto-exec-policy-check.mjs \
 *     --action-class checkout_sync --target git-stash --reversible --window-ms 600000
 *   node --env-file=.env scripts/auto-exec-policy-check.mjs --action-class hard_delete --target repo
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  classifyReversibility,
  checkPathOverlap,
  loadActionPolicy,
  fetchForbiddenClasses,
  decideAutoExecEligibility,
} from '../lib/auto-exec-policy.js';

function getArg(flag, def = undefined) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}
const has = (flag) => process.argv.includes(flag);

const action = {
  action_class: getArg('--action-class'),
  target: getArg('--target'),
  outward_facing: has('--outward-facing'),
  reversible: has('--reversible'),
  rollback_window_ms: Number(getArg('--window-ms', '0')),
};

if (!action.action_class) {
  console.error('ERROR: --action-class is required. See the header for usage.');
  process.exit(2);
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const forbidden = await fetchForbiddenClasses(db);
const cls = classifyReversibility(action, { forbiddenClasses: forbidden.classes });
const overlap = checkPathOverlap(action.target);
const policy = await loadActionPolicy(db, action.action_class);
const decision = decideAutoExecEligibility(action, {
  policy: policy.ok ? policy.policy : null,
  forbiddenClasses: forbidden.classes,
});

console.log('=== auto-exec policy check ===');
console.log(`action_class : ${action.action_class}`);
console.log(`target       : ${action.target ?? '(none)'}`);
console.log(`forbidden-set: ${forbidden.ok ? forbidden.classes.join(', ') || '(empty)' : 'READ FAILED → treat all as forbidden'}`);
console.log(`reversibility: ${cls.verdict} — ${cls.reason}`);
console.log(`path-overlap : ${overlap.blocked ? 'BLOCKED' : 'ok'} — ${overlap.reason}`);
console.log(`policy load  : ${policy.ok ? 'complete' : 'NOT ELIGIBLE'} — ${policy.ok ? 'all facets present' : policy.reason}`);
console.log(`DECISION     : ${decision.eligible ? 'AUTO-ELIGIBLE' : `BLOCKED@${decision.gate}`} — ${decision.reason}`);

// Non-zero exit when the action would be blocked, so CI/automation can gate on it.
process.exit(decision.eligible ? 0 : 1);
