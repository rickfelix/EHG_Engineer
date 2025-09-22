#!/usr/bin/env node

/**
 * Create UI Validation Tables
 * Uses the working DatabaseManager to create tables programmatically
 */

import dotenv from 'dotenv';
import { DatabaseManager } from '../src/services/DatabaseManager.js';

dotenv.config();

async function createUIValidationTables() {
  console.log('====================================');
  console.log('🚀 Creating UI Validation Tables');
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
    // 1. Create ui_validation_results table
    console.log('Creating ui_validation_results table...');
    await dbManager.executeDDL(`
      CREATE TABLE IF NOT EXISTS ui_validation_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prd_id VARCHAR(255) NOT NULL,
        sd_id VARCHAR(255),
        test_run_id VARCHAR(255) UNIQUE NOT NULL,
        test_type VARCHAR(50) NOT NULL,
        total_tests INTEGER DEFAULT 0,
        passed_tests INTEGER DEFAULT 0,
        failed_tests INTEGER DEFAULT 0,
        warnings INTEGER DEFAULT 0,
        success_rate DECIMAL(5,2) DEFAULT 0,
        validation_status VARCHAR(50) NOT NULL,
        ui_complete BOOLEAN DEFAULT FALSE,
        gaps_detected JSONB DEFAULT '[]',
        screenshots JSONB DEFAULT '[]',
        test_report JSONB,
        error_logs TEXT,
        tested_by VARCHAR(100) DEFAULT 'Testing Sub-Agent',
        test_duration_ms INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ ui_validation_results table created');

    // 2. Create prd_ui_mappings table
    console.log('Creating prd_ui_mappings table...');
    await dbManager.executeDDL(`
      CREATE TABLE IF NOT EXISTS prd_ui_mappings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prd_id VARCHAR(255) NOT NULL,
        requirement_id VARCHAR(255) NOT NULL,
        requirement_text TEXT NOT NULL,
        ui_component VARCHAR(255),
        ui_selector VARCHAR(255),
        ui_testid VARCHAR(255),
        expected_behavior TEXT,
        is_implemented BOOLEAN DEFAULT FALSE,
        is_validated BOOLEAN DEFAULT FALSE,
        validation_date TIMESTAMP WITH TIME ZONE,
        validation_screenshot VARCHAR(500),
        priority VARCHAR(20) DEFAULT 'medium',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(prd_id, requirement_id)
      )
    `);
    console.log('✅ prd_ui_mappings table created');

    // 3. Create validation_evidence table
    console.log('Creating validation_evidence table...');
    await dbManager.executeDDL(`
      CREATE TABLE IF NOT EXISTS validation_evidence (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        validation_id UUID REFERENCES ui_validation_results(id) ON DELETE CASCADE,
        evidence_type VARCHAR(50) NOT NULL,
        file_path VARCHAR(500),
        file_name VARCHAR(255),
        file_size INTEGER,
        mime_type VARCHAR(100),
        component_name VARCHAR(255),
        test_case VARCHAR(255),
        viewport_size VARCHAR(50),
        elements_found JSONB DEFAULT '[]',
        elements_missing JSONB DEFAULT '[]',
        accessibility_issues JSONB DEFAULT '[]',
        performance_metrics JSONB,
        captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ validation_evidence table created');

    // 4. Create ui_validation_checkpoints table
    console.log('Creating ui_validation_checkpoints table...');
    await dbManager.executeDDL(`
      CREATE TABLE IF NOT EXISTS ui_validation_checkpoints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        checkpoint_name VARCHAR(255) NOT NULL,
        checkpoint_type VARCHAR(50) NOT NULL,
        required_tests JSONB DEFAULT '[]',
        required_coverage DECIMAL(5,2) DEFAULT 80.0,
        required_screenshots INTEGER DEFAULT 3,
        block_on_failure BOOLEAN DEFAULT TRUE,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ ui_validation_checkpoints table created');

    // 5. Insert default checkpoints
    console.log('Inserting default checkpoints...');
    await dbManager.query(`
      INSERT INTO ui_validation_checkpoints (checkpoint_name, checkpoint_type, required_tests, block_on_failure) 
      VALUES
        ('UI Implementation Validation', 'post_implementation', '["component_render", "responsive_design", "accessibility"]'::jsonb, TRUE),
        ('PRD Requirement Verification', 'pre_completion', '["prd_mapping", "feature_coverage", "gap_analysis"]'::jsonb, TRUE),
        ('Visual Regression Check', 'regression', '["screenshot_comparison", "layout_stability"]'::jsonb, FALSE)
      ON CONFLICT DO NOTHING
    `);
    console.log('✅ Default checkpoints inserted');

    // 6. Create indexes
    console.log('Creating indexes...');
    await dbManager.executeDDL(`
      CREATE INDEX IF NOT EXISTS idx_ui_validation_prd ON ui_validation_results(prd_id);
      CREATE INDEX IF NOT EXISTS idx_ui_validation_status ON ui_validation_results(validation_status);
      CREATE INDEX IF NOT EXISTS idx_prd_mappings_prd ON prd_ui_mappings(prd_id);
      CREATE INDEX IF NOT EXISTS idx_prd_mappings_implemented ON prd_ui_mappings(is_implemented);
      CREATE INDEX IF NOT EXISTS idx_evidence_validation ON validation_evidence(validation_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_type ON validation_evidence(evidence_type);
    `);
    console.log('✅ Indexes created');

    // 7. Create summary view
    console.log('Creating ui_validation_summary view...');
    await dbManager.executeDDL(`
      CREATE OR REPLACE VIEW ui_validation_summary AS
      SELECT 
        v.prd_id,
        v.sd_id,
        v.validation_status,
        v.success_rate,
        v.total_tests,
        v.passed_tests,
        v.failed_tests,
        COUNT(DISTINCT e.id) as evidence_count,
        COUNT(DISTINCT CASE WHEN e.evidence_type = 'screenshot' THEN e.id END) as screenshot_count,
        COALESCE(
          (SELECT COUNT(*) FROM prd_ui_mappings WHERE prd_id = v.prd_id AND is_implemented = true),
          0
        ) as implemented_requirements,
        COALESCE(
          (SELECT COUNT(*) FROM prd_ui_mappings WHERE prd_id = v.prd_id),
          0
        ) as total_requirements,
        v.created_at as last_validation_date
      FROM ui_validation_results v
      LEFT JOIN validation_evidence e ON e.validation_id = v.id
      GROUP BY v.id, v.prd_id, v.sd_id, v.validation_status, v.success_rate, 
               v.total_tests, v.passed_tests, v.failed_tests, v.created_at
      ORDER BY v.created_at DESC
    `);
    console.log('✅ ui_validation_summary view created');

    // 8. Verify all tables were created
    console.log('\n🔍 Verifying created tables...');
    const tables = [
      'ui_validation_results',
      'prd_ui_mappings',
      'validation_evidence',
      'ui_validation_checkpoints'
    ];

    for (const table of tables) {
      const exists = await dbManager.tableExists(table);
      console.log(`  ${table}: ${exists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    }

    console.log('\n====================================');
    console.log('✨ UI Validation Tables Created Successfully!');
    console.log('====================================\n');
    console.log('The following tables are now available:');
    console.log('  • ui_validation_results - Store test results');
    console.log('  • prd_ui_mappings - Map PRD requirements to UI');
    console.log('  • validation_evidence - Store test evidence');
    console.log('  • ui_validation_checkpoints - Define validation gates');
    console.log('  • ui_validation_summary - Aggregated view of results\n');
    
    console.log('🎯 Next Steps:');
    console.log('  1. Run PRD validation tests');
    console.log('  2. Use Testing Sub-Agent with these tables');
    console.log('  3. Enforce validation before UI completion');

  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
    throw error;
  } finally {
    await dbManager.shutdown();
  }
}

createUIValidationTables().catch(console.error);