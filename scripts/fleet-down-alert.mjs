// fleet-down-alert.mjs — SD-LEO-INFRA-FLEET-DOWN-EMAIL-ALERT-001
//
// Chairman directive: when the fleet cold-dies to 0 workers, the operator currently can't be
// reached — claimable work sits stranded until a human happens to notice. This alert emails the
// operator on a SUSTAINED fleet-down with claimable work waiting.
//
// CRITICAL: this MUST run in always-on GitHub Actions (mirroring fleet-worker-pulse-cron.yml),
// NOT in the coordinator-audit path — that path DIES WITH THE COORDINATOR, exactly when the alert
// is needed most.
//
// Oscillation-robust (fleet-health is an AVERAGE-over-window, not point-in-time): a single
// active_count==0 dip self-recovers as /loop workers cycle (complete→park→self-claim). Only a
// SUSTAINED window (≈3 consecutive 15-min pulses == ~45min, all active==0) is a real outage.
// Edge-triggered dedup: fire ONCE when sustained-down is first confirmed (the pulse just before the
// window was still up, or there is no prior pulse); do NOT re-spam every 15 min during a long
// outage. The next alert only fires after the fleet recovers (a pulse>0) and goes down again.

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'url';
import path from 'path';

const REQUIRED_CONSECUTIVE = Number(process.env.FLEET_DOWN_CONSECUTIVE_PULSES) > 0
  ? Number(process.env.FLEET_DOWN_CONSECUTIVE_PULSES)
  : 3;

/**
 * Pure decision: should we email the operator that the fleet is sustained-down?
 *
 * @param {Object} args
 * @param {Array<{active_count:number}>} args.pulses - recent fleet_worker_pulse rows, NEWEST FIRST.
 * @param {number} args.claimableCount - count of claimable work items (SDs/QFs) waiting.
 * @param {number} [args.requiredConsecutive=3] - consecutive all-zero pulses that define sustained-down.
 * @returns {{alert:boolean, reason:string, consecutiveZero:number}}
 */
export function evaluateFleetDownAlert({ pulses, claimableCount, requiredConsecutive = 3 } = {}) {
  const rows = Array.isArray(pulses) ? pulses : [];
  const claimable = Number.isFinite(claimableCount) ? claimableCount : 0;
  const n = Number.isFinite(requiredConsecutive) && requiredConsecutive > 0 ? requiredConsecutive : 3;

  // Count the leading run of active==0 pulses (newest first).
  let consecutiveZero = 0;
  for (const p of rows) {
    if (p && Number(p.active_count) === 0) consecutiveZero += 1;
    else break;
  }

  if (claimable <= 0) {
    return { alert: false, reason: 'no claimable work — not an alert condition (do not alarm on an idle, empty queue)', consecutiveZero };
  }
  if (rows.length < n) {
    return { alert: false, reason: `insufficient pulse history (${rows.length} < ${n}) — cannot confirm a sustained outage`, consecutiveZero };
  }
  const windowAllZero = rows.slice(0, n).every((p) => p && Number(p.active_count) === 0);
  if (!windowAllZero) {
    return { alert: false, reason: `fleet active within the last ${n} pulses (not sustained-down)`, consecutiveZero };
  }
  // Edge-trigger dedup: suppress if the pulse just BEFORE the window was also 0 (already alerted on
  // this down-episode). Fire when the prior pulse was up (>0) or there is no prior pulse.
  const prior = rows[n];
  if (prior && Number(prior.active_count) === 0) {
    return { alert: false, reason: 'sustained-down already alerted earlier in this outage (edge-trigger dedup)', consecutiveZero };
  }
  return {
    alert: true,
    reason: `FLEET DOWN: ${n} consecutive pulses with active_count=0 (~${n * 15}min) and ${claimable} claimable item(s) stranded`,
    consecutiveZero,
  };
}

function buildEmail({ claimableCount, consecutiveZero, requiredConsecutive }) {
  const subject = `🛑 LEO fleet DOWN — 0 active workers, ${claimableCount} item(s) stranded`;
  const text = [
    `The LEO fleet has had 0 active workers across ${requiredConsecutive} consecutive pulses (~${requiredConsecutive * 15} min).`,
    `${claimableCount} claimable work item(s) are waiting and nothing is picking them up.`,
    '',
    'This alert runs in always-on GitHub Actions (independent of the coordinator), so it fires even',
    'when the coordinator itself is down. Start a worker / coordinator to drain the belt.',
  ].join('\n');
  const html = `<h2>🛑 LEO fleet DOWN</h2>
<p>The LEO fleet has had <strong>0 active workers</strong> across ${requiredConsecutive} consecutive pulses (~${requiredConsecutive * 15} min).</p>
<p><strong>${claimableCount}</strong> claimable work item(s) are waiting and nothing is picking them up.</p>
<p>This alert runs in always-on GitHub Actions (independent of the coordinator), so it fires even when the coordinator itself is down. Start a worker / coordinator to drain the belt.</p>`;
  return { subject, text, html };
}

async function main() {
  const DRY = !!process.env.FLEET_DOWN_ALERT_DRYRUN || process.argv.includes('--dry-run');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[fleet-down-alert] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // Read one more than the window so the edge-trigger dedup can inspect the pulse before it.
  const { data: pulses, error: pErr } = await db
    .from('fleet_worker_pulse')
    .select('active_count, captured_at')
    .order('captured_at', { ascending: false })
    .limit(REQUIRED_CONSECUTIVE + 1);
  if (pErr) { console.error('[fleet-down-alert] pulse query failed:', pErr.message); process.exit(2); }

  // Claimable-work-exists: count candidates the fleet could pick up right now.
  const { count: claimableCount, error: cErr } = await db
    .from('v_sd_next_candidates')
    .select('*', { count: 'exact', head: true });
  if (cErr) { console.error('[fleet-down-alert] claimable query failed:', cErr.message); process.exit(2); }

  const verdict = evaluateFleetDownAlert({
    pulses: pulses || [],
    claimableCount: claimableCount || 0,
    requiredConsecutive: REQUIRED_CONSECUTIVE,
  });
  console.log(`[fleet-down-alert] ${verdict.alert ? 'ALERT' : 'no-alert'}: ${verdict.reason}`);

  if (!verdict.alert) return;

  const email = buildEmail({ claimableCount: claimableCount || 0, consecutiveZero: verdict.consecutiveZero, requiredConsecutive: REQUIRED_CONSECUTIVE });
  const to = process.env.CLAUDE_NOTIFY_EMAIL;
  if (DRY || !to) {
    console.log(`[fleet-down-alert]${DRY ? ' [DRY]' : ''} would email ${to || '(no CLAUDE_NOTIFY_EMAIL set)'}: ${email.subject}`);
    return;
  }
  const mod = await import(pathToFileURL(path.resolve('lib/notifications/resend-adapter.js')).href);
  const r = await mod.sendEmail({ from: 'LEO Fleet Reliability <onboarding@resend.dev>', to, subject: email.subject, html: email.html, text: email.text });
  console.log('[fleet-down-alert] email sent:', r?.id || JSON.stringify(r));
}

// Run main() only as a CLI (guarded so tests can import the pure helper).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('[fleet-down-alert] fatal:', e.message); process.exit(1); });
}
