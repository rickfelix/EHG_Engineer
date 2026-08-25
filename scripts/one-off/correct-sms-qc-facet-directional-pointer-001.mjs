#!/usr/bin/env node
/**
 * SD-LEO-DOC-ENCODE-SMS-FACET-001 -- SECURITY sub-agent finding (evidence a58f67d8, LOW-MEDIUM,
 * non-blocking): the just-added clause (d) pointed at the Chairman-SMS-lane source clause as
 * "below" when it is actually ABOVE (content line 72 vs clause (d) at content line ~142), and
 * misattributed the Mode-B cadence to that source clause itself rather than to the two duties
 * that consume it (GROUNDING-COMPLETENESS, AUTONOMY OVERSIGHT), which are the ones that actually
 * state "on the Mode-B sweep". Also adds the explicit "READ-ONLY; NEVER joins the SMS lane"
 * restatement SECURITY recommended so the boundary survives a seat that never follows the
 * pointer. Corrects the just-added clause (d) directly (same-day draft correction, not a
 * SITE-EDIT repeal -- nothing has shipped to LEAD-FINAL yet).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SECTION_ID = 611;

const IDEMPOTENCY_MARKER = 'READ-ONLY; Solomon still NEVER joins the SMS lane';

const OLD_CLAUSE_D = ' (d) **SMS-QC PROBE (durable; chairman-ratified 2026-08-24T23:48:49Z, Solomon-adopted 2026-08-25T00:14:44Z via sms_outbound_obligations b1f24fab, chairman-confirmed 00:16:04Z)**: on this SAME hourly cadence (not the Mode-B sweep the Chairman-SMS-lane source clause below uses), each probe also grades the last hour of chairman-bound outbound SMS (readChairmanSmsExchanges(), 1h window) against: (i) rec+why leads decision asks; (ii) numbered exact keystrokes, only-truly-his items; (iii) plain professional-casual language, last-hour numbers on hourlies; (iv) timestamps pasted from instruments, never estimated; (v) sleep-window/presence/cadence honored; (vi) own-the-miss-not-defend on challenges. (i)/(iii)/(iv)/(v) are in CLAUDE_ADAM.md\'s SMS channel duty (5g/5i); (ii)/(vi) are chairman-ratified but not yet textually encoded there -- follow-on flagged (SD-LEO-DOC-ENCODE-SMS-FACET-001). Breach nudges Adam under this block\'s nudge authority (see a); recurring pattern escalates to the chairman autonomy report; SILENCE WHEN CLEAN. Zero new spend.';

const NEW_CLAUSE_D = ' (d) **SMS-QC PROBE (durable; chairman-ratified 2026-08-24T23:48:49Z, Solomon-adopted 2026-08-25T00:14:44Z via sms_outbound_obligations b1f24fab, chairman-confirmed 00:16:04Z)**: on this SAME hourly cadence (not the Mode-B sweep cadence the GROUNDING-COMPLETENESS and AUTONOMY OVERSIGHT duties use when reading the Chairman-SMS-lane source clause above), each probe also grades the last hour of chairman-bound outbound SMS (readChairmanSmsExchanges(), 1h window) against: (i) rec+why leads decision asks; (ii) numbered exact keystrokes, only-truly-his items; (iii) plain professional-casual language, last-hour numbers on hourlies; (iv) timestamps pasted from instruments, never estimated; (v) sleep-window/presence/cadence honored; (vi) own-the-miss-not-defend on challenges. (i)/(iii)/(iv)/(v) are in CLAUDE_ADAM.md\'s SMS channel duty (5g/5i); (ii)/(vi) are chairman-ratified but not yet textually encoded there -- follow-on flagged (SD-LEO-DOC-ENCODE-SMS-FACET-001). Grading is READ-ONLY; Solomon still NEVER joins the SMS lane. Breach nudges Adam under this block\'s nudge authority (see a); recurring pattern escalates to the chairman autonomy report; SILENCE WHEN CLEAN. Zero new spend.';

async function main() {
  const { data, error } = await supabase.from('leo_protocol_sections').select('id, content').eq('id', SECTION_ID).single();
  if (error) throw error;
  const before = data.content;

  if (before.includes(IDEMPOTENCY_MARKER)) {
    console.log('IDEMPOTENT: corrected clause (d) already present -- refusing to re-apply.');
    return;
  }

  const count = before.split(OLD_CLAUSE_D).length - 1;
  if (count !== 1) {
    throw new Error(`clobber guard: OLD_CLAUSE_D anchor occurs ${count}x (need exactly 1)`);
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const backupPath = path.join(__dirname, `correct-sms-qc-facet-directional-pointer-001.before.${Date.now()}.bak`);
  writeFileSync(backupPath, before, 'utf8');
  console.log(`Before-image saved: ${backupPath}`);

  const after = before.replace(OLD_CLAUSE_D, NEW_CLAUSE_D);

  const must = [IDEMPOTENCY_MARKER, 'clause above', 'GROUNDING-COMPLETENESS and AUTONOMY OVERSIGHT duties'];
  const gone = ['source clause below uses'];
  for (const m of must) {
    if (!after.includes(m)) throw new Error(`post-edit verification FAILED: missing required text: ${m.slice(0, 60)}...`);
  }
  for (const g of gone) {
    if (after.includes(g)) throw new Error(`post-edit verification FAILED: forbidden (stale) text still present: ${g}`);
  }
  const untouchedMarkers = [
    'SITE-EDIT rule',
    '(a) **Hourly Adam drive/duty-adherence probe with nudge authority**',
    '(b) **PLAN-OF-DAY BLESSING**',
    '(c) **Focus-budget audit (N=4)**',
  ];
  for (const u of untouchedMarkers) {
    if (!after.includes(u)) throw new Error(`post-edit verification FAILED: expected unchanged marker missing: ${u}`);
  }

  console.log(`before -> after char count: ${before.length} -> ${after.length} (${after.length - before.length >= 0 ? '+' : ''}${after.length - before.length})`);

  const { error: updateErr } = await supabase.from('leo_protocol_sections').update({ content: after }).eq('id', SECTION_ID);
  if (updateErr) throw updateErr;

  const { data: readback, error: readbackErr } = await supabase.from('leo_protocol_sections').select('content').eq('id', SECTION_ID).single();
  if (readbackErr) throw readbackErr;
  if (!readback.content.includes(IDEMPOTENCY_MARKER)) {
    throw new Error('READ-BACK VERIFICATION FAILED: marker not found in persisted content');
  }
  if (readback.content.length !== after.length) {
    throw new Error(`READ-BACK VERIFICATION FAILED: length mismatch (wrote ${after.length}, read back ${readback.content.length})`);
  }
  console.log('Read-back verified: persisted content matches written content.');
  console.log('DONE.');
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
