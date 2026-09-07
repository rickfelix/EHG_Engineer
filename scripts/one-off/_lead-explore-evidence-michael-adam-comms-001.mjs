#!/usr/bin/env node
/**
 * LEAD-phase Explore evidence for SD-LEO-INFRA-MICHAEL-ADAM-COMMS-001.
 *
 * The SD as filed has THREE claims in its title, none measured. This session personally
 * opened every file cited below (Read/Grep, not guessed) and found the claims are a MIX:
 * one is a deliberate, spec-documented design (not a defect), two are confirmed, real,
 * source-grounded defects.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'SD-LEO-INFRA-MICHAEL-ADAM-COMMS-001';

const findings = [
  {
    id: 'E1-no-michael-advisory-sender-is-deliberate-not-a-gap',
    severity: 'INFO',
    summary:
      "The filed claim \"no michael-advisory sender\" is TRUE (no scripts/michael-advisory.cjs exists, unlike the sibling scripts/adam-advisory.cjs and scripts/solomon-advisory.cjs) but is NOT a defect -- it is a deliberate, spec-documented design. scripts/michael-register.cjs:405-417's michaelReplyMirror() states explicitly: \"Michael SENDS nothing to the fleet: fleet-class items reach Adam as chairman_handoff rows with origin michael, batched once per morning by the feeders (spec §1.2).\" scripts/michael-inbox.cjs:5-7's own header confirms: \"Michael's seat SENDS NOTHING through this path (michael-register.cjs:407) -- this file is inbox-only, no send/request surface.\" DISPOSITION: DESCOPED from this SD -- zero callers expect a michael-advisory.cjs sender; building one would contradict the spec.",
  },
  {
    id: 'E2-michael-inbox-drainInbox-never-writes-back-a-lifecycle-column-CONFIRMED',
    severity: 'CRITICAL',
    summary:
      "The filed claim \"michael-inbox never consumes\" is CONFIRMED, source-grounded. scripts/michael-inbox.cjs's drainInbox() (lines 48-93) SELECTs unread rows (`.is('read_at', null)` at line 53), filters, prints them -- and contains NO UPDATE call anywhere in the function. Compare to the sibling it claims to mirror: scripts/solomon-advisory.cjs:532 stamps `read_at` on every surfaced row (`await supabase.from('session_coordination').update({ read_at: now }).in('id', ids).is('read_at', null)`), part of Solomon's documented two-stage ACK (line 413-415: surfaced rows stamped read_at = DELIVERED, acknowledged_at stamped separately when actioned). Michael's drainInbox has NO equivalent write-back at all -- despite its own header (line 5) claiming to mirror Solomon's structural shape, it does not mirror the one behavior that makes a drain actually drain. CONSEQUENCE: the exact same rows resurface on every single invocation forever; the function reads but never advances state -- a requirement dead by construction while reading as wired (a full function exists, is called from the quiet-tick guidance line, prints real output) but never actually consumes anything. ROOT CAUSE, per scripts/michael-register.cjs:406-416's michaelReplyMirror() comment: \"(michael-inbox.cjs ships in child G; until then the drain is a documented no-op.)\" -- child G (SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-G, cited in michael-inbox.cjs's own header) shipped the STRUCTURE but this specific comment in the calling file was never updated, and the write-back step itself was apparently never implemented even though the surrounding function is real. Not a stub -- a genuinely incomplete drain.",
  },
  {
    id: 'E3-two-readers-key-different-lifecycle-columns-CONFIRMED',
    severity: 'HIGH',
    summary:
      "The filed claim \"its two readers key different columns\" is CONFIRMED. Reader 1: scripts/michael-inbox.cjs:53's drainInbox query filters `.is('read_at', null)` -- Michael's inbox is conceptually read_at-keyed. Reader 2: scripts/michael-quiet-tick.mjs:113-115's inbox-nudge counter (the line that produces the `QUIET_TICK_INBOX_DIRECTIVE=michael count=N` guidance Michael's own loop reads) queries `q.eq('target_session', sid).is('acknowledged_at', null).in('payload->>kind', inboxKinds)` -- keyed on `acknowledged_at`, a DIFFERENT column. Since E2 establishes drainInbox writes to NEITHER column, both readers are currently stuck showing the same permanently-undrained state regardless of how many times Michael runs the drain -- but the column mismatch is independently real: even after E2 is fixed to stamp one column, the two readers would still disagree unless the SAME column is chosen for both. PRECEDENT for the design choice: scripts/adam-quiet-tick.mjs:142-145 documents a THREE-stage precedent from SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 (delivered_at for background/cron surfacing that must NOT count as consumed, read_at for genuine interactive surfacing) -- but that split exists specifically because Adam's inbox-monitor core runs in `--background` mode with truncated stdout. Michael's michael-inbox.cjs has NO `--background` mode and no acknowledgment mechanism at all (confirmed: grep for an acknowledged_at WRITE in michael-inbox.cjs returns nothing) -- michael-inbox.cjs:11's own header states Michael's lane deliberately does NOT need \"a dedicated first-class branch the way Solomon's oracle-cost lane requires\". Michael's design is a SINGLE-stage model (unlike Solomon's two-stage or Adam's three-stage), so `read_at` is the correct single lifecycle column for both readers -- quiet-tick's counter should switch from `acknowledged_at` to `read_at` to match, not the other way around (there is no separate acknowledgment step to key on).",
  },
];

const summary =
  'LEAD-phase Explore investigation of SD-LEO-INFRA-MICHAEL-ADAM-COMMS-001, filed with three unmeasured claims. Personally verified against live source: claim 1 (no michael-advisory sender) is a deliberate, spec-documented design (michael-register.cjs:405-417, michael-inbox.cjs:5-7) -- DESCOPED, not a defect. Claims 2 and 3 are CONFIRMED, source-grounded defects: michael-inbox.cjs:48-93 drainInbox() reads unread rows but never writes back any lifecycle column (no read_at, no acknowledged_at stamp anywhere in the function), so nothing is ever actually drained -- despite the function existing, being called, and printing real output. Independently, its own would-be consumer (michael-quiet-tick.mjs:113-115) keys its nudge counter on acknowledged_at while the drain conceptually operates on read_at -- a genuine column mismatch that would persist even after the write-back gap is closed, unless both are unified onto the same column. Michael has no two-stage ack model (unlike Solomon) and no background/cron split (unlike Adam) by its own documented design, so read_at is the correct single column for both.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'EXPLORE',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 92,
    findings,
    warnings: [],
    recommendations: [
      'PLAN should scope FR-1 to closing the write-back gap in michael-inbox.cjs:48-93 (stamp read_at on every surfaced row, mirroring solomon-advisory.cjs:532), and FR-2 to unifying michael-quiet-tick.mjs:113-115 onto the same read_at column, dropping the michaelReplyMirror() stale "documented no-op" comment in michael-register.cjs.',
      'A michael-advisory.cjs sender is explicitly OUT OF SCOPE -- building one would contradict the spec-documented receive-only design (michael-register.cjs:405-417).',
    ],
    metadata: {
      review_type: 'LEAD_EXPLORE_PREMISE_VERIFICATION',
      files_reviewed: [
        'scripts/michael-inbox.cjs',
        'scripts/michael-register.cjs',
        'scripts/michael-quiet-tick.mjs',
        'scripts/solomon-advisory.cjs',
        'scripts/adam-quiet-tick.mjs',
      ],
      model: 'Sonnet 5',
      invoked_at: new Date().toISOString(),
    },
    summary,
    phase: 'LEAD',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'EXPLORE',
    SD_ID,
    { name: 'Explore (LEAD-phase premise verification)' },
    results,
    { sdKey: SD_ID, phase: 'LEAD' }
  );

  console.log('VERDICT WRITTEN:', stored.id, stored.verdict, stored.confidence);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
