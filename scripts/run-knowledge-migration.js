#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function runMigration() {
  console.log('🚀 Running Knowledge Retrieval System Migration\n');

  const sqlFile = fs.readFileSync('supabase/ehg_engineer/migrations/20251015200000_knowledge_retrieval_system.sql', 'utf8');

  console.log('📄 Reading migration file: 196 lines, 6.5KB\n');
  
  // Supabase JS client doesn't support multi-statement SQL execution
  // Must use SQL Editor or CLI
  console.log('⚠️  Supabase JS client cannot execute multi-statement SQL files');
  console.log('\n📋 Manual Migration Required:');
  console.log('   1. Open Supabase SQL Editor');
  console.log('   2. Copy and paste migration file content');
  console.log('   3. File location: supabase/ehg_engineer/migrations/20251015200000_knowledge_retrieval_system.sql');
  console.log('   4. Click "Run" to execute');
  console.log('\n✨ What will be created:');
  console.log('   - 3 tables (tech_stack_references, prd_research_audit_log, system_health)');
  console.log('   - 2 column additions (implementation_context, research_confidence_score)');
  console.log('   - 5 indexes');
  console.log('   - 8 RLS policies');
  console.log('   - 1 cleanup function');
  
  console.log('\n🔗 Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql');
}

runMigration();
