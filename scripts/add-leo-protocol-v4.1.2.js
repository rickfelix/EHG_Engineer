#!/usr/bin/env node
/**
 * Add LEO Protocol v4.1.2_database_first to Database
 */

import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addProtocol() {
  console.log('📝 Adding LEO Protocol v4.1.2_database_first...\n');
  
  // Add the protocol
  const protocol = {
    id: 'leo-v4-1-2-database-first',
    version: '4.1.2_database_first',
    status: 'active',
    title: 'LEO Protocol v4.1.2 - Database-First Enforcement',
    description: 'Database-first approach with sub-agent enforcement, 7-element handoffs, and strict phase validation',
    content: `# LEO Protocol v4.1.2 - Database-First Enforcement

## Core Principles
- Database is the single source of truth
- No strategic documents in filesystem
- Sub-agents activate automatically
- 7-element handoffs are mandatory
- LEAD-PLAN-EXEC workflow with verification

## Agent Responsibilities
- **LEAD (35%)**: Strategic planning (20%) + Final approval (15%)
- **PLAN (35%)**: Technical design (20%) + EXEC verification (15%)
- **EXEC (30%)**: Implementation only (no validation)

## Mandatory Handoff Elements
1. Executive Summary (≤200 tokens)
2. Completeness Report
3. Deliverables Manifest
4. Key Decisions & Rationale
5. Known Issues & Risks
6. Resource Utilization
7. Action Items for Receiver

## Sub-Agent Activation
Automatic activation on trigger phrases in PRDs and SDs.`,
    created_by: 'migration',
    metadata: {
      source: 'database-first migration',
      features: [
        'database-first',
        'sub-agent-enforcement',
        '7-element-handoffs',
        'phase-validation'
      ]
    }
  };
  
  const { data, error } = await supabase
    .from('leo_protocols')
    .upsert(protocol, { onConflict: 'id' })
    .select()
    .single();
  
  if (error) {
    console.error('❌ Error adding protocol:', error);
    return;
  }
  
  console.log('✅ Protocol added successfully');
  console.log(`   ID: ${data.id}`);
  console.log(`   Version: ${data.version}`);
  console.log(`   Status: ${data.status}`);
  
  // Add protocol sections
  const sections = [
    {
      protocol_id: 'leo-v4-1-2-database-first',
      section_type: 'agents',
      title: 'Agent Responsibilities',
      content: 'LEAD: Strategic (20%) + Approval (15%)\nPLAN: Design (20%) + Verification (15%)\nEXEC: Implementation (30%)',
      order_index: 1
    },
    {
      protocol_id: 'leo-v4-1-2-database-first',
      section_type: 'handoffs',
      title: 'Mandatory Handoff Requirements',
      content: '7 elements required: Executive Summary, Completeness Report, Deliverables Manifest, Key Decisions, Issues & Risks, Resource Utilization, Action Items',
      order_index: 2
    },
    {
      protocol_id: 'leo-v4-1-2-database-first',
      section_type: 'subagents',
      title: 'Sub-Agent System',
      content: 'Automatic activation on triggers. Database, Security, Design, Testing, Performance sub-agents.',
      order_index: 3
    }
  ];
  
  for (const section of sections) {
    await supabase
      .from('leo_protocol_sections')
      .upsert(section, { onConflict: ['protocol_id', 'section_type', 'order_index'] });
  }
  
  console.log('✅ Protocol sections added');
}

async function main() {
  await addProtocol();
}

main().catch(console.error);