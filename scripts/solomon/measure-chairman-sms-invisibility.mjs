/**
 * SD-LEO-INFRA-CHAIRMAN-SMS-LANE-001 FR-4 — quantify the sample-bias claim, or refute it.
 *
 * The SD ASSERTS that the autonomy-oversight duty grades on a biased sample, because the
 * consequential matters are the ones that reach SMS. That is an inference. This measures it.
 *
 * REFUTATION IS A VALID RESULT and is reported as such. If the previously-invisible count is ~0,
 * the SD's premise was wrong and that must be said, not quietly dropped — the PRD names this
 * explicitly so the measurement cannot be run as a formality that only ever confirms.
 *
 * "Previously invisible" = present in the chairman SMS lane, absent from every source the two
 * duties actually named before this SD:
 *   - session_coordination rows with payload.kind IN (adam_advisory, coordinator_reply)
 *   - chairman_decisions rows
 * Read-only.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readChairmanSmsExchanges } from '../../lib/solomon/chairman-sms-exchanges.js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const WINDOW_HOURS = Number(process.argv[2] || 168);   // 7 days by default; explicit, not hidden

const res = await readChairmanSmsExchanges(s, { windowHours: WINDOW_HOURS });
const { since, until } = res.window;

console.log(`=== FR-4 measurement | window ${WINDOW_HOURS}h (${since} -> ${until}) ===`);
console.log(`  inbound msgs:        ${res.counts.inbound}`);
console.log(`  outbound msgs:       ${res.counts.outbound}`);
console.log(`  exchanges:           ${res.counts.exchanges}`);
console.log(`  unanswered outbound: ${res.counts.unanswered}`);
console.log(`  chairman-initiated:  ${res.counts.chairman_initiated}`);

// CHAIRMAN-DIRECTION exchanges: ones where the chairman actually said something (an inbound
// exists). An outbound with no reply is Adam asking, not the chairman directing.
// The automated "are you still there?" SMS is a WATCHDOG, not the chairman. Counting it as
// chairman direction inflated the first measurement from 73 to 114 and the headline from 90%
// to 94%. Excluded here so the number means what it says.
const WATCHDOG = /are you still there|still there?|haven'?t received any text/i;
const chairmanDirection = res.exchanges.filter((e) => e.reply && String(e.reply.body || '').trim()
  && !WATCHDOG.test(e.reply.body));
console.log(`\n  chairman-direction exchanges (an inbound with content): ${chairmanDirection.length}`);

// What the duties COULD see in the same window.
const [cd, sc] = await Promise.all([
  s.from('chairman_decisions').select('id, created_at').gte('created_at', since).lte('created_at', until),
  s.from('session_coordination').select('id, created_at').gte('created_at', since).lte('created_at', until)
    .in('payload->>kind', ['adam_advisory', 'coordinator_reply']),
]);
if (cd.error) throw new Error('chairman_decisions read failed: ' + cd.error.message);

const cdCount = (cd.data || []).length;
const scCount = sc.error ? null : (sc.data || []).length;
console.log(`\n  sources the duties already read, same window:`);
console.log(`    chairman_decisions rows:                  ${cdCount}`);
console.log(`    session_coordination advisory/reply rows: ${scCount === null ? 'query failed: ' + sc.error.message : scCount}`);

// The claim under test: SMS carries chairman direction that leaves NO trace in those sources.
// Conservative attribution — every chairman_decisions row in the window is treated as if it
// covered one SMS exchange, which UNDERSTATES the invisible count. Erring against my own thesis.
const invisibleLowerBound = Math.max(0, chairmanDirection.length - cdCount);

console.log(`\n=== VERDICT ===`);
console.log(`  chairman-direction SMS exchanges: ${chairmanDirection.length}`);
console.log(`  chairman_decisions rows to offset: ${cdCount} (every one credited, which UNDERSTATES the gap)`);
console.log(`  previously-invisible LOWER BOUND: ${invisibleLowerBound}`);

if (chairmanDirection.length === 0) {
  console.log('\n  INCONCLUSIVE: no chairman-direction exchanges in this window. The claim is neither');
  console.log('  confirmed nor refuted here — widen the window before drawing a conclusion.');
} else if (invisibleLowerBound === 0) {
  console.log('\n  REFUTED (for this window): chairman_decisions rows at least match the chairman-direction');
  console.log('  exchanges, so the SD premise that SMS direction leaves no trace does NOT hold here.');
  console.log('  Reporting this as the result. The SD asserted the bias; the measurement does not support it.');
} else {
  const pct = Math.round((invisibleLowerBound / chairmanDirection.length) * 100);
  console.log(`\n  CONFIRMED: at least ${invisibleLowerBound} of ${chairmanDirection.length} chairman-direction`);
  console.log(`  exchanges (${pct}%) have no corresponding chairman_decisions row in the window, so the`);
  console.log('  autonomy-oversight duty could not have seen them. The bias claim is supported.');
}

if (chairmanDirection.length) {
  console.log('\n  CITATION SAMPLE (proves a finding can quote a specific message with its timestamp):');
  for (const e of chairmanDirection.slice(0, 3)) {
    console.log(`    [${e.reply.at}] chairman: "${String(e.reply.body).replace(/\s+/g, ' ').slice(0, 110)}"`);
  }
}
