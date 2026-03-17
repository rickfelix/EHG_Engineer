#!/usr/bin/env node

/**
 * Setup Learning Schema for Invisible Sub-Agent System
 * Creates all necessary tables for context learning and adaptation
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function setupLearningSchema() {
  console.log('🚀 Setting up Learning Schema for Invisible Sub-Agent System...');
  
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  
  try {
    // Read the schema file
    const schemaPath = path.join(__dirname, '../database/schema/009_context_learning_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split into individual statements (basic approach)
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && s !== '');
    
    console.log(`📝 Found ${statements.length} SQL statements to execute...`);
    
    // Execute each statement
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      try {
        // Skip comments and empty statements
        if (statement.trim().startsWith('COMMENT ON') || 
            statement.trim().startsWith('CREATE OR REPLACE FUNCTION') ||
            statement.trim().startsWith('CREATE TRIGGER') ||
            statement.trim().includes('language \'plpgsql\'')) {
          console.log(`⏩ Skipping statement ${i + 1}: Not supported in Supabase client`);
          continue;
        }
        
        const { data, error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          console.log(`❌ Statement ${i + 1} failed:`, error.message);
          errorCount++;
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
          successCount++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (err) {
        console.log(`❌ Statement ${i + 1} error:`, err.message);
        errorCount++;
      }
    }
    
    console.log(`\n📊 Schema setup completed:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    
    // Verify tables were created
    console.log('\n🔍 Verifying table creation...');
    const tables = ['user_context_patterns', 'interaction_history', 'agent_performance_metrics', 'learning_configurations'];
    
    for (const table of tables) {
      try {
        const { data, error } = await supabase.from(table).select('count').limit(1);
        if (error) {
          console.log(`❌ Table '${table}' verification failed`);
        } else {
          console.log(`✅ Table '${table}' is accessible`);
        }
      } catch (err) {
        console.log(`❌ Table '${table}' error: ${err.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Schema setup failed:', error);
    process.exit(1);
  }
}

// Alternative approach: Create tables directly with JavaScript
async function createTablesDirectly() {
  console.log('\n🔧 Creating tables directly...');
  
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  
  const tables = [
    {
      name: 'user_context_patterns',
      sql: `
        CREATE TABLE IF NOT EXISTS user_context_patterns (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          pattern_hash VARCHAR(64) NOT NULL UNIQUE,
          user_id VARCHAR(100),
          prompt_keywords JSONB NOT NULL DEFAULT '[]',
          file_patterns JSONB NOT NULL DEFAULT '[]',
          git_patterns JSONB NOT NULL DEFAULT '[]',
          project_patterns JSONB NOT NULL DEFAULT '[]',
          selected_agents JSONB NOT NULL DEFAULT '[]',
          coordination_strategy VARCHAR(50),
          frequency_count INTEGER NOT NULL DEFAULT 1,
          success_rate DECIMAL(3,2) NOT NULL DEFAULT 1.0,
          avg_confidence DECIMAL(3,2) NOT NULL DEFAULT 0.0,
          avg_execution_time INTEGER NOT NULL DEFAULT 0,
          user_feedback_score INTEGER,
          implicit_satisfaction DECIMAL(3,2),
          rejection_count INTEGER NOT NULL DEFAULT 0,
          first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_successful TIMESTAMPTZ,
          confidence_threshold DECIMAL(3,2),
          priority_weights JSONB
        )
      `
    },
    {
      name: 'interaction_history',
      sql: `
        CREATE TABLE IF NOT EXISTS interaction_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(100),
          session_id VARCHAR(100),
          interaction_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          prompt_text TEXT,
          prompt_hash VARCHAR(64) NOT NULL,
          prompt_length INTEGER NOT NULL DEFAULT 0,
          prompt_complexity DECIMAL(3,2) NOT NULL DEFAULT 0.0,
          file_context JSONB,
          git_context JSONB,
          error_context JSONB,
          project_context JSONB,
          analysis_method VARCHAR(50) NOT NULL,
          selected_agents JSONB NOT NULL DEFAULT '[]',
          total_agents_considered INTEGER NOT NULL DEFAULT 0,
          selection_confidence DECIMAL(3,2),
          selection_reasoning TEXT,
          agents_executed INTEGER NOT NULL DEFAULT 0,
          execution_time_ms INTEGER,
          success_count INTEGER NOT NULL DEFAULT 0,
          error_count INTEGER NOT NULL DEFAULT 0,
          enhancement_applied BOOLEAN NOT NULL DEFAULT false,
          enhancement_style VARCHAR(50),
          enhancement_length INTEGER,
          pattern_matched VARCHAR(64),
          threshold_adjustments JSONB,
          new_pattern_created BOOLEAN NOT NULL DEFAULT false,
          total_processing_time INTEGER,
          cache_hit BOOLEAN NOT NULL DEFAULT false
        )
      `
    },
    {
      name: 'learning_configurations',
      sql: `
        CREATE TABLE IF NOT EXISTS learning_configurations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          config_scope VARCHAR(50) NOT NULL,
          scope_id VARCHAR(100),
          auto_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.8,
          prompt_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.6,
          max_agents INTEGER NOT NULL DEFAULT 3,
          confidence_boost DECIMAL(3,2) NOT NULL DEFAULT 0.0,
          agent_weights JSONB,
          context_multipliers JSONB,
          learning_rate DECIMAL(4,3) NOT NULL DEFAULT 0.1,
          adaptation_window INTEGER NOT NULL DEFAULT 50,
          min_interactions_for_learning INTEGER NOT NULL DEFAULT 10,
          target_success_rate DECIMAL(3,2) NOT NULL DEFAULT 0.85,
          target_response_time INTEGER NOT NULL DEFAULT 3000,
          target_user_satisfaction DECIMAL(3,2) NOT NULL DEFAULT 0.8,
          total_adaptations INTEGER NOT NULL DEFAULT 0,
          last_adaptation TIMESTAMPTZ,
          adaptation_direction VARCHAR(20),
          current_success_rate DECIMAL(3,2),
          current_avg_response_time INTEGER,
          current_user_satisfaction DECIMAL(3,2),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(config_scope, scope_id)
        )
      `
    }
  ];
  
  for (const table of tables) {
    try {
      console.log(`Creating table: ${table.name}...`);
      
      // Use raw SQL execution (this might not work with Supabase client)
      // Instead, let's try to create a simple version first
      const { error } = await supabase.rpc('exec_sql', { sql: table.sql });
      
      if (error) {
        console.log(`❌ Failed to create ${table.name}:`, error.message);
      } else {
        console.log(`✅ Created table: ${table.name}`);
      }
    } catch (err) {
      console.log(`❌ Error creating ${table.name}:`, err.message);
    }
  }
  
  // Insert initial configuration
  try {
    const { error } = await supabase
      .from('learning_configurations')
      .insert({
        config_scope: 'global',
        auto_threshold: 0.8,
        prompt_threshold: 0.6,
        max_agents: 3
      });
      
    if (error && !error.message.includes('duplicate')) {
      console.log('❌ Failed to insert initial config:', error.message);
    } else {
      console.log('✅ Initial configuration created');
    }
  } catch (err) {
    console.log('❌ Initial config error:', err.message);
  }
}

if (require.main === module) {
  setupLearningSchema()
    .then(() => createTablesDirectly())
    .then(() => {
      console.log('\n🎉 Learning schema setup completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupLearningSchema, createTablesDirectly };