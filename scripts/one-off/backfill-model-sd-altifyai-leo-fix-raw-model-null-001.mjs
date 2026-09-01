// SD-ALTIFYAI-LEO-FIX-RAW-MODEL-NULL-001 FR-6: backfill metadata.model for the 4 live
// seats confirmed via RCA to have metadata.model=null (root cause: capture-session-id.cjs's
// upsertSessionRow silently 409'd on every write to a pre-existing row since 2026-07-01).
// This runs the FIXED write path (upsertSessionRow, via the same require used by the hook)
// against each affected seat, sourcing the model value from its local
// .claude/session-identity/pid-*.json marker (which correctly captured it at SessionStart —
// only the DB write was broken, not the capture). Proves the fix end-to-end (FR-6 AC-1).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const require = createRequire(import.meta.url);
const { upsertSessionRow } = require('../hooks/capture-session-id.cjs');

const AFFECTED_SESSION_IDS = [
  '0dd0b036-911d-4aaa-ab13-0532eb2fcb67',
  '2b9045cc-92af-4c7d-87e0-7febe82ac321',
  '78a073be-f6e0-45bc-8ae5-db640a41b0fc',
  '02821841-4aca-4eb4-a6ff-2ada48bbc92e',
];

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const markerDir = path.resolve(process.cwd(), '.claude/session-identity');

function findMarkerForSession(sessionId) {
  // Per-session marker file may have been evicted (keeps last 5); fall back to
  // scanning pid-*.json markers, which are kept per-live-PID and carry session_id.
  const direct = path.join(markerDir, `${sessionId}.json`);
  if (fs.existsSync(direct)) return JSON.parse(fs.readFileSync(direct, 'utf8'));
  const files = fs.readdirSync(markerDir).filter((f) => f.startsWith('pid-') && f.endsWith('.json'));
  for (const f of files) {
    try {
      const marker = JSON.parse(fs.readFileSync(path.join(markerDir, f), 'utf8'));
      if (marker.session_id === sessionId) return marker;
    } catch { /* skip unreadable marker */ }
  }
  return null;
}

async function main() {
  const results = [];
  for (const sessionId of AFFECTED_SESSION_IDS) {
    const marker = findMarkerForSession(sessionId);
    if (!marker || !marker.model) {
      results.push({ sessionId, outcome: 'no_marker_found' });
      continue;
    }
    await upsertSessionRow(sessionId, marker.cc_pid, marker.source || 'backfill', marker.model);
    results.push({ sessionId, outcome: 'backfilled', model: marker.model });
  }

  const { data: after, error } = await supabase
    .from('claude_sessions')
    .select('session_id, metadata')
    .in('session_id', AFFECTED_SESSION_IDS);
  if (error) throw error;

  console.log(JSON.stringify({
    attempted: results,
    readback: after.map((r) => ({ session_id: r.session_id, model: r.metadata?.model || null })),
  }, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
