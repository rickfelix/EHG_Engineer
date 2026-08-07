/**
 * SD-LEO-INFRA-SESSION-TICK-DAEMONS-001 FR-2 / TS-3 ACCEPTANCE.
 * "Two daemons on the same cc_parent_pid serving one sid: after rotation, BOTH exit."
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * FR-2 NEEDED NO NEW CODE, AND THIS RUN IS WHY
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * FR-2 was written as "a self-check in the daemon, because one session id can have MANY daemons",
 * on the evidence that killing the marker pid did not stop the stamping. That evidence is real —
 * this run reproduces it — but it indicts kill-by-marker-pid (FR-3's problem), not the rotation
 * path. FR-1 does not kill anything. It RELEASES THE ROW, and every daemon serving that sid
 * PATCHes that same row behind the same `status=in.(active,idle,stale)` filter
 * (session-tick.cjs:331), so a release 0-rows ALL of them and each exits itself at :350.
 * "Every daemon notices" is therefore structural: the exit condition is derived from shared state,
 * not per-daemon state, so it cannot reach one daemon and miss another.
 *
 * MEASURED 2026-08-04: daemons 55172 and 29320 on one sid, both stamping; the marker named only
 * 29320 (so a marker-pid-only kill provably misses 55172); row released; BOTH exited inside 2s.
 *
 * Adding a second "rotated-out self-check" would have been a redundant mechanism guarding an
 * already-closed door — and a second exit path in a daemon whose two exits are load-bearing is
 * exactly the sort of thing the five prior attempts at this defect died on.
 *
 * Kept as a runnable script rather than a vitest suite because it spawns real daemons and writes
 * a real row: the `db` project is disabled without a designated non-production target, so a suite
 * here would silently never run — the failure mode this whole SD is about.
 *
 *   node tests/acceptance/rotation-closes-all-daemons.cjs
 *
 * Throwaway session id, LEO_TICK_MS=2000 so the run takes seconds. Cleans up after itself.
 */
require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const ROOT = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';
const TICK = path.join(ROOT, 'scripts/session-tick.cjs');
const SID = 'fr2-accept-' + process.pid;
const MARKER = path.join(ROOT, '.claude/pids', `tick-${SID}.json`);
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

(async () => {
  // A long-lived parent so the ONLY exit path under test is the released-row one,
  // never parent-ESRCH.
  const parent = spawn(process.execPath, ['-e', 'setTimeout(()=>{},120000)'], { stdio: 'ignore' });
  await sleep(400);
  console.log(`parent pid=${parent.pid} alive=${alive(parent.pid)}`);

  await s.from('claude_sessions').delete().eq('session_id', SID);
  const { error: insErr } = await s.from('claude_sessions').insert({
    session_id: SID, status: 'active', hostname: require('os').hostname(),
    heartbeat_at: new Date().toISOString(),
  });
  if (insErr) { console.log('INSERT FAILED: ' + insErr.message); parent.kill(); process.exit(1); }

  const env = { ...process.env, CLAUDE_SESSION_ID: SID, CC_PARENT_PID: String(parent.pid), LEO_TICK_MS: '2000' };
  const a = spawn(process.execPath, [TICK], { env, stdio: 'ignore', detached: true });
  const b = spawn(process.execPath, [TICK], { env, stdio: 'ignore', detached: true });
  a.unref(); b.unref();
  console.log(`daemon A pid=${a.pid}  daemon B pid=${b.pid}   (same sid, same cc_parent_pid)`);

  await sleep(7000);
  const { data: r1 } = await s.from('claude_sessions').select('heartbeat_at,process_alive_at').eq('session_id', SID).maybeSingle();
  console.log(`\n[phase 1: both should be RUNNING and stamping]`);
  console.log(`  A alive=${alive(a.pid)}  B alive=${alive(b.pid)}`);
  console.log(`  heartbeat_at=${r1 && r1.heartbeat_at}  process_alive_at=${r1 && r1.process_alive_at}`);
  console.log(`  marker names pid=${fs.existsSync(MARKER) ? JSON.parse(fs.readFileSync(MARKER,'utf8')).tick_pid : '(none)'}  <- only ONE of the two`);

  // THE ROTATION EVENT — exactly what FR-1's closure writes.
  await s.from('claude_sessions').update({ status: 'released' }).eq('session_id', SID);
  console.log(`\n[released the row — FR-1's write]`);

  for (let i = 1; i <= 8; i++) {
    await sleep(2000);
    const aA = alive(a.pid), bA = alive(b.pid);
    console.log(`  +${i * 2}s  A alive=${aA}  B alive=${bA}`);
    if (!aA && !bA) break;
  }

  const finalA = alive(a.pid), finalB = alive(b.pid);
  console.log(`\nRESULT: A exited=${!finalA}  B exited=${!finalB}  -> FR-2 acceptance ${(!finalA && !finalB) ? 'PASS' : 'FAIL'}`);

  // cleanup
  try { if (finalA) process.kill(a.pid); } catch {}
  try { if (finalB) process.kill(b.pid); } catch {}
  try { parent.kill(); } catch {}
  await s.from('claude_sessions').delete().eq('session_id', SID);
  try { fs.unlinkSync(MARKER); } catch {}
  console.log('cleaned up (row deleted, processes killed, marker removed)');
  process.exit(0);
})();
