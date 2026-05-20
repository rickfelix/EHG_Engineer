#!/usr/bin/env node
/**
 * One-off: inspect most-recent SD_COMPLETION retrospective row to learn exact column set
 * for SD-ACTIVATE-SURFACEAWARE-WIREFRAME-PIPELINE-ORCH-001 retro generation.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Walk up from cwd looking for .env (worktree-safe, mirrors lib/supabase-client.js)
(function loadEnvFromAncestors() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const envFile = path.join(dir, '.env');
    if (fs.existsSync(envFile)) {
      dotenv.config({ path: envFile });
      return;
    }
    dir = path.dirname(dir);
  }
})();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('MISSING_ENV', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const { data, error } = await supabase
  .from('retrospectives')
  .select('*')
  .eq('retro_type', 'SD_COMPLETION')
  .order('created_at', { ascending: false })
  .limit(1);

if (error) {
  console.error('QUERY_ERROR', error);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.log('NO_SD_COMPLETION_ROWS_FOUND');
  process.exit(0);
}

const row = data[0];
console.log('=== COLUMN NAMES + TYPES (most recent SD_COMPLETION row) ===');
for (const [k, v] of Object.entries(row)) {
  let typ = v === null ? 'null' : Array.isArray(v) ? `array[${v.length}]` : typeof v;
  let preview = '';
  if (v !== null) {
    if (typeof v === 'object') {
      preview = JSON.stringify(v).slice(0, 160);
    } else {
      preview = String(v).slice(0, 160);
    }
  }
  console.log(`${k.padEnd(34)} | ${typ.padEnd(11)} | ${preview}`);
}
console.log('\n=== RAW JSON (for nested-shape reference) ===');
console.log(JSON.stringify(row, null, 2).slice(0, 4000));
