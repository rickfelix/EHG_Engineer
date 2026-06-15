#!/usr/bin/env node
/**
 * working-context.cjs — SD-LEO-INFRA-ADAM-COORDINATOR-INTERFACE-001 (FR-2)
 *
 * CLI for an operator session (Adam or coordinator) to maintain its standing working_context —
 * the continuously-current LIST of its concurrent workstreams that the OTHER operator reads, so
 * neither mistakes heads-down silence for being ignored. Mutations build the next context via the
 * pure lib/coordinator/working-context.cjs and persist it through the atomic RPC writer
 * (lib/coordinator/working-context-store.cjs) — never a JS read-modify-write.
 *
 * Usage:
 *   node scripts/working-context.cjs show [--all]                  # render self (or both operators)
 *   node scripts/working-context.cjs set "<what>" --state <state>  # upsert a thread (self)
 *   node scripts/working-context.cjs done "<what>"                 # mark a thread done + prune (self)
 *   node scripts/working-context.cjs cancel "<what>"               # mark a thread cancelled + prune (self)
 *   node scripts/working-context.cjs prune                         # prune closed/aged threads (self)
 *   node scripts/working-context.cjs refresh                       # prune + re-stamp freshness (self)
 *
 * State strings accept the live free-form vocabulary (active | monitoring | waiting-on-coordinator |
 * blocked-on-chairman | done | cancelled, ...); the library normalizes them to the canonical lifecycle.
 */
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
const { resolveAdamSessionId } = require('./read-adam-directives.cjs');
const store = require('../lib/coordinator/working-context-store.cjs');
const wc = require('../lib/coordinator/working-context.cjs');

function emHighlight(s) { return '\x1b[33m' + s + '\x1b[0m'; } // yellow = waiting-on-other / STALE

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] || null) : null;
}

async function loadAndWrite(supabase, sessionId, mutate) {
  const current = await store.getWorkingContext(supabase, sessionId);
  const next = mutate(current);
  const res = await store.writeWorkingContext(supabase, sessionId, next);
  if (!res.persisted) console.warn(res.warn || `[working-context] not persisted: ${res.reason}${res.error ? ' — ' + res.error : ''}`);
  else console.log('[working-context] persisted.');
  console.log(wc.formatWorkingContext(next, { label: 'working context (you)', em: emHighlight }));
  return res;
}

async function main() {
  const cmd = process.argv[2];
  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }

  if (cmd === 'show') {
    const all = process.argv.includes('--all');
    if (all) {
      const adamId = await resolveAdamSessionId(supabase).catch(() => null);
      const coordId = await getActiveCoordinatorId(supabase).catch(() => null);
      const adam = adamId ? await store.getWorkingContext(supabase, adamId) : null;
      const coord = coordId ? await store.getWorkingContext(supabase, coordId) : null;
      console.log(wc.formatWorkingContext(adam, { label: `Adam (${adamId || 'no session'})`, em: emHighlight }));
      console.log('');
      console.log(wc.formatWorkingContext(coord, { label: `Coordinator (${coordId || 'no session'})`, em: emHighlight }));
      return;
    }
    const sessionId = process.env.CLAUDE_SESSION_ID;
    if (!sessionId) { console.error('ERROR: CLAUDE_SESSION_ID required for self show (use --all to view both operators).'); process.exit(1); }
    const ctx = await store.getWorkingContext(supabase, sessionId);
    console.log(wc.formatWorkingContext(ctx, { label: 'working context (you)', em: emHighlight }));
    return;
  }

  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) { console.error('ERROR: CLAUDE_SESSION_ID required (mutations write your own session).'); process.exit(1); }

  if (cmd === 'set') {
    const what = process.argv[3];
    const state = arg('--state') || 'active';
    if (!what || what.startsWith('--')) { console.error('Usage: working-context.cjs set "<what>" --state <state>'); process.exit(2); }
    await loadAndWrite(supabase, sessionId, (cur) => wc.upsertThread(cur, { what, state }));
    return;
  }
  if (cmd === 'done' || cmd === 'cancel') {
    const what = process.argv[3];
    if (!what) { console.error(`Usage: working-context.cjs ${cmd} "<what>"`); process.exit(2); }
    await loadAndWrite(supabase, sessionId, (cur) => wc.pruneThreads(wc.setThreadState(cur, what, cmd === 'done' ? 'done' : 'cancelled')));
    return;
  }
  if (cmd === 'prune' || cmd === 'refresh') {
    // Both prune closed/aged threads. updated_at is bumped by pruneThreads ONLY when a real change
    // occurred (a thread was actually closed) — neither command force-stamps freshness, so a tick
    // with no real change never advertises false currency (a stale context misleads worse than none).
    await loadAndWrite(supabase, sessionId, (cur) => wc.pruneThreads(cur));
    return;
  }

  console.error('Usage: working-context.cjs show [--all] | set "<what>" --state <s> | done "<what>" | cancel "<what>" | prune | refresh');
  process.exit(2);
}

if (require.main === module) {
  main().catch((e) => { console.error('UNHANDLED:', e && e.message ? e.message : e); process.exit(1); });
}

module.exports = { main };
