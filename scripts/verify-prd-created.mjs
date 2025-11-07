#!/usr/bin/env node

/**
 * Verify PRD Creation
 * Context: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001 PLAN phase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function verifyPRD() {
  console.log('🔍 Verifying PRD-SD-CREWAI-COMPETITIVE-INTELLIGENCE-001...\n');

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .select('id, title, status, created_at, directive_id, sd_uuid')
    .eq('id', 'PRD-SD-CREWAI-COMPETITIVE-INTELLIGENCE-001')
    .maybeSingle();

  if (error) {
    console.log('❌ Error:', error.message);
    process.exit(1);
  }

  if (!data) {
    console.log('❌ PRD not found in database');
    process.exit(1);
  }

  console.log('✅ PRD found in database:\n');
  console.log(JSON.stringify(data, null, 2));
  console.log('\n✅ PRD creation verified!');
}

verifyPRD();
