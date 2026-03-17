#!/usr/bin/env node
/**
 * Get Latest LEO Protocol Version from Database
 * Database-first approach for protocol version detection
 */

import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { LEOProtocolVersionDetector } from './get-latest-leo-protocol-version.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.log('Falling back to file-based detection...');
  require('./get-latest-leo-protocol-version.js');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class DatabaseProtocolDetector {
  async getLatestVersion() {
    try {
      // Get active protocol
      const { data: activeProtocol, error: activeError } = await supabase
        .from('leo_protocols')
        .select('*')
        .eq('status', 'active')
        .single();
      
      if (activeError || !activeProtocol) {
        console.warn('⚠️ No active protocol found in database');
        return this.fallbackToFiles();
      }
      
      // Get all protocols for summary
      const { data: allProtocols } = await supabase
        .from('leo_protocols')
        .select('id, version, status, title, superseded_by')
        .order('version', { ascending: false });
      
      // Get sub-agents
      const { data: subAgents } = await supabase
        .from('leo_sub_agents')
        .select('name, code, activation_type')
        .eq('active', true);
      
      // Display results
      this.displayResults(activeProtocol, allProtocols, subAgents);
      
      return activeProtocol.version;
      
    } catch (error) {
      console.error('❌ Database query failed:', error);
      return this.fallbackToFiles();
    }
  }
  
  displayResults(active, all, subAgents) {
    console.log('📋 LEO Protocol Database Status:');
    console.log('================================\n');
    
    console.log('🎯 ACTIVE PROTOCOL:');
    console.log(`   Version: v${active.version}`);
    console.log(`   Title: ${active.title}`);
    console.log(`   Status: ${active.status.toUpperCase()}`);
    console.log(`   ID: ${active.id}`);
    
    if (active.description) {
      console.log(`   Description: ${active.description.substring(0, 100)}...`);
    }
    
    console.log('\n📊 VERSION HISTORY:');
    const grouped = this.groupByStatus(all);
    
    if (grouped.active.length > 0) {
      console.log(`Active Versions: ${grouped.active.length}`);
      grouped.active.forEach(p => {
        console.log(`  ✅ v${p.version} - ${p.title || 'LEO Protocol'}`);
      });
    }
    
    if (grouped.superseded.length > 0) {
      console.log(`\nSuperseded Versions: ${grouped.superseded.length}`);
      grouped.superseded.slice(0, 5).forEach(p => {
        console.log(`  ⚠️ v${p.version} - Superseded by ${p.superseded_by || 'unknown'}`);
      });
      if (grouped.superseded.length > 5) {
        console.log(`  ... and ${grouped.superseded.length - 5} more`);
      }
    }
    
    if (subAgents && subAgents.length > 0) {
      console.log('\n🤖 ACTIVE SUB-AGENTS:');
      subAgents.forEach(sa => {
        console.log(`  • ${sa.name} (${sa.code}) - ${sa.activation_type}`);
      });
    }
    
    console.log('\n✅ DATABASE-FIRST PROTOCOL ACTIVE');
    console.log('📌 Source: Supabase Database (not files)');
  }
  
  groupByStatus(protocols) {
    const grouped = {
      active: [],
      superseded: [],
      draft: []
    };
    
    protocols.forEach(p => {
      if (p.status === 'active') grouped.active.push(p);
      else if (p.status === 'superseded') grouped.superseded.push(p);
      else if (p.status === 'draft') grouped.draft.push(p);
    });
    
    return grouped;
  }
  
  async fallbackToFiles() {
    console.log('\n⚠️ Falling back to file-based detection...');
    const detector = new LEOProtocolVersionDetector();
    return detector.scanProtocolFiles();
  }
}

// Export for use in other scripts
export {  DatabaseProtocolDetector  };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    const detector = new DatabaseProtocolDetector();
    const version = await detector.getLatestVersion();
    
    if (version) {
      console.log(`\n🟢 LATEST VERSION DETECTED: v${version}`);
      console.log('🎯 Use this version for all implementations\n');
    } else {
      console.log('\n❌ Could not determine latest version');
      process.exit(1);
    }
  }
  
  main().catch(console.error);
}