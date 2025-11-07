#!/usr/bin/env node
/**
 * Detect current active venture stage for pilot dossier generation
 * Filters: status IN ('active','in_progress'), is_test = false
 * Order: current_stage DESC, updated_at DESC
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

// Connect to EHG app database (not EHG_Engineer)
const supabaseUrl = process.env.EHG_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.EHG_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing EHG_SUPABASE_URL or EHG_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

try {
  const { data, error} = await supabase
    .from('ventures')
    .select('id, current_workflow_stage, status, created_at, name')
    .eq('status', 'active')
    .order('current_workflow_stage', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('❌ Database query error:', error.message);
    process.exit(1);
  }

  if (!data) {
    console.log('⚠️  No active ventures found');
    console.log('Using fallback: Stage 1 (Draft Idea)');
    console.log(JSON.stringify({ id: 'fallback', current_stage: 1, status: 'fallback', updated_at: new Date().toISOString(), name: 'Fallback - No Active Ventures' }, null, 2));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
} catch (err) {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
}
