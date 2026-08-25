#!/usr/bin/env node
/**
 * SD-LEO-DOC-ENCODE-SMS-FACET-001 — encode the chairman-ratified SMS-QC probe facet into
 * leo_protocol_sections id=611 (section_type=solomon_role_contract), appending clause (d) to
 * the existing ADAM ADHERENCE PROBE + PLAN-OF-DAY BLESSING duty block right after clause (c).
 *
 * Pattern mirrors scripts/one-off/edit-solomon-contract-mode-c-round2.mjs: idempotency refusal,
 * clobber guard (anchor must occur exactly once), before-image backup, replace, must[]/gone[]
 * post-edit assertions, update, separate read-back verification.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SECTION_ID = 611;

// Distinctive marker for idempotency (NOT "(d)" -- that bare token already occurs once
// elsewhere in the content, per TESTING evidence daade26d).
const IDEMPOTENCY_MARKER = 'SMS-QC PROBE (durable; chairman-ratified 2026-08-24T23:48:49Z';

const ANCHOR = '(c) **Focus-budget audit (N=4)**: riding the hourly probe, audit that Adam concurrent focus threads stay within the N=4 budget; flag overload rather than letting it silently accrete.';

const CLAUSE_D = ' (d) **SMS-QC PROBE (durable; chairman-ratified 2026-08-24T23:48:49Z, Solomon-adopted 2026-08-25T00:14:44Z via sms_outbound_obligations b1f24fab, chairman-confirmed 00:16:04Z)**: on this SAME hourly cadence (not the Mode-B sweep the Chairman-SMS-lane source clause below uses), each probe also grades the last hour of chairman-bound outbound SMS (readChairmanSmsExchanges(), 1h window) against: (i) rec+why leads decision asks; (ii) numbered exact keystrokes, only-truly-his items; (iii) plain professional-casual language, last-hour numbers on hourlies; (iv) timestamps pasted from instruments, never estimated; (v) sleep-window/presence/cadence honored; (vi) own-the-miss-not-defend on challenges. (i)/(iii)/(iv)/(v) are in CLAUDE_ADAM.md\'s SMS channel duty (5g/5i); (ii)/(vi) are chairman-ratified but not yet textually encoded there -- follow-on flagged (SD-LEO-DOC-ENCODE-SMS-FACET-001). Breach nudges Adam under this block\'s nudge authority (see a); recurring pattern escalates to the chairman autonomy report; SILENCE WHEN CLEAN. Zero new spend.';

async function main() {
  const { data, error } = await supabase.from('leo_protocol_sections').select('id, content').eq('id', SECTION_ID).single();
  if (error) throw error;
  const before = data.content;

  if (before.includes(IDEMPOTENCY_MARKER)) {
    console.log('IDEMPOTENT: clause (d) already present in leo_protocol_sections id=611 -- refusing to re-apply.');
    return;
  }

  const count = before.split(ANCHOR).length - 1;
  if (count !== 1) {
    throw new Error(`clobber guard: anchor occurs ${count}x (need exactly 1)`);
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const backupPath = path.join(__dirname, `encode-sms-qc-facet-solomon-contract-001.before.${Date.now()}.bak`);
  writeFileSync(backupPath, before, 'utf8');
  console.log(`Before-image saved: ${backupPath}`);

  const after = before.replace(ANCHOR, ANCHOR + CLAUSE_D);

  const must = [IDEMPOTENCY_MARKER, 'own-the-miss-not-defend', ANCHOR];
  const gone = []; // pure append -- nothing removed
  for (const m of must) {
    if (!after.includes(m)) throw new Error(`post-edit verification FAILED: missing required text: ${m.slice(0, 60)}...`);
  }
  for (const g of gone) {
    if (after.includes(g)) throw new Error(`post-edit verification FAILED: forbidden text still present: ${g.slice(0, 60)}...`);
  }
  // Confirm clauses (a)/(b) and the SITE-EDIT rule / Chairman-SMS-lane source clause are untouched.
  const untouchedMarkers = [
    'SITE-EDIT rule',
    'Chairman-SMS-lane source',
    '(a) **Hourly Adam drive/duty-adherence probe with nudge authority**',
    '(b) **PLAN-OF-DAY BLESSING**',
  ];
  for (const u of untouchedMarkers) {
    if (!after.includes(u)) throw new Error(`post-edit verification FAILED: expected unchanged marker missing: ${u}`);
  }

  console.log(`before -> after char count: ${before.length} -> ${after.length} (+${after.length - before.length})`);

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

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('FAILED:', err.message);
    process.exit(1);
  });
}
