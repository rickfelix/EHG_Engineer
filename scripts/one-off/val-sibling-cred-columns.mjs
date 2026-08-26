import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TOKEN_RE = /(ya29\.[A-Za-z0-9_\-\.]{20,}|1\/\/0[A-Za-z0-9_\-]{20,}|AIza[A-Za-z0-9_\-]{30,}|sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{20,})/;
const targets = [
  ['uat_credentials','credentials'],
  ['marketing_channels','credentials'],
  ['uat_credential_history','old_credentials'],
  ['venture_distribution_channels','credential_ref'],
  ['uat_test_users','password'],
  ['chairman_stepup_tokens','token'],
];
for (const [t,c] of targets) {
  const { data, error } = await s.from(t).select(`id, ${c}`).limit(200);
  if (error) { console.log(`${t}.${c}: ERR ${error.message}`); continue; }
  let hits = 0, nonNull = 0;
  for (const r of data) {
    const v = r[c]; if (v === null || v === undefined) continue; nonNull++;
    if (TOKEN_RE.test(typeof v === 'string' ? v : JSON.stringify(v))) hits++;
  }
  console.log(`${t}.${c}: rows=${data.length} nonNull=${nonNull} PROVIDER-TOKEN-SHAPE-HITS=${hits}${hits?'  <<< REVIEW':''}`);
}
