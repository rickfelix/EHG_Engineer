// EXEC-phase migration application via exec_sql RPC
// SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 / FR-2
// Uses Supabase service-role + exec_sql RPC to avoid pg TLS chain issue on Windows
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationFile = path.join(__dirname, '..', '..', 'database', 'migrations', '20260510_worktree_cleanup_pending.sql');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const migrationSQL = readFileSync(migrationFile, 'utf-8');
console.log(`Migration loaded: ${migrationSQL.length} chars from ${migrationFile}`);

// exec_sql accepts arbitrary SQL as sql_text; it returns result rows for SELECT,
// status for DDL. Wrap in single transactional block (BEGIN/COMMIT in file).
const { data, error } = await supabase.rpc('exec_sql', { sql_text: migrationSQL });

if (error) {
  console.error('MIGRATION FAILED:', error);
  process.exit(1);
}

console.log('MIGRATION APPLY result:', JSON.stringify(data, null, 2));

// Verification query
const verifySQL = `
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='claude_sessions' AND column_name='cleanup_pending') AS column_exists,
  EXISTS (SELECT 1 FROM pg_indexes
          WHERE schemaname='public' AND tablename='claude_sessions' AND indexname='idx_claude_sessions_cleanup_pending') AS index_exists,
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='claude_sessions' AND column_name='cleanup_pending') AS col_type,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_schema='public' AND table_name='claude_sessions' AND column_name='cleanup_pending') AS nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_schema='public' AND table_name='claude_sessions' AND column_name='cleanup_pending') AS col_default
`;

const { data: verify, error: verifyErr } = await supabase.rpc('exec_sql', { sql_text: verifySQL });

if (verifyErr) {
  console.error('VERIFICATION FAILED:', verifyErr);
  process.exit(1);
}

console.log('\nVERIFICATION:');
console.log(JSON.stringify(verify, null, 2));
