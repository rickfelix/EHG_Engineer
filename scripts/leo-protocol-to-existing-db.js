#!/usr/bin/env node
/**
 * Store LEO Protocol in Existing Database Tables
 * Uses strategic_directives_v2 table to store protocol versions
 */

import dotenv from "dotenv";
dotenv.config();
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class LEOProtocolAdapter {
  async storeProtocolAsSD() {
    console.log('💡 Storing LEO Protocol in existing database structure...\n');
    
    // Create a special Strategic Directive for LEO Protocol itself
    const protocolSD = {
      id: 'SD-LEO-PROTOCOL-v4.1.2',
      title: 'LEO Protocol v4.1.2 Database-First System',
      status: 'active',
      priority: 'critical',
      category: 'system',
      description: 'Active LEO Protocol version and configuration',
      objectives: [
        'Database-first enforcement',
        'Sub-agent automatic activation',
        '7-element mandatory handoffs',
        'LEAD-PLAN-EXEC workflow'
      ],
      metadata: {
        type: 'leo_protocol',
        version: '4.1.2_database_first',
        sections: {
          agents: {
            LEAD: { planning: 20, approval: 15 },
            PLAN: { design: 20, verification: 15 },
            EXEC: { implementation: 30 }
          },
          subAgents: [
            { name: 'Database', code: 'DB', trigger: 'schema changes' },
            { name: 'Security', code: 'SEC', trigger: 'security mention' },
            { name: 'Design', code: 'DES', trigger: '2+ UI requirements' },
            { name: 'Testing', code: 'TEST', trigger: 'coverage >80%' },
            { name: 'Performance', code: 'PERF', trigger: 'metrics defined' }
          ],
          handoffElements: [
            'Executive Summary',
            'Completeness Report',
            'Deliverables Manifest',
            'Key Decisions & Rationale',
            'Known Issues & Risks',
            'Resource Utilization',
            'Action Items for Receiver'
          ]
        }
      }
    };
    
    // Store in database
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .upsert(protocolSD, { onConflict: 'id' })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Error storing protocol:', error);
      return false;
    }
    
    console.log('✅ LEO Protocol stored as Strategic Directive');
    console.log(`   ID: ${data.id}`);
    console.log(`   Version: ${data.metadata.version}`);
    
    // Also create PRD for protocol implementation details
    await this.createProtocolPRD();
    
    return true;
  }
  
  async createProtocolPRD() {
    const prd = {
      id: `PRD-LEO-${Date.now()}`,
      directive_id: 'SD-LEO-PROTOCOL-v4.1.2',
      title: 'LEO Protocol v4.1.2 Implementation Requirements',
      executive_summary: 'Technical requirements for LEO Protocol database-first system',
      technical_specifications: {
        database: {
          tables: [
            'leo_protocols',
            'leo_agents',
            'leo_sub_agents',
            'leo_handoff_templates'
          ]
        },
        subAgents: {
          activation: 'automatic on trigger phrases',
          handoff: '7 mandatory elements',
          validation: 'PLAN validates EXEC work'
        }
      },
      status: 'approved',
      phase: 'implementation'
    };
    
    const { error } = await supabase
      .from('product_requirements_v2')
      .upsert(prd, { onConflict: 'id' });
    
    if (!error) {
      console.log('✅ Protocol PRD created');
    }
  }
  
  async getActiveProtocol() {
    // Query for the LEO Protocol SD
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', 'SD-LEO-PROTOCOL-v4.1.2')
      .single();
    
    if (error || !data) {
      console.log('⚠️ No active protocol in database, using file-based');
      return null;
    }
    
    return {
      version: data.metadata.version,
      agents: data.metadata.sections.agents,
      subAgents: data.metadata.sections.subAgents,
      handoffElements: data.metadata.sections.handoffElements
    };
  }
}

async function main() {
  const adapter = new LEOProtocolAdapter();
  
  // Store protocol
  const stored = await adapter.storeProtocolAsSD();
  
  if (stored) {
    // Verify we can retrieve it
    const active = await adapter.getActiveProtocol();
    if (active) {
      console.log('\n📋 Active Protocol Retrieved:');
      console.log(`   Version: ${active.version}`);
      console.log(`   Sub-Agents: ${active.subAgents.length}`);
      console.log(`   Handoff Elements: ${active.handoffElements.length}`);
      
      console.log('\n✅ Database-first LEO Protocol ready!');
      console.log('Dashboard will now read from database instead of files');
    }
  }
}

main().catch(console.error);