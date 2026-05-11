/* session-role-orient.cjs — SessionStart hook (QF-20260511-026).
 * Emits 3-line [ROLE] block (SOLO | WORKER | COORDINATOR). */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const COORD_FILE = path.resolve(__dirname, '../../.claude/active-coordinator.json');
const BUDGET_MS = 1500;
const STALE_MIN = 10;
const SOLO = [
  '[ROLE] SOLO — no active coordinator detected.',
  '[ROLE] Canonical pause points apply (CLAUDE.md 5-point list). Log harness bugs: node scripts/log-harness-bug.js "<symptom>".',
  '[ROLE] If /leo next returns no workable SD AND AUTO-PROCEED=ON → fall through to /leo assist Phase 1 (continuation, NOT pause).'
];
const COORDINATOR = [
  '[ROLE] COORDINATOR — you manage the fleet.',
  '[ROLE] Drain worker signals via /coordinator inbox (filtered by payload->signal_type IS NOT NULL).',
  '[ROLE] 3+ matching signals within 60min auto-promote to feedback (category=harness_backlog) → SD pipeline.'
];
const workerLines = (callsign, coordShort) => [
  `[ROLE] WORKER (${callsign ? `callsign: ${callsign}` : 'no callsign'}) under coordinator session=${coordShort}.`,
  '[ROLE] /signal <type> "<body>" when ANY: recurrence (gate 2×, RCA 2×, tool 3×) | about to bypass | spec/PRD friction | harness-bug recognized | memory-trend match.',
  '[ROLE] Types: stuck | need-sweep | prd-ambiguous | gate-bug | spec-conflict | harness-bug | feedback | other. Severity --low|medium|high|critical (critical bypasses 3× threshold).'
];

function readCoordFile() {
  try { return fs.existsSync(COORD_FILE) ? JSON.parse(fs.readFileSync(COORD_FILE, 'utf8')) : null; } catch { return null; }
}
async function pgGet(qs) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), BUDGET_MS);
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${qs}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: ctl.signal });
    return res.ok ? await res.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}
async function fetchMeta(sid) {
  return (await pgGet(`claude_sessions?session_id=eq.${sid}&select=metadata`))?.[0]?.metadata || null;
}
async function findActiveCoord() {
  const cutoff = new Date(Date.now() - STALE_MIN * 60_000).toISOString();
  return (await pgGet(`claude_sessions?heartbeat_at=gte.${cutoff}&metadata->>is_coordinator=eq.true&order=heartbeat_at.desc&limit=1&select=session_id`))?.[0]?.session_id || null;
}
function decide(sessionId, meta, coordFile) {
  if (meta?.is_coordinator) return COORDINATOR;
  if (coordFile?.session_id === sessionId) return COORDINATOR;
  if (coordFile?.session_id) return workerLines(meta?.callsign, coordFile.session_id.slice(0, 8));
  return SOLO;
}
function main() {
  return new Promise(resolve => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { input += c; });
    process.stdin.on('end', async () => {
      const sessionId = (() => { try { return JSON.parse(input)?.session_id; } catch { return null; } })();
      let coordFile = readCoordFile();
      if (!coordFile && sessionId) {
        const dbCoord = await findActiveCoord();
        if (dbCoord) coordFile = { session_id: dbCoord };
      }
      const meta = sessionId ? await fetchMeta(sessionId) : null;
      decide(sessionId, meta, coordFile).forEach(l => console.log(l));
      resolve();
    });
    process.stdin.on('error', () => resolve());
    setTimeout(resolve, BUDGET_MS + 300);
  });
}
if (require.main === module) main().then(() => process.exit(0)).catch(() => process.exit(0));
module.exports = { readCoordFile, fetchMeta, findActiveCoord, decide, SOLO, COORDINATOR, workerLines };
