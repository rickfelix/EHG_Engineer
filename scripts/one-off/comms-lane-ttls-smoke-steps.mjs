#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-COMMS-LANE-TTLS-001';

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Seed a session_coordination row with a known payload.kind (e.g. directive) older than that lane\'s registry TTL, and leave it unread.',
    expected_outcome: 'The row is stamped expired-unread (a payload marker, not deleted) -- confirming FR-1\'s TTL registry and expiry-stamping wiring.',
  },
  {
    step_number: 2,
    instruction: 'Seed enough expired-unread rows in one lane to breach the alarm threshold, then trigger the dead-letter alarm check.',
    expected_outcome: 'An alarm event fires and lands on a surface OUTSIDE session_coordination (the quiet-tick summary line, an sms_outbound_obligations row, or the ladder) -- never a new session_coordination row into the same undrained path it monitors. This is the SD\'s own hard, load-bearing constraint.',
  },
  {
    step_number: 3,
    instruction: 'Query the per-lane dead-letter gauge for the coordinator-directive and dispatch_suggestion lanes.',
    expected_outcome: 'The gauge reports a measurable dead-letter rate for each lane, with the 62%/100% pre-fix baseline recorded on the SD for later 30-day re-measurement.',
  },
];

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr || !sd) { console.error('READ ERR', readErr?.message); process.exit(1); }

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ smoke_test_steps })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERR', writeErr.message); process.exit(1); }
console.log('smoke_test_steps written for SD', sd.id);
