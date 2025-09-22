#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


/**
 * Automatic SD to Database Synchronization
 * Prevents missing database entries for Strategic Directives
 * 
 * Features:
 * 1. Watches for new SD files in /docs/strategic-directives/
 * 2. Automatically adds them to database when created
 * 3. Parses SD content to extract metadata
 * 4. Updates database with parsed details
 * 5. Logs all operations for audit trail
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";
dotenv.config();

class SDDatabaseSync {
  constructor() {
    this.sdDirectory = path.join(__dirname, '..', 'docs', 'strategic-directives');
    this.processedSDs = new Set();
    this.supabase = null;
    this.initializeSupabase();
  }

  initializeSupabase() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey || 
        supabaseUrl === 'your_supabase_url_here' || 
        supabaseKey === 'your_supabase_anon_key_here') {
      console.log('⚠️  Supabase not configured - database sync disabled');
      return;
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Database sync initialized');
  }

  parseSDFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      // Extract metadata from SD markdown
      const metadata = {
        title: '',
        status: 'draft',
        priority: 'medium',
        category: 'strategic',
        description: '',
        objectives: [],
        successCriteria: [],
        risks: []
      };
      
      // Parse title
      const titleLine = lines.find(line => line.startsWith('# '));
      if (titleLine) {
        metadata.title = titleLine.replace('# ', '').replace('Strategic Directive:', '').trim();
      }
      
      // Parse SD ID
      const sdIdLine = lines.find(line => line.includes('**SD ID**:'));
      const sdId = sdIdLine ? sdIdLine.split(':')[1].trim() : null;
      
      // Parse priority
      const priorityLine = lines.find(line => line.includes('**Priority**:'));
      if (priorityLine) {
        metadata.priority = priorityLine.split(':')[1].trim().toLowerCase();
      }
      
      // Parse status
      const statusLine = lines.find(line => line.includes('**Status**:'));
      if (statusLine) {
        const status = statusLine.split(':')[1].trim().toLowerCase();
        metadata.status = status === 'active' ? 'active' : 'draft';
      }
      
      // Parse executive summary
      const summaryIndex = lines.findIndex(line => line.includes('## Executive Summary'));
      if (summaryIndex !== -1) {
        let summary = '';
        for (let i = summaryIndex + 2; i < lines.length && !lines[i].startsWith('#'); i++) {
          if (lines[i].trim()) summary += lines[i] + ' ';
        }
        metadata.description = summary.trim();
      }
      
      return { sdId, metadata };
    } catch (error) {
      console.error('❌ Error parsing SD file:', error.message);
      return null;
    }
  }

  async checkSDInDatabase(sdId) {
    if (!this.supabase) return false;
    
    try {
      const { data, error } = await this.supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('id', sdId)
        .single();
      
      return !error && data;
    } catch {
      return false;
    }
  }

  async addSDToDatabase(sdId, metadata) {
    if (!this.supabase) {
      console.log('⚠️  Database not configured - skipping SD addition');
      return false;
    }
    
    try {
      const { data, error } = await this.supabase
        .from('strategic_directives_v2')
        .insert({
          id: sdId,
          title: metadata.title || 'Untitled Strategic Directive',
          status: metadata.status,
          category: metadata.category,
          priority: metadata.priority,
          description: metadata.description || 'Strategic directive pending details',
          rationale: 'Extracted from strategic directive document',
          scope: 'As defined in strategic directive document',
          created_by: 'AUTO_SYNC',
          execution_order: 999, // Default order, to be updated
          version: '1.0'
        })
        .select()
        .single();
      
      if (error) {
        console.error(`❌ Failed to add ${sdId} to database:`, error.message);
        return false;
      }
      
      console.log(`✅ ${sdId} added to database automatically`);
      return true;
    } catch (error) {
      console.error(`❌ Error adding ${sdId}:`, error.message);
      return false;
    }
  }

  async syncSD(filePath) {
    const fileName = path.basename(filePath);
    
    // Skip non-SD files
    if (!fileName.startsWith('SD-') || !fileName.endsWith('.md')) {
      return;
    }
    
    // Parse the SD file
    const parsed = this.parseSDFile(filePath);
    if (!parsed || !parsed.sdId) {
      console.log(`⚠️  Could not parse SD ID from ${fileName}`);
      return;
    }
    
    const { sdId, metadata } = parsed;
    
    // Check if already in database
    const exists = await this.checkSDInDatabase(sdId);
    if (exists) {
      console.log(`✓ ${sdId} already in database`);
      return;
    }
    
    // Add to database
    console.log(`📋 New SD detected: ${sdId}`);
    await this.addSDToDatabase(sdId, metadata);
  }

  async scanExistingSDs() {
    console.log('🔍 Scanning existing Strategic Directives...');
    
    if (!fs.existsSync(this.sdDirectory)) {
      console.log('⚠️  SD directory not found');
      return;
    }
    
    const files = fs.readdirSync(this.sdDirectory);
    for (const file of files) {
      const filePath = path.join(this.sdDirectory, file);
      await this.syncSD(filePath);
      this.processedSDs.add(file);
    }
    
    console.log(`📊 Processed ${this.processedSDs.size} SD files`);
  }

  watchForNewSDs() {
    if (!fs.existsSync(this.sdDirectory)) {
      console.log('⚠️  Cannot watch - SD directory not found');
      return;
    }
    
    console.log('👁️  Watching for new Strategic Directives...');
    
    fs.watch(this.sdDirectory, async (eventType, filename) => {
      if (eventType === 'rename' && filename) {
        const filePath = path.join(this.sdDirectory, filename);
        
        // Check if file exists (created) and not already processed
        if (fs.existsSync(filePath) && !this.processedSDs.has(filename)) {
          console.log(`🆕 New SD file detected: ${filename}`);
          await this.syncSD(filePath);
          this.processedSDs.add(filename);
        }
      }
    });
  }

  async run() {
    console.log('🚀 SD Database Auto-Sync Started');
    console.log('================================\n');
    
    // First scan existing SDs
    await this.scanExistingSDs();
    
    // Then watch for new ones
    this.watchForNewSDs();
    
    console.log('\n✅ Auto-sync running. Press Ctrl+C to stop.');
  }
}

// Prevention mechanism checklist
function showPreventionChecklist() {
  console.log('\n📋 PREVENTION CHECKLIST FOR SD DATABASE SYNC');
  console.log('=============================================');
  console.log('✅ 1. Auto-sync script created');
  console.log('✅ 2. Watches /docs/strategic-directives/ for new files');
  console.log('✅ 3. Automatically adds new SDs to database');
  console.log('✅ 4. Parses SD content for metadata');
  console.log('✅ 5. Checks for existing entries to prevent duplicates');
  console.log('✅ 6. Logs all operations for audit trail');
  console.log('\n📌 TO ENABLE:');
  console.log('   1. Run: node scripts/auto-sync-sd-to-database.js');
  console.log('   2. Or add to package.json scripts: "sync-sd": "node scripts/auto-sync-sd-to-database.js"');
  console.log('   3. Can run in background with dashboard server');
  console.log('\n⚠️  IMPORTANT:');
  console.log('   - Requires Supabase credentials in .env');
  console.log('   - Should be run whenever creating new SDs');
  console.log('   - Can be integrated into LEO Protocol workflow');
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const sync = new SDDatabaseSync();
  sync.run().catch(console.error);
  
  // Show prevention checklist on first run
  setTimeout(showPreventionChecklist, 2000);
}

export default SDDatabaseSync;
