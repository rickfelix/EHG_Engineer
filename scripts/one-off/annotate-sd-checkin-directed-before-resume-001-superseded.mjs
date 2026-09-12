#!/usr/bin/env node
/**
 * Annotates SD-LEO-INFRA-CHECKIN-DIRECTED-BEFORE-RESUME-001 (status='completed') as
 * superseded by the coordinator's later directed-assignment-ordering ruling
 * (session_coordination row 8f2e7ed7, correlation 0296599f, on Adam proposal 9bc0157f),
 * encoded into docs/protocol/fleet-worker-loop-directive.md by QF-20260911-553.
 *
 * The SD's title asserted directed-assignment should run categorically before resume; the
 * new ruling narrows this to "never preempts a LIVE, continuously-held claim -- queues and
 * wins at release instead". Metadata-only: does not alter the SD's title, description,
 * status, or historical specimens, which remain the accurate record of what was measured.
 *
 * Run once: node scripts/one-off/annotate-sd-checkin-directed-before-resume-001-superseded.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-INFRA-CHECKIN-DIRECTED-BEFORE-RESUME-001';

const { data: current, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) {
  console.error('READ FAILED:', readErr.message);
  process.exit(1);
}

const metadata = {
  ...(current.metadata || {}),
  superseded_ruling: {
    ruling_source: 'session_coordination:8f2e7ed7',
    ruling_correlation: '0296599f',
    proposal_source: 'adam_proposal:9bc0157f',
    encoded_by: 'QF-20260911-553',
    encoded_at_doc: 'docs/protocol/fleet-worker-loop-directive.md',
    note: 'This SD\'s title asserted directed-assignment runs categorically before resume. '
      + 'The coordinator ruling narrows this: a directed WORK_ASSIGNMENT never preempts a LIVE, '
      + 'continuously-held claim -- it queues and wins at that worker\'s next release. The SD\'s '
      + 'measured specimens remain an accurate historical record; only the title-level categorical '
      + 'assertion is corrected.',
    annotated_at: new Date().toISOString(),
  },
};

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY)
  .select('sd_key')
  .limit(1);
if (error) {
  console.error('UPDATE FAILED:', error.message);
  process.exit(1);
}
console.log('ANNOTATED:', JSON.stringify(data));
