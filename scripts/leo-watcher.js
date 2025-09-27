#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';




/**
 * LEO Protocol File Watcher
 * Monitors for protocol changes and auto-updates CLAUDE.md
 * Can run as a background service
 */

import dotenv from "dotenv";
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { LEOAutoInit } from './leo-auto-init.js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

class LEOWatcher {
  constructor() {
    this.interval = 60000; // Check every minute by default
    this.running = false;
    this.lastCheck = null;
    this.lastVersion = null;
    
    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.hasDatabase = true;
    } else {
      this.hasDatabase = false;
    }
  }
  
  async start() {
    if (this.running) {
      console.log('⚠️ Watcher already running');
      return;
    }
    
    console.log('🔍 LEO Protocol Watcher Started');
    console.log(`   Checking every ${this.interval / 1000} seconds`);
    console.log('   Press Ctrl+C to stop\n');
    
    this.running = true;
    
    // Initial check
    await this.check();
    
    // Set up interval
    this.intervalId = setInterval(() => {
      this.check().catch(error => {
        console.error('⚠️ Check failed:', error.message);
      });
    }, this.interval);
    
    // Set up Supabase real-time subscription if available
    if (this.hasDatabase) {
      this.setupRealtimeSubscription();
    }
    
    // Handle graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }
  
  async check() {
    const now = new Date();
    console.log(`[${now.toLocaleTimeString()}] Checking for updates...`);
    
    try {
      // Check database for current version
      const currentVersion = await this.getCurrentVersion();
      
      if (currentVersion !== this.lastVersion) {
        console.log(`   📢 Version changed: ${this.lastVersion || 'none'} → ${currentVersion}`);
        
        // Run auto-init to update CLAUDE.md
        const autoInit = new LEOAutoInit({ silent: false, force: true });
        const result = await autoInit.initialize();
        
        if (result.updated) {
          console.log(`   ✅ CLAUDE.md updated to v${result.version}`);
          this.lastVersion = currentVersion;
        }
      } else {
        console.log(`   ✓ No changes (v${currentVersion})`);
      }
      
      this.lastCheck = now;
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
  
  async getCurrentVersion() {
    if (!this.hasDatabase) {
      // Fall back to file-based detection
      import detector from './get-latest-leo-protocol-version.js';
      return detector.getLatestVersion();
    }
    
    try {
      const { data, error } = await this.supabase
        .from('leo_protocols')
        .select('version')
        .eq('status', 'active')
        .single();
      
      if (data) {
        return data.version;
      }
    } catch (error) {
      // Ignore errors, return cached version
    }
    
    return this.lastVersion || 'unknown';
  }
  
  setupRealtimeSubscription() {
    // Subscribe to changes in leo_protocols table
    this.subscription = this.supabase
      .channel('leo-protocol-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'leo_protocols'
      }, payload => {
        console.log('\n🔔 Real-time update detected!');
        this.check();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'leo_sub_agents'
      }, payload => {
        console.log('\n🔔 Sub-agent update detected!');
        this.check();
      })
      .subscribe();
    
    console.log('📡 Real-time subscriptions active');
  }
  
  async stop() {
    console.log('\n\n🛑 Stopping watcher...');
    
    this.running = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    if (this.subscription) {
      await this.supabase.removeChannel(this.subscription);
    }
    
    // Save state
    const stateFile = path.join(__dirname, '..', '.leo-watcher.json');
    const state = {
      lastCheck: this.lastCheck,
      lastVersion: this.lastVersion,
      stopped: new Date().toISOString()
    };
    
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    
    console.log('✅ Watcher stopped');
    process.exit(0);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  daemon: args.includes('--daemon'),
  interval: parseInt(args.find(a => a.startsWith('--interval='))?.split('=')[1] || '60')
};

// Run the watcher
const watcher = new LEOWatcher();
watcher.interval = options.interval * 1000;

if (options.daemon) {
  // Run as daemon (detached)
  require('child_process').spawn(process.argv[0], [__filename], {
    detached: true,
    stdio: 'ignore'
  }).unref();
  
  console.log('🚀 Watcher started in background');
  process.exit(0);
} else {
  // Run in foreground
  watcher.start();
}
