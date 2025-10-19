#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('═══════════════════════════════════════════════════════════');
console.log('   LEAD PRE-APPROVAL: SELECT * Query Optimization');
console.log('═══════════════════════════════════════════════════════════\n');

const SD_ID = '49b6062c-1e22-4f20-85b2-a368eca0a4cd';

// Step 1: Query SD Metadata
console.log('Step 1: Query SD Metadata');
console.log('─'.repeat(60));
const { data: sd, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', SD_ID)
  .single();

if (sdError) {
  console.error('Error:', sdError);
  process.exit(1);
}

console.log(`SD ID: ${sd.id} (UUID - should be SD-XXX format)`);
console.log(`Title: ${sd.title}`);
console.log(`Status: ${sd.status}`);
console.log(`Priority: ${sd.priority}`);
console.log(`Category: ${sd.category || 'Not specified'}`);
console.log(`Target App: ${sd.target_application || 'Not specified'}`);
console.log('\nScope:');
console.log(sd.scope || 'Not specified');
console.log('\n');

// Step 2: Check for PRD
console.log('Step 2: Check for Existing PRD');
console.log('─'.repeat(60));
const { data: prds } = await supabase
  .from('product_requirements_v2')
  .select('id, title')
  .eq('directive_id', SD_ID);

console.log(prds && prds.length > 0 ? `✅ Found ${prds.length} PRD(s)` : '❌ No PRD found');
console.log('\n');

// Step 3: Check backlog
console.log('Step 3: Query Backlog Items');
console.log('─'.repeat(60));
const { data: backlog } = await supabase
  .from('sd_backlog_map')
  .select('*')
  .eq('sd_id', SD_ID);

console.log(backlog && backlog.length > 0 ? `✅ Found ${backlog.length} item(s)` : '⚠️  No backlog items found');
console.log('\n');

console.log('═══════════════════════════════════════════════════════════');
console.log('   SIMPLICITY FIRST GATE');
console.log('═══════════════════════════════════════════════════════════\n');
console.log('Issue 1: SD ID is UUID instead of SD-XXX format');
console.log('Issue 2: Title suggests query optimization (tactical, not strategic)');
console.log('\nAnalyzing scope for complexity...\n');

process.exit(0);
