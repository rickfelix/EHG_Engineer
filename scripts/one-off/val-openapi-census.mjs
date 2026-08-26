import 'dotenv/config';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
const spec = await res.json();
const defs = spec.definitions || {};
const hits = [];
for (const [table, def] of Object.entries(defs)) {
  for (const col of Object.keys(def.properties || {})) {
    if (/metadata|token|credential|secret|password/i.test(col)) hits.push(`${table}.${col}`);
  }
}
console.log(`Total tables in PostgREST schema: ${Object.keys(defs).length}`);
const sm = hits.filter(h => /\.source_metadata$/.test(h));
const tok = hits.filter(h => /token|credential|secret|password/i.test(h.split('.').pop()));
console.log(`\nTables with a source_metadata column (${sm.length}):\n  ${sm.join('\n  ') || '(none)'}`);
console.log(`\nColumns named token/credential/secret/password (${tok.length}):\n  ${tok.join('\n  ') || '(none)'}`);
