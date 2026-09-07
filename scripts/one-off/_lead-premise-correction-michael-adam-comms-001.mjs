#!/usr/bin/env node
/**
 * LEAD premise correction for SD-LEO-INFRA-MICHAEL-ADAM-COMMS-001, per Explore evidence
 * row ebd495c1-a75c-4f32-8470-99f7acece857 (confidence 92, phase=LEAD).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-MICHAEL-ADAM-COMMS-001';

const CORRECTED_SUCCESS_CRITERIA = [
  {
    criterion: 'michael-inbox.cjs actually drains: a row surfaced by drainInbox() is stamped read_at and does not resurface on the next invocation.',
    measure: 'A test drives drainInbox() against real (or fixture) unread session_coordination rows targeting Michael, asserts read_at is stamped on every returned row, and asserts a second call returns zero of the same rows. Baseline measured 2026-09-07: michael-inbox.cjs:48-93 currently contains no UPDATE call at all -- the same rows resurface forever.',
  },
  {
    criterion: "michael-quiet-tick.mjs's inbox-nudge counter and michael-inbox.cjs's drain key the SAME lifecycle column, so a genuine drain clears the nudge.",
    measure: "A test runs runQuietTick() before and after a drainInbox() call over the same fixture rows and asserts the inbox count drops to 0 post-drain. Baseline: michael-quiet-tick.mjs:113-115 filters on acknowledged_at while michael-inbox.cjs:53 filters on read_at -- two different columns, neither ever written by the drain.",
  },
  {
    criterion: 'LEAD-CORRECTED (was filed as a gap, verified as deliberate design): no michael-advisory.cjs sender is required. Michael remains receive-only per spec §1.2 -- fleet-class items from Michael reach Adam as chairman_handoff rows via the feeders, never a direct advisory send.',
    measure: 'A regression/static-guard test asserts scripts/michael-register.cjs:405-417 and scripts/michael-inbox.cjs:5-7 continue to document and enforce Michael as send-nothing; no scripts/michael-advisory.cjs is created by this SD.',
  },
  {
    criterion: 'The stale "documented no-op ... until child G" comment in michael-register.cjs is corrected once the write-back gap closes, so future readers are not misled about child G\'s actual (incomplete) state.',
    measure: 'A diff review confirms michael-register.cjs:406-416\'s michaelReplyMirror() comment is updated to reflect the fixed drain, not left describing a no-op that the file itself no longer is.',
  },
];

const LEAD_CORRECTION_NOTE = `

---
LEAD PREMISE CORRECTION (2026-09-07, Alpha-5 worker session bc70bff7, per Explore evidence
row ebd495c1-a75c-4f32-8470-99f7acece857 confidence=92, phase=LEAD):

The SD was filed with three unmeasured claims in its title. Personally verified against live
source (Read/Grep on scripts/michael-inbox.cjs, scripts/michael-register.cjs,
scripts/michael-quiet-tick.mjs, scripts/solomon-advisory.cjs, scripts/adam-quiet-tick.mjs):

CLAIM 1 ("no michael-advisory sender") -- TRUE BUT NOT A DEFECT. DESCOPED. Michael is
deliberately receive-only per spec §1.2: scripts/michael-register.cjs:405-417's
michaelReplyMirror() states "Michael SENDS nothing to the fleet: fleet-class items reach Adam
as chairman_handoff rows ... batched once per morning by the feeders." Building a
michael-advisory.cjs sender would contradict the spec. This SD does NOT create one.

CLAIM 2 ("michael-inbox never consumes") -- CONFIRMED, source-grounded. michael-inbox.cjs's
drainInbox() (lines 48-93) SELECTs unread rows (read_at IS NULL) and prints them, but contains
NO write-back anywhere in the function -- unlike solomon-advisory.cjs:532, which it claims to
structurally mirror but does not mirror in this one behavior. The same rows resurface forever.
Root cause per michael-register.cjs's own (now-stale) comment: "(michael-inbox.cjs ships in
child G; until then the drain is a documented no-op.)" -- child G shipped the function
structure but the write-back step was never implemented.

CLAIM 3 ("its two readers key different columns") -- CONFIRMED. michael-inbox.cjs:53 filters
read_at IS NULL; michael-quiet-tick.mjs:113-115 filters acknowledged_at IS NULL. Michael's
design has no two-stage ack model (unlike Solomon) and no background/cron split (unlike
Adam's documented SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 precedent) -- michael-inbox.cjs
:11 explicitly says Michael's lane does not need Solomon's dedicated-branch complexity. LEAD
RULING: unify both readers onto read_at (the single lifecycle column matching Michael's
single-stage design), not onto acknowledged_at -- there is no separate acknowledgment step to
key on for this role.

PLAN should build the PRD around exactly two functional requirements: (FR-1) stamp read_at in
michael-inbox.cjs's drainInbox() on every surfaced row, mirroring solomon-advisory.cjs:532's
exact pattern; (FR-2) switch michael-quiet-tick.mjs's inbox-nudge query from acknowledged_at to
read_at, and correct michael-register.cjs's stale "documented no-op" comment. No sender script,
no schema changes, no third FR.`;

async function main() {
  const { data: current, error: readError } = await supabase
    .from('strategic_directives_v2')
    .select('description')
    .eq('sd_key', SD_KEY)
    .single();
  if (readError) { console.error('READ FAILED:', readError.message); process.exit(1); }

  if (current.description.includes('LEAD PREMISE CORRECTION')) {
    console.log('Already applied. No-op.');
    process.exit(0);
  }

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      success_criteria: CORRECTED_SUCCESS_CRITERIA,
      description: current.description + LEAD_CORRECTION_NOTE,
    })
    .eq('sd_key', SD_KEY);

  if (updateError) { console.error('UPDATE FAILED:', updateError.message); process.exit(1); }

  const { data: verify } = await supabase
    .from('strategic_directives_v2')
    .select('description, success_criteria')
    .eq('sd_key', SD_KEY)
    .single();

  console.log('Updated. Description contains correction note:', verify.description.includes('LEAD PREMISE CORRECTION'));
  console.log('success_criteria count:', verify.success_criteria.length);
}

if (isMainModule(import.meta.url)) {
  main();
}
