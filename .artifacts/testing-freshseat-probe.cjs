const { buildSessionMetadata } = require('../scripts/hooks/capture-session-id.cjs');
const { verdictFromMetadata, ROLE_VERDICT } = require('../lib/fleet/role-status-identity.cjs');
const { policyModelFor, coarseModelAlias } = require('../lib/fleet/model-policy.cjs');

// Exactly what the hook writes for a BRAND-NEW session (no prior row) started on Fable.
const fresh = buildSessionMetadata(undefined, 4242, 'startup', 'claude-fable-5-1');
console.log('fresh metadata written by hook:', JSON.stringify(fresh));
const verdict = verdictFromMetadata(fresh);
const expected = policyModelFor(verdict === 'role' ? 'role' : 'worker');
console.log('roleVerdictFor(DB-row-just-written) =>', verdict);
console.log('expected model for that class     =>', expected, `(alias ${coarseModelAlias(expected)})`);
console.log('observed alias                    =>', coarseModelAlias('claude-fable-5-1'));
console.log('WOULD SIGNAL?                     =>', coarseModelAlias('claude-fable-5-1') !== coarseModelAlias(expected));
console.log('');
// Contrast: an ALREADY-REGISTERED solomon seat
const registered = buildSessionMetadata({ role: 'solomon' }, 4242, 'resume', 'claude-fable-5-1');
console.log('registered solomon verdict =>', verdictFromMetadata(registered), '(would signal:',
  coarseModelAlias('claude-fable-5-1') !== coarseModelAlias(policyModelFor(verdictFromMetadata(registered) === 'role' ? 'role':'worker')), ')');
const coord = buildSessionMetadata({ is_coordinator: true }, 1, 'startup', 'claude-fable-5-1');
console.log('coordinator verdict        =>', verdictFromMetadata(coord));
console.log('');
console.log('hook coarseModelAlias vs model-policy coarseModelAlias on an UNKNOWN id:');
const hookMod = require('fs').readFileSync('../scripts/hooks/capture-session-id.cjs','utf8');
console.log('  model-policy:', JSON.stringify(coarseModelAlias('claude-experimental-9')));
console.log('  hook-local returns raw passthrough (see line ~349): || raw');
