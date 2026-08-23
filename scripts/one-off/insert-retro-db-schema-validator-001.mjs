#!/usr/bin/env node
/**
 * Insert SD_COMPLETION retrospective for SD-LEO-FIX-DATABASE-SCHEMA-VALIDATOR-001.
 * One-off script, safe to remove after run.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const retro = JSON.parse(readFileSync(process.argv[2], 'utf-8'));

const { data, error } = await supabase
  .from('retrospectives')
  .insert(retro)
  .select('id, sd_id, retro_type, title, created_at')
  .single();

if (error) {
  console.error('INSERT FAILED:', error);
  process.exit(1);
}

console.log('INSERTED:', JSON.stringify(data, null, 2));
