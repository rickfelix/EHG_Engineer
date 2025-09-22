#!/usr/bin/env node

/**
 * Create SDIP/DirectiveLab Database Tables
 * Sets up tables for storing directive submissions and related data
 */

import dotenv from 'dotenv';
import { DatabaseManager } from '../src/services/DatabaseManager.js';

dotenv.config();

async function createSDIPTables() {
  console.log('====================================');
  console.log('🧪 Creating SDIP/DirectiveLab Tables');
  console.log('====================================\n');

  const dbConfig = {
    ehg_engineer: {
      appName: 'EHG Engineer Internal DB',
      projectUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      dbHost: 'aws-1-us-east-1.pooler.supabase.com',
      dbUser: 'postgres.dedlbzhpgkmetvhbkyzq',
      dbPassword: process.env.SUPABASE_DB_PASSWORD,
      dbPort: 5432,
      dbName: 'postgres'
    }
  };

  const dbManager = new DatabaseManager(dbConfig);
  await dbManager.initialize();
  await dbManager.switchDatabase('ehg_engineer');

  try {
    // 1. Create directive_submissions table
    console.log('Creating directive_submissions table...');
    await dbManager.executeDDL(`
      CREATE TABLE IF NOT EXISTS directive_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id VARCHAR(255) UNIQUE NOT NULL,
        chairman_input TEXT,
        screenshot_url TEXT,
        intent_summary TEXT,
        strategic_tactical_classification JSONB,
        synthesis_data JSONB,
        questions JSONB,
        final_summary TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        current_step INTEGER DEFAULT 1,
        completed_steps JSONB DEFAULT '[]',
        gate_status JSONB DEFAULT '{}',
        created_by VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE
      )
    `);
    console.log('✅ directive_submissions table created');

    // 2. Create submission_steps table
    console.log('Creating submission_steps table...');
    await dbManager.executeDDL(`
      CREATE TABLE IF NOT EXISTS submission_steps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id VARCHAR(255) REFERENCES directive_submissions(submission_id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        step_name VARCHAR(100) NOT NULL,
        step_data JSONB,
        validation_passed BOOLEAN DEFAULT FALSE,
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(submission_id, step_number)
      )
    `);
    console.log('✅ submission_steps table created');

    // 3. Create submission_screenshots table
    console.log('Creating submission_screenshots table...');
    await dbManager.executeDDL(`
      CREATE TABLE IF NOT EXISTS submission_screenshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id VARCHAR(255) REFERENCES directive_submissions(submission_id) ON DELETE CASCADE,
        screenshot_url TEXT NOT NULL,
        screenshot_data TEXT,
        mime_type VARCHAR(50),
        file_size INTEGER,
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ submission_screenshots table created');

    // 4. Create submission_groups table
    console.log('Creating submission_groups table...');
    await dbManager.executeDDL(`
      CREATE TABLE IF NOT EXISTS submission_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id VARCHAR(255) UNIQUE NOT NULL,
        group_name VARCHAR(255) NOT NULL,
        group_description TEXT,
        submission_ids JSONB DEFAULT '[]',
        metadata JSONB,
        created_by VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ submission_groups table created');

    // 5. Create sdip_ai_analysis table
    console.log('Creating sdip_ai_analysis table...');
    await dbManager.executeDDL(`
      CREATE TABLE IF NOT EXISTS sdip_ai_analysis (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id VARCHAR(255) REFERENCES directive_submissions(submission_id) ON DELETE CASCADE,
        analysis_type VARCHAR(50) NOT NULL,
        ai_provider VARCHAR(50) DEFAULT 'openai',
        model_used VARCHAR(100),
        prompt_used TEXT,
        response_data JSONB,
        confidence_score DECIMAL(3,2),
        processing_time_ms INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ sdip_ai_analysis table created');

    // 6. Create indexes
    console.log('Creating indexes...');
    await dbManager.executeDDL(`
      CREATE INDEX IF NOT EXISTS idx_submissions_status ON directive_submissions(status);
      CREATE INDEX IF NOT EXISTS idx_submissions_created ON directive_submissions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_submissions_user ON directive_submissions(created_by);
      CREATE INDEX IF NOT EXISTS idx_steps_submission ON submission_steps(submission_id);
      CREATE INDEX IF NOT EXISTS idx_screenshots_submission ON submission_screenshots(submission_id);
      CREATE INDEX IF NOT EXISTS idx_groups_created ON submission_groups(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_submission ON sdip_ai_analysis(submission_id);
    `);
    console.log('✅ Indexes created');

    // 7. Create view for recent submissions
    console.log('Creating recent_submissions view...');
    await dbManager.executeDDL(`
      CREATE OR REPLACE VIEW recent_submissions AS
      SELECT 
        ds.id,
        ds.submission_id,
        ds.chairman_input,
        ds.intent_summary,
        ds.status,
        ds.current_step,
        ds.created_at,
        ds.created_by,
        COUNT(DISTINCT ss.id) as screenshot_count,
        COUNT(DISTINCT st.id) as completed_steps_count,
        MAX(st.completed_at) as last_activity
      FROM directive_submissions ds
      LEFT JOIN submission_screenshots ss ON ds.submission_id = ss.submission_id
      LEFT JOIN submission_steps st ON ds.submission_id = st.submission_id AND st.validation_passed = true
      GROUP BY ds.id, ds.submission_id, ds.chairman_input, ds.intent_summary, 
               ds.status, ds.current_step, ds.created_at, ds.created_by
      ORDER BY ds.created_at DESC
      LIMIT 50
    `);
    console.log('✅ recent_submissions view created');

    // 8. Add SDIP methods to database loader
    console.log('Creating SDIP helper functions...');
    await dbManager.executeDDL(`
      CREATE OR REPLACE FUNCTION get_submission_progress(p_submission_id VARCHAR)
      RETURNS TABLE(
        submission_id VARCHAR,
        current_step INTEGER,
        total_steps INTEGER,
        completed_steps INTEGER,
        progress_percentage INTEGER
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          ds.submission_id,
          ds.current_step,
          6 as total_steps,
          COUNT(st.id)::INTEGER as completed_steps,
          ROUND((COUNT(st.id)::NUMERIC / 6) * 100)::INTEGER as progress_percentage
        FROM directive_submissions ds
        LEFT JOIN submission_steps st ON ds.submission_id = st.submission_id AND st.validation_passed = true
        WHERE ds.submission_id = p_submission_id
        GROUP BY ds.submission_id, ds.current_step;
      END;
      $$;
    `);
    console.log('✅ Helper functions created');

    // 9. Verify all tables were created
    console.log('\n🔍 Verifying created tables...');
    const tables = [
      'directive_submissions',
      'submission_steps',
      'submission_screenshots',
      'submission_groups',
      'sdip_ai_analysis'
    ];

    for (const table of tables) {
      const exists = await dbManager.tableExists(table);
      console.log(`  ${table}: ${exists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    }

    console.log('\n====================================');
    console.log('✨ SDIP/DirectiveLab Tables Created Successfully!');
    console.log('====================================\n');
    console.log('The following tables are now available:');
    console.log('  • directive_submissions - Main submission records');
    console.log('  • submission_steps - Individual step tracking');
    console.log('  • submission_screenshots - Screenshot storage');
    console.log('  • submission_groups - Group management');
    console.log('  • sdip_ai_analysis - AI processing results');
    console.log('  • recent_submissions - View for recent activity\n');
    
    console.log('🎯 Next Steps:');
    console.log('  1. Test DirectiveLab UI');
    console.log('  2. Submit test directive');
    console.log('  3. Verify data persistence');

  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
    throw error;
  } finally {
    await dbManager.shutdown();
  }
}

createSDIPTables().catch(console.error);