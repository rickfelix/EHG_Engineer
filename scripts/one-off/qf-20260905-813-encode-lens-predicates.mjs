#!/usr/bin/env node
/**
 * QF-20260905-813 — encode the twelve Foundation-audit lens PREDICATE + INSTRUMENT + CANARY
 * texts (feedback 5b18d8f4-cf39-44a7-8812-ff242933f010) into the leo_protocol_sections row that
 * renders CLAUDE_SOLOMON_MANUAL.md's "Foundation audit — procedure" section, replacing the
 * bare lens-name-only "Lens halves — A: ...; B: ..." clause.
 *
 * Verbatim per the QF's own SCOPE line: the predicate text is inserted unmodified.
 *
 * Usage: node scripts/one-off/qf-20260905-813-encode-lens-predicates.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');
const SECTION_ID = 629;
const FEEDBACK_ID = '5b18d8f4-cf39-44a7-8812-ff242933f010';
const OLD_CLAUSE =
  'Lens halves — A: sd-state, qf-state, liveness, gate-evidence, writers, comms; B: ratification, durability, roadmap, gauges-learn, instruments, worker-loop.';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: fb, error: fbErr } = await supabase
    .from('feedback')
    .select('id, description')
    .eq('id', FEEDBACK_ID)
    .single();
  if (fbErr) throw new Error(`Failed to fetch feedback ${FEEDBACK_ID}: ${fbErr.message}`);

  const { data: section, error: secErr } = await supabase
    .from('leo_protocol_sections')
    .select('id, title, content')
    .eq('id', SECTION_ID)
    .single();
  if (secErr) throw new Error(`Failed to fetch leo_protocol_sections ${SECTION_ID}: ${secErr.message}`);

  if (!section.content.includes(OLD_CLAUSE)) {
    throw new Error(
      `OLD_CLAUSE not found verbatim in section ${SECTION_ID} -- content has drifted since this QF was filed; re-read before editing.`
    );
  }
  const occurrences = section.content.split(OLD_CLAUSE).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Expected exactly 1 occurrence of OLD_CLAUSE, found ${occurrences} -- refusing an ambiguous replace.`);
  }

  const replacement =
    'Lens halves and predicates (verbatim, feedback 5b18d8f4-cf39-44a7-8812-ff242933f010):\n\n' +
    fb.description.trim() +
    '\n';

  const newContent = section.content.replace(OLD_CLAUSE, replacement);

  console.log(`Section ${SECTION_ID} (${section.title}): ${section.content.length} -> ${newContent.length} chars`);
  console.log(`Feedback ${FEEDBACK_ID} description length: ${fb.description.length} chars`);

  if (DRY_RUN) {
    console.log('DRY RUN -- no write performed.');
    return;
  }

  const { error: updateErr } = await supabase
    .from('leo_protocol_sections')
    .update({ content: newContent })
    .eq('id', SECTION_ID);
  if (updateErr) throw new Error(`Failed to update section ${SECTION_ID}: ${updateErr.message}`);

  console.log(`Section ${SECTION_ID} updated.`);
}

main().catch((err) => {
  console.error(`[qf-20260905-813] fatal: ${err.message}`);
  process.exit(1);
});
