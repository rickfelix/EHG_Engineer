import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ROW = 'c43b6f1c-ad7c-4572-9ef2-ab6d72de9634';

const { data: row, error: readErr } = await sb
  .from('sub_agent_execution_results').select('metadata').eq('id', ROW).single();
if (readErr) { console.error('READ FAIL', readErr.message); process.exit(1); }

const md = row.metadata || {};
md.claim_4_independent_verification = {
  ...(md.claim_4_independent_verification || {}),
  conclusion_status: 'CONFIRMED (Windows-only, zero CI impact) -- but EXECs stated CAUSE was falsified by testing.',
  exec_causal_attribution_FALSIFIED: {
    exec_claimed: 'The crash is caused by .range() pagination; sibling audit-log-parity-check.mjs does not call .range() and does not crash.',
    testing_found:
      'FALSE. A minimal probe using ONLY { count: exact, head: true } (no .range(), no response body) crashes deterministically 3/3. '
      + 'A probe using .limit(1) (no .range()) also crashes 3/3. .range() is NOT the discriminator. '
      + 'The head-vs-body hypothesis was also tested and falsified (both crash).',
  },
  actual_mechanism_CONFIRMED: {
    finding: 'Exit-timing race between process.exit() and undici/supabase-js keep-alive socket teardown in Windows libuv.',
    decisive_experiment: [
      'supabase query + IMMEDIATE process.exit(0)  -> crashes 3/3 (assert in src\win\async.c)',
      'supabase query + 500ms delay + process.exit(0) -> clean 3/3, exit 0',
      'supabase query + NO process.exit() (natural drain) -> clean 3/3, exit 0',
    ],
    why_sibling_looks_clean:
      'audit-log-parity-check.mjs issues TWO sequential head-count round trips before exiting, so the socket handle has settled '
      + 'by the time process.exit() fires. It is clean by timing, not by avoiding .range(). The comparison EXEC drew was a '
      + 'true observation attached to a wrong cause.',
  },
  determinism: 'Windows: 5/5 crash on the real FR-B4 script. Linux (WSL2): 3/3 clean, exit 0, correct {"status":"pass"} payload.',
  why_conclusion_still_holds:
    'Independent of mechanism, src/win/async.c is a Windows-ONLY libuv translation unit (POSIX builds compile src/unix/async.c), '
    + 'so this assertion cannot fire on ubuntu-latest. Corroborated by 3/3 clean real runs of the identical script on Linux. '
    + 'The FR-B4 verdict is unaffected; only the stated cause needed correcting.',
  residual_unverified:
    'No ubuntu-latest node-20 GitHub Actions run of bypass-ledger-join-check.yml has ever fired (cron + workflow_dispatch only). '
    + 'Linux leg used node v18.19.1 (only node in WSL); workflow pins node 20.',
};
md.record_corrections = [
  ...(md.record_corrections || []),
  {
    at: new Date().toISOString(),
    by: 'TESTING (same run 2, post-write correction)',
    what: 'Replaced the .range()-based causal story for the Windows libuv crash with the experimentally confirmed exit-timing mechanism. Verdict PASS unchanged.',
  },
];

const { error: upErr } = await sb.from('sub_agent_execution_results').update({ metadata: md }).eq('id', ROW);
if (upErr) { console.error('UPDATE FAIL', upErr.message); process.exit(1); }
console.log('metadata corrected on row', ROW);
await new Promise(r => setTimeout(r, 400));
