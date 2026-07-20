#!/usr/bin/env node
// Retro-audit of claim-attribution anomalies — SD-LEO-INFRA-CLAIM-IDENTITY-INTEGRITY-001 (FR-5).
//
// Enumerates claim_history entries for a given UTC day across
// strategic_directives_v2, groups multi-claim SDs, and classifies each
// transition: same-session re-affirm | plausible re-route (prior session dead
// at hand-off) | ANOMALY (two live sessions interleaving on one SD — the
// misattribution / churn class this SD fixes). Findings are attached to this
// SD's metadata.claim_attribution_audit for the coordinator.
//
// Usage: node scripts/audit-claim-attribution.mjs [--day 2026-07-11] [--dry-run]

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import collisionCheck from '../lib/fleet/collision-check.cjs';
const { checkClaimCollision } = collisionCheck;
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: both reads below are unbounded
// (no time/id filter) over growing tables (strategic_directives_v2, claude_sessions —
// claude_sessions alone is 12,973+ rows, live-verified elsewhere in this codebase) — paginate.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const SELF_SD_KEY = 'SD-LEO-INFRA-CLAIM-IDENTITY-INTEGRITY-001';
const dayArgIdx = process.argv.indexOf('--day');
const DAY = dayArgIdx !== -1 ? process.argv[dayArgIdx + 1] : new Date().toISOString().slice(0, 10);
const dryRun = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let sds;
try {
  sds = await fetchAllPaginated(() => supabase
    .from('strategic_directives_v2')
    .select('sd_key, metadata')
    .not('metadata->claim_history', 'is', null)
    .order('sd_key', { ascending: true })); // unique tiebreaker (FR-6)
} catch (e) { console.error(`audit: SD query failed: ${e.message}`); process.exit(1); }

let sessions;
try {
  sessions = await fetchAllPaginated(() => supabase
    .from('claude_sessions')
    .select('session_id, terminal_id, status, heartbeat_at, released_reason')
    .order('session_id', { ascending: true })); // unique tiebreaker (FR-6)
} catch (e) { console.error(`audit: sessions query failed: ${e.message}`); process.exit(1); }
const sessionById = new Map((sessions ?? []).map((s) => [s.session_id, s]));

const findings = [];
for (const sd of sds ?? []) {
  const dayEntries = (sd.metadata?.claim_history ?? [])
    .filter((e) => typeof e?.claimed_at === 'string' && e.claimed_at.startsWith(DAY))
    .sort((a, b) => a.claimed_at.localeCompare(b.claimed_at));
  if (dayEntries.length < 2) continue;

  const transitions = [];
  for (let i = 1; i < dayEntries.length; i++) {
    const prev = dayEntries[i - 1];
    const cur = dayEntries[i];
    if (prev.session_id === cur.session_id) {
      transitions.push({ at: cur.claimed_at, verdict: 'same_session_reaffirm' });
      continue;
    }
    const prevSession = sessionById.get(prev.session_id);
    // A hand-off is plausible when the prior session is gone/released before the later
    // claim; two sessions that BOTH remain known-live interleaving on one SD is the
    // anomaly class (misattribution or churn).
    const statusGone = !prevSession || !['active', 'idle'].includes(prevSession.status); // 'idle' is a LIVE status (adversarial review): treating it as gone silently zeroed the interleave-anomaly class
    // QF-20260712-008: a session can stay status=active while having RELEASED this SD
    // (claim_history records no releases). Cross-reference session_lifecycle_events so a
    // benign release-then-reclaim is not miscounted as a live collision. Fail-open: on any
    // lookup error checkClaimCollision returns isLiveCollision=true, preserving the anomaly.
    let releasedBeforeReclaim = false;
    if (!statusGone) {
      const c = await checkClaimCollision(supabase, prev.session_id, sd.sd_key, cur.claimed_at);
      releasedBeforeReclaim = c.isLiveCollision === false;
    }
    transitions.push({
      at: cur.claimed_at,
      from: prev.session_id,
      to: cur.session_id,
      prior_session_state: prevSession ? `${prevSession.status}${prevSession.released_reason ? ':' + prevSession.released_reason : ''}${releasedBeforeReclaim ? ':released_before_reclaim' : ''}` : 'unknown_row',
      verdict: (statusGone || releasedBeforeReclaim) ? 'plausible_reroute' : 'ANOMALY_live_interleave',
    });
  }
  const anomalies = transitions.filter((t) => t.verdict === 'ANOMALY_live_interleave');
  const reroutes = transitions.filter((t) => t.verdict === 'plausible_reroute');
  if (anomalies.length || reroutes.length >= 2) {
    findings.push({
      sd_key: sd.sd_key,
      day_claims: dayEntries.length,
      distinct_sessions: [...new Set(dayEntries.map((e) => e.session_id))].length,
      transitions,
    });
  }
}

const summary = {
  day: DAY,
  sds_with_multi_claims: findings.length,
  anomaly_transitions: findings.reduce((n, f) => n + f.transitions.filter((t) => t.verdict === 'ANOMALY_live_interleave').length, 0),
  reroute_transitions: findings.reduce((n, f) => n + f.transitions.filter((t) => t.verdict === 'plausible_reroute').length, 0),
  cases: findings,
  method: 'claim_history transitions cross-referenced against claude_sessions status AND session_lifecycle_events release markers (QF-20260712-008); ANOMALY = distinct-session transition while the prior session is still live (active/idle) AND has no release of this SD before the reclaim',
};

console.log(`Claim-attribution audit for ${DAY}:`);
console.log(`  multi-claim SDs flagged: ${summary.sds_with_multi_claims}`);
console.log(`  ANOMALY (live interleave) transitions: ${summary.anomaly_transitions}`);
console.log(`  plausible re-routes: ${summary.reroute_transitions}`);
for (const f of findings) {
  console.log(`  - ${f.sd_key}: ${f.day_claims} claims / ${f.distinct_sessions} sessions`);
  for (const t of f.transitions.filter((t) => t.verdict !== 'same_session_reaffirm')) {
    console.log(`      ${t.at} ${t.from} -> ${t.to} [${t.verdict}] prior=${t.prior_session_state}`);
  }
}

if (!dryRun) {
  const { data: selfSd, error: selfErr } = await supabase
    .from('strategic_directives_v2').select('id, metadata').eq('sd_key', SELF_SD_KEY).single();
  if (selfErr || !selfSd?.id) { console.error(`audit: could not load ${SELF_SD_KEY} — findings not attached`); process.exit(1); }
  const { error: wErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: { ...(selfSd.metadata ?? {}), claim_attribution_audit: summary } })
    .eq('id', selfSd.id);
  if (wErr) { console.error(`audit: attach failed: ${wErr.message}`); process.exit(1); }
  console.log(`\nFindings attached to ${SELF_SD_KEY} (metadata.claim_attribution_audit).`);
}
