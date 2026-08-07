import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log('=== ROW COUNTS on read-sources (is there enough history to trend?) ===');
for (const t of ['sms_relay_staging','sms_outbound_obligations','session_coordination','issue_patterns','retrospectives','chairman_decisions','merge_witness_telemetry','pattern_occurrences','coordination_events']) {
  try {
    const r = await c.query(`SELECT count(*)::int AS n FROM public.${t}`);
    let extra='';
    try { const w = await c.query(`SELECT count(*)::int AS n FROM public.${t} WHERE created_at > now() - interval '7 days'`); extra = ` | last7d=${w.rows[0].n}`; } catch(e) { extra=' | (no created_at)'; }
    console.log(`${t}: total=${r.rows[0].n}${extra}`);
  } catch(e) { console.log(`${t}: ERR ${e.message.slice(0,80)}`); }
}

console.log('\n=== session_coordination retention (the answered-rate.cjs warning) ===');
try {
  const r = await c.query(`SELECT min(created_at) AS oldest, max(created_at) AS newest, count(*)::int AS n FROM public.session_coordination`);
  console.log(JSON.stringify(r.rows[0]));
} catch(e){ console.log('ERR', e.message.slice(0,120)); }

console.log('\n=== sms_relay_staging window (T1 needs multi-day inbound chairman SMS) ===');
try {
  const r = await c.query(`SELECT direction, count(*)::int AS n, min(created_at) AS oldest, max(created_at) AS newest FROM public.sms_relay_staging GROUP BY 1`);
  console.table(r.rows);
} catch(e){
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='sms_relay_staging' ORDER BY ordinal_position`);
  console.log('cols:', cols.rows.map(r=>r.column_name).join(', '));
}

console.log('\n=== ALL distinct feedback categories (full list, count) ===');
const dv = await c.query(`SELECT count(DISTINCT category)::int AS distinct_categories FROM public.feedback`);
console.log(JSON.stringify(dv.rows[0]));
const tail = await c.query(`SELECT category, count(*)::int AS n FROM public.feedback GROUP BY 1 ORDER BY n DESC OFFSET 24`);
console.log(tail.rows.map(r=>`${r.category}=${r.n}`).join(' | '));

console.log('\n=== longest existing category (proves varchar(50) headroom in practice) ===');
const lc = await c.query(`SELECT category, length(category) AS len FROM public.feedback WHERE category IS NOT NULL ORDER BY length(category) DESC LIMIT 5`);
console.table(lc.rows);

await c.end();
