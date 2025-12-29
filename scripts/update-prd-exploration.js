#!/usr/bin/env node
/**
 * Update PRD with exploration_summary for documentation SDs
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const prdId = process.argv[2] || 'PRD-SD-DOCS-ARCH-001';

async function updatePRD() {
  const exploration_summary = [
    {
      file: 'EHG_Engineer/docs/',
      purpose: 'Existing documentation root for protocol and reference docs',
      findings: 'Contains reference/, guides/, and various markdown files'
    },
    {
      file: 'EHG_Engineer/CLAUDE.md',
      purpose: 'Main context router file',
      findings: 'Auto-generated from database, routes to phase-specific files'
    },
    {
      file: 'EHG_Engineer/CLAUDE_CORE.md',
      purpose: 'Core protocol context',
      findings: 'Contains essential workflow and validation rules'
    },
    {
      file: 'EHG/docs/',
      purpose: 'Application-specific documentation',
      findings: 'Contains API docs and application guides'
    },
    {
      file: 'database/schema/007_leo_protocol_schema_fixed.sql',
      purpose: 'Database schema for documentation storage',
      findings: 'Defines leo_protocol_sections and related tables'
    }
  ];

  const { data: _data, error } = await supabase
    .from('product_requirements_v2')
    .update({ exploration_summary })
    .eq('id', prdId)
    .select('id, title');

  if (error) {
    console.error(`Failed to update ${prdId}:`, error.message);
    process.exit(1);
  }

  console.log(`✅ Updated ${prdId} with exploration_summary (${exploration_summary.length} files)`);
}

updatePRD().catch(console.error);
