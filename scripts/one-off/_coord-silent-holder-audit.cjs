// Silent-holder audit, v2. WORK PRODUCT is the discriminator — never loop_state/started_at.
// v1 had TWO defects of the same family and both read as "healthy":
//   (a) queried a column that does not exist (from_session); the error was never checked, the
//       empty result was read as "this worker has NEVER signalled" — a swallowed error became
//       a negative finding. The column is sender_session.
//   (b) a null last-signal fell through to silent=false and printed "ok (signalled within 3h)",
//       i.e. the MOST silent possible holder scored as the healthiest. A missing value is not
//       a negative result. Now: no signal ever -> fall back to claimed_at and treat as silent.
require('dotenv').config();
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const THREE_H = 3 * 3600 * 1000;

// QF-20260728-193: an SD "at an approval boundary" is legitimately producing zero commits/
// signals while it waits on a human decision that is not the worker's to make -- silence there
// is the CORRECT, EXPECTED shape, not stalled. Live false positive: Alpha (status=pending_approval,
// current_phase=LEAD_FINAL, progress=90%, PR merged) tripped both audit axes hourly while the
// stale-session-sweep itself printed "awaiting LEAD-FINAL-APPROVAL" on the same tick. Mirrors the
// SAME condition scripts/stale-session-sweep.cjs already computes for its own "QA: skipped reset"
// skip logic -- reused, not reinvented. Exported for tests.
function isApprovalBoundarySd({ status, current_phase } = {}) {
  return status === 'pending_approval' || /^LEAD_FINAL/.test(current_phase || '');
}

async function runAudit() {
  const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const now = Date.now();

  const { data: sess, error: se } = await sb.from('claude_sessions')
    .select('session_id,sd_key,metadata,heartbeat_at,claimed_at').not('sd_key', 'is', null);
  if (se) { console.log('*** HOLDER QUERY FAILED: ' + se.message + ' — aborting, NOT reporting zero ***'); return; }

  const allHolders = (sess || []).filter((s) => s.sd_key);

  let boundarySdKeys = new Set();
  if (allHolders.length) {
    const { data: sdRows, error: se2 } = await sb.from('strategic_directives_v2')
      .select('sd_key,status,current_phase').in('sd_key', allHolders.map((h) => h.sd_key));
    if (se2) { console.log('*** SD BOUNDARY QUERY FAILED: ' + se2.message + ' — proceeding without the exclusion ***'); }
    else boundarySdKeys = new Set((sdRows || []).filter(isApprovalBoundarySd).map((sd) => sd.sd_key));
  }

  const holders = allHolders.filter((h) => !boundarySdKeys.has(h.sd_key));
  const skipped = allHolders.length - holders.length;
  console.log('holders of an sd_key claim: ' + allHolders.length
    + (skipped ? ' (' + skipped + ' skipped — approval boundary, not evaluated)' : ''));
  console.log('');
  const nudge = [];

  for (const h of holders) {
    const cs = (h.metadata || {}).callsign || '?';
    const short = String(h.session_id).slice(0, 8);

    const { data: sigs, error: e1 } = await sb.from('session_coordination')
      .select('created_at,payload').eq('sender_session', h.session_id)
      .not('payload->>signal_type', 'is', null)
      .order('created_at', { ascending: false }).limit(1);
    if (e1) { console.log('  ' + cs + ' ' + short + ' — SIGNAL QUERY FAILED: ' + e1.message + ' (skipping, not scoring)'); continue; }

    const lastSig = sigs && sigs.length ? Date.parse(sigs[0].created_at) : null;
    const baseline = lastSig !== null ? lastSig : (h.claimed_at ? Date.parse(h.claimed_at) : null);
    const ageH = baseline !== null ? (now - baseline) / 3600000 : null;
    const silent = ageH === null ? true : ageH > 3;   // unknown => treat as silent, never as healthy

    let commits = 'n/a', branch = '-';
    try {
      branch = execSync('git branch -a --list "*' + h.sd_key + '*" --format="%(refname:short)"',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0] || '-';
      if (branch && branch !== '-') {
        // The directive is "no work product IN THAT WINDOW" — the SILENCE window, not a fixed 3h.
        // Was a fixed THREE_H, which asks a different question than the rule and biases false
        // nudges toward the seats silent LONGEST: a holder silent 12.5h whose PR moved 3.9h ago
        // has work product in its window and read as having none. Found live on Alpha-3.
        // Floor at 3h so a just-crossed holder is still judged over the full threshold.
        const lookbackMs = Math.max(THREE_H, ageH !== null ? ageH * 3600000 : THREE_H);
        const since = new Date(now - lookbackMs).toISOString();
        commits = execSync('git log ' + branch + ' --since="' + since + '" --oneline',
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean).length;
      } else { commits = 0; }
    } catch (e) { commits = 'branch-unreadable'; }

    const { data: pend, error: e2 } = await sb.from('session_coordination')
      .select('id,created_at,acknowledged_at').eq('target_session', h.session_id)
      .eq('payload->>request_type', 'status_or_release')
      // CARRIER FIX (2026-07-29): isCoordinatorPush (worker-checkin.cjs:466-481) surfaces ONLY
      // COACHING and INFO. A status request sent as CLAIM_REMINDER or WORK_ASSIGNMENT can never
      // reach the worker — yet an unanswered one made this guard SKIP the holder forever. The
      // guard's input was evidence of NON-delivery read as evidence of progress. Measured live:
      // 3 of 4 outstanding requests were on dead carriers; the one INFO row was read AND acked.
      .in('message_type', ['COACHING', 'INFO'])
      .order('created_at', { ascending: false }).limit(1);
    if (e2) { console.log('  ' + cs + ' ' + short + ' — PENDING QUERY FAILED: ' + e2.message + ' (skipping)'); continue; }
    const pending = pend && pend.length && !pend[0].acknowledged_at;

    // DIRECTIVE says work product is 'no PR, no commits on the claim branch'. This tool only
    // ever checked commits, so a holder who opened a PR minutes ago with no new commits would be
    // wrongly nudged. Found live on Alpha-3, which HAS an open PR (#6644) — stale, but present.
    let prAct = 0, prNote = 'none';
    if (branch && branch !== '-') {
      try {
        const bare = branch.indexOf('origin/') === 0 ? branch.slice(7) : branch;
        const raw = execSync('gh pr list --head ' + bare + ' --state open --json number,updatedAt',
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const prs = JSON.parse(raw || '[]');
        // Same silence-window semantics as the commit lookback above — a PR that moved inside the
        // holder's own silence window IS work product, even if it predates a fixed 3h slice.
        const prLookbackMs = Math.max(THREE_H, ageH !== null ? ageH * 3600000 : THREE_H);
        prAct = prs.filter((r) => (now - Date.parse(r.updatedAt)) < prLookbackMs).length;
        prNote = prs.length ? prs.map((r) => '#' + r.number + ' upd ' + ((now - Date.parse(r.updatedAt)) / 3600000).toFixed(1) + 'h') .join(', ') : 'none';
      } catch (e) { prNote = 'gh-unreadable'; }
    }
    const noWork = commits === 0 && prAct === 0;
    let verdict;
    // ORDERING FIX 2026-07-29. The `pending` skip used to be tested FIRST, which made a stale
    // status request a PERMANENT exemption: a seat nudged once, that then went back to work and
    // never explicitly answered, was skipped forever — the request only retires on an explicit
    // reply, never on behaviour. Observed live on 0db9d282, skipped while signalling 1.0h ago
    // with 6 commits. WORK PRODUCT IS THE DISCRIMINATOR (the loop's own stated rule), so it must
    // be consulted before the no-re-nudge suppression, not after it. A holder that is demonstrably
    // working has answered the question the pending request asked, whether or not it typed a reply.
    // The suppression still does its real job: it only fires when the seat is BOTH silent AND
    // showing no work product, which is the only case the nudge would have re-fired on anyway.
    if (!silent) verdict = 'ok — signalled ' + ageH.toFixed(2) + 'h ago';
    else if (!noWork) verdict = 'ok — silent ' + (ageH === null ? '(unknown)' : ageH.toFixed(2) + 'h') + ' BUT work product present (' + commits + ' commit(s))';
    else if (pending) verdict = 'SKIP — silent AND no work product, but status request already pending, no re-nudge';
    else if (silent && noWork) { verdict = '*** NUDGE — silent >3h AND no work product ***'; nudge.push({ h, cs }); }
    else if (!silent) verdict = 'ok — signalled ' + ageH.toFixed(2) + 'h ago';
    else verdict = 'ok — silent ' + (ageH === null ? '(unknown)' : ageH.toFixed(2) + 'h') + ' BUT work product present (' + commits + ' commit(s))';

    console.log('  ' + String(cs).padEnd(10) + short + '  ' + String(h.sd_key).slice(0, 44));
    console.log('        last signal: ' + (lastSig === null ? 'NONE EVER (baseline=claimed_at)' : ageH.toFixed(2) + 'h ago') +
      '   commits<3h: ' + commits + '   open PR: ' + prNote);
    console.log('        -> ' + verdict);
  }
  console.log('');
  console.log('NUDGE LIST: ' + (nudge.length ? nudge.map((n) => n.cs + '/' + String(n.h.session_id).slice(0, 8)).join(', ') : '(none)'));
}

if (require.main === module) runAudit();

module.exports = { isApprovalBoundarySd };
