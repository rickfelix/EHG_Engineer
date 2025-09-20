#!/usr/bin/env node
/**
 * LEO Protocol Auto-Initialization System
 * Automatically ensures CLAUDE.md is always up-to-date
 * Runs silently and quickly on every LEO command
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Cache file to avoid excessive DB calls
const CACHE_FILE = path.join(__dirname, '..', '.leo-cache.json');
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const CLAUDE_MD_PATH = path.join(__dirname, '..', 'CLAUDE.md');

class LEOAutoInit {
  constructor(options = {}) {
    this.quick = options.quick || process.argv.includes('--quick');
    this.silent = options.silent || process.argv.includes('--silent');
    this.force = options.force || process.argv.includes('--force');
    
    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.hasDatabase = true;
    } else {
      this.hasDatabase = false;
    }
  }
  
  log(message) {
    if (!this.silent) {
      console.log(message);
    }
  }
  
  async initialize() {
    try {
      // Check if we need to update
      const needsUpdate = await this.checkIfUpdateNeeded();
      
      if (!needsUpdate && !this.force) {
        this.log('✅ LEO Protocol is up-to-date');
        return { updated: false, version: this.getCachedVersion() };
      }
      
      // Get latest from database
      const latestProtocol = await this.getLatestProtocol();
      
      if (!latestProtocol) {
        this.log('⚠️ Using file-based LEO Protocol (database unavailable)');
        return { updated: false, version: 'file-based' };
      }
      
      // Generate new CLAUDE.md
      await this.generateClaudeMd(latestProtocol);
      
      // Update cache
      await this.updateCache(latestProtocol);
      
      this.log(`✅ CLAUDE.md updated to v${latestProtocol.version}`);
      return { updated: true, version: latestProtocol.version };
      
    } catch (error) {
      if (!this.silent) {
        console.error('⚠️ Auto-init warning:', error.message);
      }
      // Don't fail - just continue with existing CLAUDE.md
      return { updated: false, error: error.message };
    }
  }
  
  async checkIfUpdateNeeded() {
    // If force flag, always update
    if (this.force) return true;
    
    // Check cache first
    if (this.quick && fs.existsSync(CACHE_FILE)) {
      try {
        const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        const cacheAge = Date.now() - new Date(cache.timestamp).getTime();
        
        if (cacheAge < CACHE_DURATION) {
          // Cache is fresh, check if CLAUDE.md matches
          if (fs.existsSync(CLAUDE_MD_PATH)) {
            const claudeMd = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');
            const currentHash = crypto.createHash('md5').update(claudeMd).digest('hex');
            
            if (currentHash === cache.contentHash) {
              // CLAUDE.md hasn't been modified
              return false;
            }
          }
        }
      } catch (e) {
        // Cache is invalid, needs update
      }
    }
    
    return true;
  }
  
  getCachedVersion() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        return cache.version;
      }
    } catch (e) {
      // Ignore cache errors
    }
    return 'unknown';
  }
  
  async getLatestProtocol() {
    if (!this.hasDatabase) {
      return null;
    }
    
    try {
      const { data, error } = await this.supabase
        .from('leo_protocols')
        .select('*')
        .eq('status', 'active')
        .single();
      
      if (error || !data) {
        return null;
      }
      
      // Get sub-agents
      const { data: subAgents } = await this.supabase
        .from('leo_sub_agents')
        .select(`
          *,
          triggers:leo_sub_agent_triggers(*)
        `)
        .eq('active', true);
      
      // Get handoff templates
      const { data: handoffTemplates } = await this.supabase
        .from('leo_handoff_templates')
        .select('*')
        .eq('active', true);
      
      // Get agents
      const { data: agents } = await this.supabase
        .from('leo_agents')
        .select('*')
        .order('agent_code');
      
      return {
        ...data,
        subAgents: subAgents || [],
        handoffTemplates: handoffTemplates || [],
        agents: agents || []
      };
    } catch (error) {
      return null;
    }
  }
  
  async generateClaudeMd(protocol) {
    const { CLAUDEMDGenerator } = await import('./generate-claude-md-from-db.js');
    const generator = new CLAUDEMDGenerator();
    
    // Use the generator's method but with our fetched data
    const content = generator.generateContent({
      protocol,
      agents: protocol.agents,
      subAgents: protocol.subAgents,
      handoffTemplates: protocol.handoffTemplates,
      validationRules: []
    });
    
    fs.writeFileSync(CLAUDE_MD_PATH, content);
  }
  
  async updateCache(protocol) {
    const claudeMd = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');
    const contentHash = crypto.createHash('md5').update(claudeMd).digest('hex');
    
    const cache = {
      version: protocol.version,
      timestamp: new Date().toISOString(),
      contentHash,
      protocolId: protocol.id
    };
    
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  }
}

// Export for use in other scripts
export { LEOAutoInit };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const autoInit = new LEOAutoInit();
  autoInit.initialize().then(result => {
    if (!autoInit.silent) {
      if (result.updated) {
        console.log('🔄 LEO Protocol synchronized');
      }
    }
    process.exit(0);
  }).catch(error => {
    console.error('❌ Auto-init failed:', error);
    process.exit(0); // Don't fail the parent process
  });
}