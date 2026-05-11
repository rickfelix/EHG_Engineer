import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const supabase = createSupabaseServiceClient();
const migrationPath = path.resolve(__dirname, '../../database/migrations/20260510_v_sd_completion_integrity.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

console.log('Applying migration via supabase.rpc(exec_sql)...');
const { data, error } = await supabase.rpc('exec_sql', { query: sql });
if (error) {
  console.error('ERROR:', error.message, '(code:', error.code, ')');
  process.exit(1);
}
console.log('Migration applied. RPC result:', JSON.stringify(data, null, 2).slice(0, 500));

// Verify the view exists
const { data: rows, error: vErr } = await supabase
  .from('v_sd_completion_integrity')
  .select('id, sd_key, is_ghost_completed')
  .eq('id', 'b737c27f-3e83-4887-999e-3c1ae158faf4')
  .single();

if (vErr) {
  console.error('VIEW CHECK ERROR:', vErr.message);
  process.exit(1);
}
console.log('\nWitness row from view:', JSON.stringify(rows, null, 2));
