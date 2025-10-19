#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Try different table names
console.log('Checking available tables...\n');

// Try v_handoff_chain (view suggested in error)
const { data: viewData, error: viewError } = await supabase
  .from('v_handoff_chain')
  .select('*')
  .limit(1);

if (!viewError) {
  console.log('✅ v_handoff_chain exists (view)');
  console.log('Columns:', Object.keys(viewData?.[0] || {}));
} else {
  console.log('❌ v_handoff_chain error:', viewError.message);
}

// Try leo_handoffs
const { data: handoffData, error: handoffError } = await supabase
  .from('leo_handoffs')
  .select('*')
  .limit(1);

if (!handoffError) {
  console.log('\n✅ leo_handoffs exists');
  console.log('Columns:', Object.keys(handoffData?.[0] || {}));
} else {
  console.log('\n❌ leo_handoffs error:', handoffError.message);
}

// Try handoffs
const { data: handoffsData, error: handoffsError } = await supabase
  .from('handoffs')
  .select('*')
  .limit(1);

if (!handoffsError) {
  console.log('\n✅ handoffs exists');
  console.log('Columns:', Object.keys(handoffsData?.[0] || {}));
} else {
  console.log('\n❌ handoffs error:', handoffsError.message);
}
