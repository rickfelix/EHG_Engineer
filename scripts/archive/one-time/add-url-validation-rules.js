#!/usr/bin/env node

/**
 * Add URL Validation Rules to LEO Protocol Database
 * Enforces URL verification requirements for EXEC implementation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function addValidationRules() {
  console.log('📝 Adding URL validation rules to database...\n');

  const validationRules = [
    {
      rule_name: 'PRD_MUST_SPECIFY_URL',
      rule_type: 'prd_requirement',
      description: 'PRD must include exact target URL with port number',
      validation_query: "SELECT COUNT(*) FROM prds WHERE id = $1 AND content LIKE '%http%:%//%:%' AND content LIKE '%port%'",
      error_message: 'PRD missing target URL with port specification',
      severity: 'critical',
      active: true
    },
    {
      rule_name: 'EXEC_URL_VERIFICATION',
      rule_type: 'exec_requirement',
      description: 'EXEC must verify URL accessibility before implementation',
      validation_query: 'SELECT COUNT(*) FROM implementation_verifications WHERE prd_id = $1 AND url_verified = true',
      error_message: 'EXEC failed to verify target URL before implementation',
      severity: 'critical',
      active: true
    },
    {
      rule_name: 'EXEC_COMPONENT_IDENTIFICATION',
      rule_type: 'exec_requirement',
      description: 'EXEC must identify exact component file path',
      validation_query: 'SELECT COUNT(*) FROM implementation_verifications WHERE prd_id = $1 AND component_path IS NOT NULL',
      error_message: 'EXEC failed to identify target component',
      severity: 'high',
      active: true
    },
    {
      rule_name: 'EXEC_SCREENSHOT_EVIDENCE',
      rule_type: 'exec_requirement',
      description: 'EXEC must capture screenshot before implementation',
      validation_query: 'SELECT COUNT(*) FROM implementation_verifications WHERE prd_id = $1 AND screenshot_path IS NOT NULL',
      error_message: 'EXEC failed to capture pre-implementation screenshot',
      severity: 'medium',
      active: true
    },
    {
      rule_name: 'HANDOFF_URL_INCLUSION',
      rule_type: 'handoff_requirement',
      description: 'Handoffs must prominently display target URL',
      validation_query: "SELECT COUNT(*) FROM handoffs WHERE id = $1 AND content LIKE '%Target URL:%'",
      error_message: 'Handoff missing prominent URL specification',
      severity: 'high',
      active: true
    }
  ];

  // Insert validation rules
  for (const rule of validationRules) {
    const { error } = await supabase
      .from('leo_validation_rules')
      .upsert(rule, { onConflict: 'rule_name' });
    
    if (error) {
      console.error(`❌ Error adding rule ${rule.rule_name}:`, error);
    } else {
      console.log(`✅ Added rule: ${rule.rule_name}`);
    }
  }

  // Create implementation_verifications table if it doesn't exist
  const tableCreationSQL = `
    CREATE TABLE IF NOT EXISTS implementation_verifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      prd_id TEXT NOT NULL,
      sd_id TEXT,
      url TEXT NOT NULL,
      url_verified BOOLEAN DEFAULT false,
      component_path TEXT,
      application_path TEXT,
      port INTEGER,
      screenshot_path TEXT,
      verification_timestamp TIMESTAMP DEFAULT NOW(),
      exec_agent_id TEXT,
      verification_report JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_impl_verif_prd ON implementation_verifications(prd_id);
    CREATE INDEX IF NOT EXISTS idx_impl_verif_sd ON implementation_verifications(sd_id);
  `;

  console.log('\n📊 Creating implementation_verifications table...');
  
  // Note: Direct SQL execution would require service role key
  // For now, document the SQL that needs to be run
  console.log('\nPlease run the following SQL in Supabase dashboard:');
  console.log('```sql');
  console.log(tableCreationSQL);
  console.log('```');

  // Add triggers for automatic validation
  const triggerSQL = `
    -- Trigger to enforce URL verification before implementation
    CREATE OR REPLACE FUNCTION check_url_verification()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM implementation_verifications 
        WHERE prd_id = NEW.prd_id 
        AND url_verified = true
      ) THEN
        RAISE EXCEPTION 'URL verification required before implementation';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Apply trigger to relevant tables (adjust table name as needed)
    -- CREATE TRIGGER enforce_url_verification
    -- BEFORE INSERT ON implementations
    -- FOR EACH ROW EXECUTE FUNCTION check_url_verification();
  `;

  console.log('\nOptional trigger for enforcement:');
  console.log('```sql');
  console.log(triggerSQL);
  console.log('```');

  console.log('\n✅ Validation rules added successfully!');
  console.log('\n📋 Summary:');
  console.log('- Added 5 validation rules');
  console.log('- Rules enforce URL specification and verification');
  console.log('- Severity levels: critical, high, medium');
  console.log('\n🎯 These rules will help prevent future implementation errors');
}

// Run the script
addValidationRules().catch(console.error);