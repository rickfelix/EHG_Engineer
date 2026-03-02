#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


/**
 * Apply UI Validation Schema to Database
 * LEO Protocol v4.3.1 Enhancement
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

async function applyUIValidationSchema() {
  // Initialize Supabase client
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );

  console.log('🔄 Applying UI Validation Schema...');
  
  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '../database/migrations/008_ui_validation_schema.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL into individual statements
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    let _successCount = 0;
    let _errorCount = 0;
    
    // Execute each statement
    for (const statement of statements) {
      // Skip comments and empty statements
      if (!statement || statement.startsWith('--')) continue;
      
      try {
        // For CREATE TABLE statements, use direct SQL
        if (statement.toUpperCase().includes('CREATE')) {
          // Use RPC to execute raw SQL
          const { error } = await supabase.rpc('exec_sql', {
            query: statement + ';'
          }).single();
          
          if (error) {
            // If RPC doesn't exist, skip (we'll handle tables differently)
            console.log('⚠️  Skipping direct SQL execution (RPC not available)');
          } else {
            _successCount++;
            console.log(`✅ Executed: ${statement.substring(0, 50)}...`);
          }
        }
      } catch (_error) {
        _errorCount++;
        console.error('❌ Failed to execute statement');
      }
    }
    
    // Create tables using Supabase API approach
    console.log('\n📊 Creating tables via Supabase API...');
    
    // Check if tables exist by trying to query them
    const tablesToCreate = [
      'ui_validation_results',
      'prd_ui_mappings', 
      'validation_evidence',
      'ui_validation_checkpoints'
    ];
    
    for (const tableName of tablesToCreate) {
      try {
        const { data: _data, error } = await supabase
          .from(tableName)
          .select('id')
          .limit(1);
        
        if (error && error.code === '42P01') {
          console.log(`❌ Table ${tableName} does not exist - manual creation needed`);
        } else if (!error) {
          console.log(`✅ Table ${tableName} exists`);
        }
      } catch (_error) {
        console.log(`⚠️  Cannot verify table ${tableName}`);
      }
    }
    
    // Insert validation rules
    console.log('\n📋 Inserting validation rules...');
    
    const validationRules = [
      {
        rule_code: 'UI_REQUIRES_TESTING',
        rule_name: 'UI Implementation Requires Testing Validation',
        description: 'All UI implementations must be validated by Testing Sub-Agent before completion',
        enforcement_level: 'mandatory',
        active: true
      },
      {
        rule_code: 'SCREENSHOT_EVIDENCE',
        rule_name: 'Screenshot Evidence Mandatory',
        description: 'UI tasks require screenshot evidence from automated testing',
        enforcement_level: 'mandatory',
        active: true
      },
      {
        rule_code: 'DESIGN_NEEDS_VERIFICATION',
        rule_name: 'Design Output Requires Testing Verification',
        description: 'Design Sub-Agent outputs must be verified by Testing Sub-Agent',
        enforcement_level: 'mandatory',
        active: true
      },
      {
        rule_code: 'PRD_UI_GAP_CHECK',
        rule_name: 'PRD to UI Gap Analysis Required',
        description: 'Testing must validate all PRD UI requirements are implemented',
        enforcement_level: 'mandatory',
        active: true
      },
      {
        rule_code: 'VISUAL_REGRESSION',
        rule_name: 'Visual Regression Testing for UI Changes',
        description: 'UI changes require visual regression testing against baseline',
        enforcement_level: 'recommended',
        active: true
      }
    ];
    
    for (const rule of validationRules) {
      try {
        const { error } = await supabase
          .from('leo_validation_rules')
          .upsert(rule, { onConflict: 'rule_code' });
        
        if (error) {
          console.log(`⚠️  Could not insert rule ${rule.rule_code}:`, error.message);
        } else {
          console.log(`✅ Inserted rule: ${rule.rule_code}`);
        }
      } catch (error) {
        console.log(`❌ Failed to insert rule ${rule.rule_code}:`, error.message);
      }
    }
    
    // Insert validation checkpoints  
    console.log('\n🚦 Inserting validation checkpoints...');
    
    const checkpoints = [
      {
        checkpoint_name: 'UI Implementation Validation',
        checkpoint_type: 'post_implementation',
        required_tests: ['component_render', 'responsive_design', 'accessibility'],
        required_coverage: 80.0,
        required_screenshots: 3,
        block_on_failure: true,
        active: true
      },
      {
        checkpoint_name: 'PRD Requirement Verification',
        checkpoint_type: 'pre_completion',
        required_tests: ['prd_mapping', 'feature_coverage', 'gap_analysis'],
        required_coverage: 80.0,
        required_screenshots: 3,
        block_on_failure: true,
        active: true
      },
      {
        checkpoint_name: 'Visual Regression Check',
        checkpoint_type: 'regression',
        required_tests: ['screenshot_comparison', 'layout_stability'],
        required_coverage: 70.0,
        required_screenshots: 2,
        block_on_failure: false,
        active: true
      }
    ];
    
    for (const checkpoint of checkpoints) {
      try {
        const { error } = await supabase
          .from('ui_validation_checkpoints')
          .upsert(checkpoint, { onConflict: 'checkpoint_name' });
        
        if (error) {
          console.log(`⚠️  Could not insert checkpoint ${checkpoint.checkpoint_name}:`, error.message);
        } else {
          console.log(`✅ Inserted checkpoint: ${checkpoint.checkpoint_name}`);
        }
      } catch (error) {
        console.log(`❌ Failed to insert checkpoint ${checkpoint.checkpoint_name}:`, error.message);
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`Tables to be created: ${tablesToCreate.length}`);
    console.log(`Validation rules: ${validationRules.length}`);
    console.log(`Checkpoints: ${checkpoints.length}`);
    
    console.log('\n⚠️  Note: Some tables may need to be created manually in Supabase dashboard:');
    console.log('1. ui_validation_results');
    console.log('2. prd_ui_mappings');
    console.log('3. validation_evidence');
    console.log('4. ui_validation_checkpoints');
    console.log('\n📄 SQL file location: database/migrations/008_ui_validation_schema.sql');
    
    return {
      success: true,
      message: 'Schema preparation complete - manual table creation may be required'
    };
    
  } catch (error) {
    console.error('❌ Failed to apply schema:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  applyUIValidationSchema()
    .then(result => {
      if (result.success) {
        console.log('\n✅ UI Validation schema preparation complete!');
        console.log('📝 Next steps:');
        console.log('1. Go to Supabase dashboard');
        console.log('2. Run the SQL from database/migrations/008_ui_validation_schema.sql');
        console.log('3. Verify all tables are created');
      } else {
        console.error('\n❌ Schema application failed:', result.error);
      }
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}

export {  applyUIValidationSchema  };
