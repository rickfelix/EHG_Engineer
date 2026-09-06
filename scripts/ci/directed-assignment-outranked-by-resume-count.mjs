#!/usr/bin/env node
// @wire-check-exempt: manually-invoked CI predicate script (node scripts/ci/directed-assignment-outranked-by-resume-count.mjs --since <ISO>), no cron/workflow entry point wired yet -- scheduling automation is a separate follow-up, out of this SD's scope.
// directed-assignment-outranked-by-resume-count.mjs — FR-4 of SD-LEO-INFRA-CHECKIN-DIRECTED-BEFORE-RESUME-001.
//
// THE SPECIMEN this SD fixed: WORK_ASSIGNMENT 13655143 (created 13:11:21Z) sat unread while the
// addressed seat resumed a released claim through resume.cjs's rung, only reading/acknowledging
// the directed row 98 minutes later -- the resumable-release claim silently outranked a directed
// dispatch. FR-1's fix (resume.cjs yields to a directed WORK_ASSIGNMENT when the claim was only
// just rediscovered this tick) closes the mechanism; this predicate asserts it stays closed.
//
// PREDICATE: a WORK_ASSIGNMENT row (message_type='WORK_ASSIGNMENT', addressed via target_session,
// naming an SD via payload.sd_key/assigned_sd/target_sd) is an OFFENDER if the addressed seat's
// claim_history (strategic_directives_v2.metadata.claim_history, per-SD) shows THAT SAME SESSION
// claiming a DIFFERENT sd_key at a claimed_at strictly between the row's created_at and read_at.
// A row with read_at still NULL is not yet evaluable (skipped, not counted either way -- the
// window it would test is still open).
//
// SCOPE NOTE (known, not silent): quick_fixes carries no claim_history equivalent, so a directed
// QF assignment outranked by a resumed SD/QF claim is NOT detectable by this predicate today --
// only the strategic_directives_v2 side of the specimen is measurable from stored history.
//
// A zero-denominator window (no evaluable WORK_ASSIGNMENT rows) prints INSUFFICIENT_DATA rather
// than a bare PASS (mirrors chairman-awareness-live-owner-count.mjs's FR-5(c) precedent).
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PREDICATE = 'WORK_ASSIGNMENT rows whose addressed seat claimed a DIFFERENT SD between the row\'s created_at and read_at (resumable-release outranking a directed dispatch)';

function parseArgs(argv) {
  const out = { sinceIso: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--since') out.sinceIso = argv[++i];
  }
  return out;
}

/** Same narrow "directed SD" extraction directed-assignment.cjs's extractSdFromAssignment covers:
 *  payload.sd_key, payload.assigned_sd, or the target_sd column. */
function directedSdOf(row) {
  return row.payload?.sd_key || row.payload?.assigned_sd || row.target_sd || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sinceIso = args.sinceIso || process.env.CHECKIN_DIRECTED_BEFORE_RESUME_MERGE_COMMIT_ISO;
  if (!sinceIso) {
    console.error(JSON.stringify({ status: 'error', error: 'missing --since <ISO timestamp of the merge commit> (or CHECKIN_DIRECTED_BEFORE_RESUME_MERGE_COMMIT_ISO env var)' }));
    process.exitCode = 1;
    return;
  }

  let waRows, sdRows;
  try {
    [waRows, sdRows] = await Promise.all([
      fetchAllPaginated(() => supabase
        .from('session_coordination')
        .select('id, target_session, target_sd, payload, created_at, read_at')
        .eq('message_type', 'WORK_ASSIGNMENT')
        .gte('created_at', sinceIso)),
      fetchAllPaginated(() => supabase
        .from('strategic_directives_v2')
        .select('sd_key, metadata')
        .not('metadata->claim_history', 'is', null)),
    ]);
  } catch (e) {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exitCode = 1;
    return;
  }

  // Flatten claim_history across every SD into one list of claim EVENTS, so a per-row check is a
  // simple filter rather than a scan-per-row of the whole table.
  const claimEvents = [];
  for (const sd of (sdRows || [])) {
    const history = Array.isArray(sd.metadata?.claim_history) ? sd.metadata.claim_history : [];
    for (const entry of history) {
      if (!entry?.session_id || !entry?.claimed_at) continue;
      claimEvents.push({ sd_key: sd.sd_key, session_id: entry.session_id, claimed_at: Date.parse(entry.claimed_at) });
    }
  }

  const evaluable = (waRows || []).filter((r) => r.target_session && r.read_at && directedSdOf(r));
  const denominator = evaluable.length;
  if (denominator === 0) {
    console.log(JSON.stringify({
      status: 'INSUFFICIENT_DATA', denominator: 0, count: 0, since: sinceIso, predicate: PREDICATE,
      note: 'Zero evaluable (read, keyed, addressed) WORK_ASSIGNMENT rows since the given timestamp -- this is NOT the same as zero defects.',
    }, null, 2));
    return;
  }

  const offenders = [];
  for (const wa of evaluable) {
    const assignedSd = directedSdOf(wa);
    const createdMs = Date.parse(wa.created_at);
    const readMs = Date.parse(wa.read_at);
    const intervening = claimEvents.filter((e) =>
      e.session_id === wa.target_session
      && e.sd_key !== assignedSd
      && e.claimed_at > createdMs
      && e.claimed_at < readMs);
    if (intervening.length) {
      offenders.push({
        work_assignment_id: wa.id,
        seat: wa.target_session,
        assigned_sd: assignedSd,
        created_at: wa.created_at,
        read_at: wa.read_at,
        outranking_claims: intervening.map((e) => ({ sd_key: e.sd_key, claimed_at: new Date(e.claimed_at).toISOString() })),
      });
    }
  }

  const result = {
    status: offenders.length === 0 ? 'PASS' : 'FAIL',
    denominator, count: offenders.length, since: sinceIso, predicate: PREDICATE,
    offenders,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}

if (process.argv[1] && /directed-assignment-outranked-by-resume-count\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exitCode = 1;
  });
}

export { directedSdOf };
