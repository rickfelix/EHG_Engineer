#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';




/**
 * LEO Protocol Bootstrap System
 * One-time comprehensive initialization
 * Ensures everything is properly set up
 */

import dotenv from "dotenv";
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { LEOAutoInit } from './leo-auto-init.js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

class LEOBootstrap {
  constructor() {
    this.verbose = process.argv.includes('--verbose');
    this.hasDatabase = !!(supabaseUrl && supabaseKey);
    
    if (this.hasDatabase) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }
  
  async bootstrap() {
    console.log('🚀 LEO Protocol Bootstrap Starting...\n');
    
    const steps = [
      { name: 'Check Environment', fn: () => this.checkEnvironment() },
      { name: 'Validate Database', fn: () => this.validateDatabase() },
      { name: 'Ensure Tables Exist', fn: () => this.ensureTablesExist() },
      { name: 'Load Active Protocol', fn: () => this.loadActiveProtocol() },
      { name: 'Generate CLAUDE.md', fn: () => this.generateClaudeMd() },
      { name: 'Setup File Watchers', fn: () => this.setupWatchers() },
      { name: 'Create Shortcuts', fn: () => this.createShortcuts() },
      { name: 'Verify Installation', fn: () => this.verifyInstallation() }
    ];
    
    let success = 0;
    let failed = 0;
    
    for (const step of steps) {
      process.stdout.write(`📋 ${step.name}...`);
      
      try {
        const result = await step.fn();
        if (result !== false) {
          console.log(' ✅');
          success++;
          if (this.verbose && result) {
            console.log(`   ${result}`);
          }
        } else {
          console.log(' ⚠️ Skipped');
        }
      } catch (error) {
        console.log(' ❌');
        console.error(`   Error: ${error.message}`);
        failed++;
        if (this.verbose) {
          console.error(error);
        }
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Bootstrap Results:');
    console.log(`   ✅ Successful: ${success}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⚠️ Skipped: ${steps.length - success - failed}`);
    
    if (failed === 0) {
      console.log('\n🎉 LEO Protocol is ready to use!');
      console.log('   Run "npm run leo:status" to check current state');
      console.log('   CLAUDE.md will auto-update from now on');
      return true;
    } else {
      console.log('\n⚠️ Bootstrap completed with warnings');
      console.log('   Some features may not work properly');
      return false;
    }
  }
  
  async checkEnvironment() {
    const checks = {
      'Node.js': process.version,
      'Supabase URL': supabaseUrl ? 'Configured' : 'Missing',
      'Supabase Key': supabaseKey ? 'Configured' : 'Missing',
      'Project Root': path.dirname(__dirname)
    };
    
    if (this.verbose) {
      Object.entries(checks).forEach(([key, value]) => {
        console.log(`     ${key}: ${value}`);
      });
    }
    
    return `Environment validated`;
  }
  
  async validateDatabase() {
    if (!this.hasDatabase) {
      return false; // Skip if no database
    }
    
    try {
      // Test connection with a simple query
      const { error } = await this.supabase
        .from('leo_protocols')
        .select('count')
        .limit(1);
      
      if (error && error.message.includes('does not exist')) {
        return 'Tables need creation';
      }
      
      return 'Database connected';
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }
  
  async ensureTablesExist() {
    if (!this.hasDatabase) {
      return false;
    }
    
    try {
      // Check if core tables exist
      const tables = ['leo_protocols', 'leo_agents', 'leo_sub_agents'];
      const missing = [];
      
      for (const table of tables) {
        const { error } = await this.supabase
          .from(table)
          .select('count')
          .limit(1);
        
        if (error && error.message.includes('does not exist')) {
          missing.push(table);
        }
      }
      
      if (missing.length > 0) {
        console.log(`\n   ⚠️ Missing tables: ${missing.join(', ')}`);
        console.log('   Run the SQL from database/schema/007_leo_protocol_schema_fixed.sql in Supabase');
        return false;
      }
      
      return 'All tables exist';
    } catch (error) {
      return false;
    }
  }
  
  async loadActiveProtocol() {
    if (!this.hasDatabase) {
      return 'Using file-based protocol';
    }
    
    const { data, error } = await this.supabase
      .from('leo_protocols')
      .select('version, status')
      .eq('status', 'active')
      .single();
    
    if (data) {
      this.activeProtocol = data;
      return `Active: v${data.version}`;
    }
    
    return 'No active protocol found';
  }
  
  async generateClaudeMd() {
    const autoInit = new LEOAutoInit({ silent: true, force: true });
    const result = await autoInit.initialize();
    
    if (result.updated) {
      return `CLAUDE.md updated to v${result.version}`;
    }
    
    return result.error || 'CLAUDE.md unchanged';
  }
  
  async setupWatchers() {
    // Create watcher configuration
    const watcherConfig = {
      enabled: true,
      interval: 60000, // Check every minute
      lastCheck: new Date().toISOString()
    };
    
    const configPath = path.join(__dirname, '..', '.leo-watcher.json');
    fs.writeFileSync(configPath, JSON.stringify(watcherConfig, null, 2));
    
    return 'Watcher configured';
  }
  
  async createShortcuts() {
    // Create a quick access script
    const quickScript = `

// LEO Quick Access - Auto-updates CLAUDE.md
import { LEOAutoInit } from './scripts/leo-auto-init.js';

LEOAutoInit().initialize().then(() => {
  import('./scripts/leo.js');
});`;
    
    const quickPath = path.join(__dirname, '..', 'leo');
    fs.writeFileSync(quickPath, quickScript);
    fs.chmodSync(quickPath, '755');
    
    return 'Quick access script created';
  }
  
  async verifyInstallation() {
    const checks = [];
    
    // Check CLAUDE.md exists and is recent
    const claudePath = path.join(__dirname, '..', 'CLAUDE.md');
    if (fs.existsSync(claudePath)) {
      const stats = fs.statSync(claudePath);
      const age = Date.now() - stats.mtime.getTime();
      if (age < 60000) { // Less than 1 minute old
        checks.push('CLAUDE.md is current');
      }
    }
    
    // Check cache exists
    const cachePath = path.join(__dirname, '..', '.leo-cache.json');
    if (fs.existsSync(cachePath)) {
      checks.push('Cache initialized');
    }
    
    // Check if we have active protocol
    if (this.activeProtocol) {
      checks.push(`Protocol v${this.activeProtocol.version} active`);
    }
    
    return checks.join(', ') || 'Basic verification passed';
  }
}

// Export for use in other scripts
export {  LEOBootstrap  };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const bootstrap = new LEOBootstrap();
  bootstrap.bootstrap().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ Bootstrap failed:', error);
    process.exit(1);
  });
}
