import { completeQuickFix } from '../modules/complete-quick-fix/index.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const notes = [
  "TESTING sub-agent evidence (delayed delivery, genuinely completed before TaskStop):",
  "testing-qf866 verdict=PASS confidence=90%, 7/7 new tests + 21/21 adjacent regression +",
  "947/964 broader sd/qf sweep (17 pre-existing failures independently re-verified, unrelated",
  "to this diff). testing-qf866-b verdict=CONDITIONAL_PASS, flagged one real CI regression:",
  "a fixed-offset positional slice in tests/unit/harness/leo-create-flags-parity.test.js that",
  "the success_criteria line pushed past its window boundary -- the exact root cause I",
  "independently found and fixed in commit 2653ee436e6 before either verdict was received.",
  "The diagnostic RCA sub-agent re-ran that specific test post-fix and confirmed 21/21 green.",
  "PR #8080 CI Run Unit Tier subsequently passed the full suite (46230+ tests) and the PR is",
  "MERGED (2026-09-03T01:11:22Z). Coordinator ruling 0fbe72a0/d2c72607 additionally authorized",
  "runner-produced evidence as a fallback given an apparent (but ultimately message-delivery-",
  "delayed, not actually stalled) sub-agent silence.",
].join(' ');

async function main() {
  await completeQuickFix('QF-20260902-866', {
    prUrl: 'https://github.com/rickfelix/EHG_Engineer/pull/8080',
    actualLoc: 35,
    uatVerified: true,
    verificationNotes: notes,
  });
}

if (isMainModule(import.meta.url)) {
  main()
    .then(() => { process.exitCode = 0; setTimeout(() => process.exit(0), 1500).unref(); })
    .catch((err) => { console.error('Error:', err.message); process.exit(1); });
}
