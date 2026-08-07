// One-off measurement for SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 / FR-2(c).
// Samples claude_sessions.process_alive_at every 10s and derives the OBSERVED
// inter-tick interval per session. Healthy = the row advanced at least once during
// the window (a frozen row is a dead/parked seat, not a cadence sample).
require('dotenv').config({ path: process.argv[3] || '.env' });
const { createClient } = require('@supabase/supabase-js');

const DURATION_MS = Number(process.argv[2] || 300000);
const SAMPLE_MS = 10000;
const OUT = require('path').join(__dirname, 'tick-cadence-result.json');
const fs = require('fs');

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const last = new Map();       // session_id -> last process_alive_at (ms)
const intervals = new Map();  // session_id -> [ms, ...]

async function sample() {
  const { data, error } = await s
    .from('claude_sessions')
    .select('session_id,status,process_alive_at,heartbeat_at,is_alive')
    .in('status', ['active', 'idle'])
    .not('process_alive_at', 'is', null);
  if (error) { console.error('sample error', error.message); return; }
  for (const r of data) {
    const t = Date.parse(r.process_alive_at);
    if (!Number.isFinite(t)) continue;
    const prev = last.get(r.session_id);
    if (prev != null && t > prev) {
      if (!intervals.has(r.session_id)) intervals.set(r.session_id, []);
      intervals.get(r.session_id).push(t - prev);
    }
    last.set(r.session_id, t);
  }
}

(async () => {
  const start = Date.now();
  await sample();
  const timer = setInterval(async () => {
    await sample();
    if (Date.now() - start >= DURATION_MS) {
      clearInterval(timer);
      const all = [];
      const perSession = {};
      for (const [sid, arr] of intervals) { perSession[sid] = arr; all.push(...arr); }
      all.sort((a, b) => a - b);
      const pct = (p) => (all.length ? all[Math.min(all.length - 1, Math.floor(p * all.length))] : null);
      const out = {
        measured_at: new Date().toISOString(),
        window_ms: Date.now() - start,
        sample_interval_ms: SAMPLE_MS,
        rows_tracked: last.size,
        sessions_that_advanced: intervals.size,
        intervals_observed: all.length,
        min_ms: all[0] ?? null,
        median_ms: pct(0.5),
        p90_ms: pct(0.9),
        p99_ms: pct(0.99),
        max_ms: all[all.length - 1] ?? null,
        over_90s: all.filter((x) => x > 90000).length,
        over_120s: all.filter((x) => x > 120000).length,
        over_180s: all.filter((x) => x > 180000).length,
        per_session: perSession,
      };
      fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }
  }, SAMPLE_MS);
})();
