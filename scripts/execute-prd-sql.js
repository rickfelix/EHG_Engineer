#!/usr/bin/env node

/**
 * Execute PRD SQL in Supabase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function executePRDSQL() {
  console.log('📊 Creating PRD table in Supabase...\n');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // First, create the PRD table
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS product_requirements_v2 (
        id VARCHAR(100) PRIMARY KEY,
        directive_id VARCHAR(50) REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        version VARCHAR(20) NOT NULL DEFAULT '1.0',
        status VARCHAR(50) NOT NULL CHECK (status IN ('draft', 'planning', 'in_progress', 'testing', 'approved', 'completed', 'archived')),
        category VARCHAR(50) NOT NULL,
        priority VARCHAR(20) NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
        executive_summary TEXT,
        business_context TEXT,
        technical_context TEXT,
        functional_requirements JSONB DEFAULT '[]'::jsonb,
        non_functional_requirements JSONB DEFAULT '[]'::jsonb,
        technical_requirements JSONB DEFAULT '[]'::jsonb,
        system_architecture TEXT,
        data_model JSONB DEFAULT '{}'::jsonb,
        api_specifications JSONB DEFAULT '[]'::jsonb,
        ui_ux_requirements JSONB DEFAULT '[]'::jsonb,
        implementation_approach TEXT,
        technology_stack JSONB DEFAULT '[]'::jsonb,
        dependencies JSONB DEFAULT '[]'::jsonb,
        test_scenarios JSONB DEFAULT '[]'::jsonb,
        acceptance_criteria JSONB DEFAULT '[]'::jsonb,
        performance_requirements JSONB DEFAULT '{}'::jsonb,
        plan_checklist JSONB DEFAULT '[]'::jsonb,
        exec_checklist JSONB DEFAULT '[]'::jsonb,
        validation_checklist JSONB DEFAULT '[]'::jsonb,
        progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
        phase VARCHAR(50) CHECK (phase IN ('planning', 'design', 'implementation', 'verification', 'approval')),
        phase_progress JSONB DEFAULT '{}'::jsonb,
        risks JSONB DEFAULT '[]'::jsonb,
        constraints JSONB DEFAULT '[]'::jsonb,
        assumptions JSONB DEFAULT '[]'::jsonb,
        stakeholders JSONB DEFAULT '[]'::jsonb,
        approved_by VARCHAR(100),
        approval_date TIMESTAMP,
        planned_start TIMESTAMP,
        planned_end TIMESTAMP,
        actual_start TIMESTAMP,
        actual_end TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(100),
        updated_by VARCHAR(100),
        metadata JSONB DEFAULT '{}'::jsonb,
        content TEXT,
        CONSTRAINT unique_prd_per_directive UNIQUE(directive_id)
      )
    `;
    
    // Execute via RPC if available, otherwise we'll need to use the SQL editor
    console.log('Note: Direct SQL execution may require service role key.');
    console.log('If this fails, please run the following SQL in Supabase SQL Editor:\n');
    console.log(createTableSQL);
    
    // Try to verify if table exists by querying it
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .limit(1);
    
    if (error && error.message.includes('relation')) {
      console.log('\n❌ Table does not exist. Please create it using Supabase SQL Editor.');
      console.log('Go to: ' + supabaseUrl);
      console.log('Navigate to SQL Editor and run the SQL above.');
    } else if (error) {
      console.log('\n⚠️  Error:', error.message);
    } else {
      console.log('\n✅ Table product_requirements_v2 exists or was created!');
      
      // Now add indexes
      console.log('Adding indexes...');
      const indexSQL = `
        CREATE INDEX IF NOT EXISTS idx_prd_status ON product_requirements_v2(status);
        CREATE INDEX IF NOT EXISTS idx_prd_directive ON product_requirements_v2(directive_id);
        CREATE INDEX IF NOT EXISTS idx_prd_priority ON product_requirements_v2(priority);
        CREATE INDEX IF NOT EXISTS idx_prd_created_at ON product_requirements_v2(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_prd_phase ON product_requirements_v2(phase);
      `;
      console.log('Please also run these indexes in SQL Editor:\n' + indexSQL);
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

executePRDSQL();