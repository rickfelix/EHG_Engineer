#!/usr/bin/env node
/**
 * One-off: behavioral RPC probe for SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001 (PRD FR-4).
 *
 * The vitest DB-tier guard blocks tests/database/*.test.js from hitting the live/production
 * project ref (correct behavior -- there is no staging DB to designate). This script runs the
 * same two behavioral scenarios directly against the live claim_sd RPC, using a dedicated
 * scratch quick_fixes row and two scratch claude_sessions rows, cleaned up at the end (net-zero).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const RUN_SUFFIX = `${process.pid}-${Date.now().toString(36)}`;
const PEER = `probe-qf-guard-peer-${RUN_SUFFIX}`;
const CALLER = `probe-qf-guard-caller-${RUN_SUFFIX}`;
const QF_ID = `QF-PROBEGUARD-${RUN_SUFFIX}`.toUpperCase().slice(0, 40);

const isoSecsAgo = (s) => new Date(Date.now() - s * 1000).toISOString();

let failures = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`  PASS: ${label}`);
  } else {
    failures++;
    console.log(`  FAIL: ${label} -- ${JSON.stringify(detail)}`);
  }
}

async function main() {
  console.log(`Probe QF: ${QF_ID}`);

  await supabase.from('quick_fixes').insert({
    id: QF_ID,
    title: 'PROBE FIXTURE (SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001): behavioral RPC probe -- safe to delete',
    type: 'bug',
    severity: 'low',
    description: 'Scratch QF created by scripts/one-off/qf-claim-peer-guard-001-behavioral-probe.mjs',
    status: 'open',
  });

  // Scenario 1: live foreign peer refusal.
  await supabase.from('claude_sessions').upsert(
    { session_id: PEER, status: 'active', heartbeat_at: isoSecsAgo(10), sd_key: null },
    { onConflict: 'session_id' });
  await supabase.from('claude_sessions').upsert(
    { session_id: CALLER, status: 'active', heartbeat_at: isoSecsAgo(5), sd_key: null },
    { onConflict: 'session_id' });
  await supabase.from('quick_fixes')
    .update({ claiming_session_id: PEER, status: 'open', started_at: null })
    .eq('id', QF_ID);

  console.log('\nScenario 1: live foreign peer refusal');
  const s1 = await supabase.rpc('claim_sd', { p_sd_id: QF_ID, p_session_id: CALLER, p_track: null });
  check('success=false', s1.data?.success === false, s1.data);
  check('error=claimed_by_live_peer', s1.data?.error === 'claimed_by_live_peer', s1.data);
  check('claimed_by=PEER', s1.data?.claimed_by === PEER, s1.data);
  const { data: after1 } = await supabase.from('quick_fixes').select('claiming_session_id').eq('id', QF_ID).maybeSingle();
  check('claiming_session_id unchanged (still PEER)', after1?.claiming_session_id === PEER, after1);

  // Scenario 2: fresh claim stamps started_at.
  await supabase.from('quick_fixes').update({ claiming_session_id: null, started_at: null }).eq('id', QF_ID);
  console.log('\nScenario 2: fresh claim stamps started_at');
  const s2 = await supabase.rpc('claim_sd', { p_sd_id: QF_ID, p_session_id: CALLER, p_track: null });
  check('success=true', s2.data?.success === true, s2.data);
  const { data: after2 } = await supabase.from('quick_fixes').select('started_at, claiming_session_id').eq('id', QF_ID).maybeSingle();
  check('started_at populated', !!after2?.started_at, after2);
  check('claiming_session_id=CALLER', after2?.claiming_session_id === CALLER, after2);
  const firstStartedAt = after2?.started_at;

  // Scenario 3: re-claim preserves started_at (COALESCE).
  await supabase.from('claude_sessions').update({ sd_key: null }).eq('session_id', CALLER);
  console.log('\nScenario 3: re-claim preserves started_at');
  const s3 = await supabase.rpc('claim_sd', { p_sd_id: QF_ID, p_session_id: CALLER, p_track: null });
  check('success=true', s3.data?.success === true, s3.data);
  const { data: after3 } = await supabase.from('quick_fixes').select('started_at').eq('id', QF_ID).maybeSingle();
  check('started_at preserved', after3?.started_at === firstStartedAt, { after3, firstStartedAt });

  // Cleanup (net-zero).
  await supabase.from('quick_fixes').delete().eq('id', QF_ID);
  await supabase.from('claude_sessions').delete().eq('session_id', PEER);
  await supabase.from('claude_sessions').delete().eq('session_id', CALLER);

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('PROBE ERROR:', e.message);
    process.exit(1);
  });
}
