#!/usr/bin/env node
/**
 * park-blocked-claim.cjs — the correct, single-command response when a CLAIMED SD is
 * BLOCKED on something a worker may NOT self-resolve (authorization for an irreversible
 * action, a prod migration that belongs to the database sub-agent, a chairman gate, an
 * external dependency, etc.).
 *
 * It makes loop-rule 4b executable in one step:
 *   1) /signal the specific blocker to the active coordinator (canonical worker-signal),
 *   2) record the blocker on the SD and RELEASE the claim (park — recoverable; push WIP first),
 *   3) print next-step guidance (claim a DIFFERENT unblocked SD).
 *
 * Why this exists (the failure it prevents): a worker that hits a blocker must NOT
 * self-authorize the irreversible action, and must NOT silently re-arm a ScheduleWakeup
 * to retry the same blocked claim ("the wakeup-bypasses-the-blocker hole"). Authorization
 * and blocker-resolution are the coordinator's lane (which escalates to the chairman) — a
 * worker escalates, parks, and switches to buildable work.
 *
 * Usage:
 *   node scripts/park-blocked-claim.cjs <SD-KEY> --reason "<what is blocked + why a worker can't resolve it>"
 *       [--type stuck|spec-conflict|gate-bug|other]   (default: stuck)
 *       [--severity low|medium|high|critical]         (default: high)
 *       [--no-signal]    (skip the coordinator signal — record + release only)
 *       [--no-release]   (record the blocker but KEEP the claim — rare; default releases)
 *
 * CLAUDE_SESSION_ID must be set (the SessionStart hook provides it). The claim is released
 * only if THIS session holds it (claiming_session_id === CLAUDE_SESSION_ID).
 */

const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Pure decision core (unit-tested): given the live SD row + this session + the blocker
 * reason, produce the metadata patch and whether to release the claim.
 *
 * - The blocker is recorded under metadata.blocker so the SD carries WHY it parked.
 * - The claim is released ONLY when this session actually holds it (never steal/clear a
 *   foreign session's claim), and only when releaseRequested is true.
 *
 * @param {{ sd: {metadata?:object, claiming_session_id?:string|null}, sessionId: string,
 *           reason: string, nowIso: string, releaseRequested?: boolean }} args
 * @returns {{ metadataPatch: object, releaseClaim: boolean }}
 */
function buildParkPatch({ sd, sessionId, reason, nowIso, releaseRequested = true }) {
  const existing = (sd && sd.metadata) || {};
  const metadataPatch = {
    ...existing,
    blocker: {
      reason: String(reason || '').slice(0, 1000),
      status: 'open',
      signalled_at: nowIso,
      parked_by: sessionId || null,
    },
  };
  const holdsClaim = Boolean(sessionId) && sd && sd.claiming_session_id === sessionId;
  return { metadataPatch, releaseClaim: Boolean(releaseRequested) && holdsClaim };
}

function parseArgs(argv) {
  const out = { _: [], type: 'stuck', severity: 'high', signal: true, release: true, reason: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-signal') out.signal = false;
    else if (a === '--no-release') out.release = false;
    else if (a === '--reason') out.reason = argv[++i];
    else if (a === '--type') out.type = argv[++i];
    else if (a === '--severity') out.severity = argv[++i];
    else if (!a.startsWith('--')) out._.push(a);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sdKey = args._[0];
  const reason = args.reason || args._.slice(1).join(' ');
  if (!sdKey || !reason) {
    console.error('Usage: node scripts/park-blocked-claim.cjs <SD-KEY> --reason "<blocker>" [--type <t>] [--severity <s>] [--no-signal] [--no-release]');
    process.exit(2);
  }
  const sessionId = process.env.CLAUDE_SESSION_ID || '';
  if (!sessionId) {
    console.error('park-blocked-claim: CLAUDE_SESSION_ID not set — cannot identify the claiming session.');
    process.exit(2);
  }

  require('dotenv').config();
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Load the live SD row (resolve by sd_key OR id).
  const { data: rows, error: selErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status, claiming_session_id, metadata')
    .or(`sd_key.eq.${sdKey},id.eq.${sdKey}`)
    .limit(1);
  if (selErr) { console.error('park-blocked-claim: SD lookup failed:', selErr.message); process.exit(1); }
  const sd = rows && rows[0];
  if (!sd) { console.error(`park-blocked-claim: SD not found: ${sdKey}`); process.exit(1); }

  // 1) Signal the blocker to the coordinator (canonical worker-signal — fail-soft).
  let signalled = false;
  if (args.signal) {
    try {
      execFileSync('node', [
        path.join(__dirname, 'worker-signal.cjs'), args.type, reason,
        '--severity', args.severity, '--links-sd', sd.sd_key,
      ], { stdio: 'inherit' });
      signalled = true;
    } catch (e) {
      console.error(`park-blocked-claim: coordinator signal failed (continuing to park): ${e.message}`);
    }
  }

  // 2) Record the blocker + release the claim (only if this session holds it).
  const nowIso = new Date().toISOString();
  const { metadataPatch, releaseClaim } = buildParkPatch({
    sd, sessionId, reason, nowIso, releaseRequested: args.release,
  });
  const update = { metadata: metadataPatch };
  if (releaseClaim) update.claiming_session_id = null;
  const { error: updErr } = await supabase
    .from('strategic_directives_v2').update(update).eq('id', sd.id);
  if (updErr) { console.error('park-blocked-claim: SD update failed:', updErr.message); process.exit(1); }

  // 3) Guidance.
  console.log('');
  console.log(`🅿️  Parked blocked claim: ${sd.sd_key}`);
  console.log(`   blocker:   ${reason.slice(0, 200)}`);
  console.log(`   signalled: ${signalled ? `yes (coordinator, ${args.type}/${args.severity})` : 'no'}`);
  console.log(`   claim:     ${releaseClaim ? 'RELEASED (parked recoverable — ensure WIP is pushed)' : 'kept (not held by this session, or --no-release)'}`);
  console.log('   next:      do NOT re-arm a wakeup to retry this SD. Run /checkin to claim a DIFFERENT unblocked SD.');
  console.log('');
}

if (require.main === module) {
  main().catch((e) => { console.error('park-blocked-claim UNHANDLED:', e.message || e); process.exit(1); });
}

module.exports = { buildParkPatch, parseArgs };
