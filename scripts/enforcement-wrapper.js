#!/usr/bin/env node

/**
 * ENFORCEMENT WRAPPER
 * Ensures all LEO operations go through database-first validation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class EnforcementWrapper {
  async validateOperation(operation, params) {
    const violations = [];

    // Check for file creation attempts
    if (operation.includes('create') || operation.includes('write')) {
      if (params.file_path && this.isProhibitedFile(params.file_path)) {
        violations.push({
          type: 'prohibited_file_creation',
          file: params.file_path,
          suggestion: 'Use database storage instead'
        });
      }
    }

    // Check for handoff creation
    if (operation.includes('handoff')) {
      const tableExists = await this.checkTable('leo_handoff_executions');
      if (!tableExists) {
        violations.push({
          type: 'missing_table',
          table: 'leo_handoff_executions',
          suggestion: 'Create table first using database-first-enforcer.js'
        });
      }
    }

    // Log compliance check
    await supabase.from('leo_protocol_compliance').insert({
      check_type: 'operation_validation',
      entity_type: 'operation',
      entity_id: operation,
      compliant: violations.length === 0,
      violations: violations.length > 0 ? violations : null,
      enforced_by: 'enforcement_wrapper'
    });

    return {
      allowed: violations.length === 0,
      violations
    };
  }

  isProhibitedFile(filePath) {
    const prohibited = [
      /PRD-.*\.md$/,
      /handoff-.*\.(md|json)$/,
      /verification-.*\.(md|json)$/,
      /LEAD-.*\.md$/,
      /PLAN-.*\.md$/,
      /EXEC-.*\.md$/
    ];

    return prohibited.some(pattern => pattern.test(filePath));
  }

  async checkTable(tableName) {
    const { error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    return !error;
  }
}

// Export for use in other scripts
export default EnforcementWrapper;

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const wrapper = new EnforcementWrapper();
  const operation = process.argv[2];
  const params = JSON.parse(process.argv[3] || '{}');

  const result = await wrapper.validateOperation(operation, params);
  if (!result.allowed) {
    console.error('⛔ Operation blocked by enforcement wrapper:');
    result.violations.forEach(v => {
      console.error(`   ❌ ${v.type}: ${v.suggestion}`);
    });
    process.exit(1);
  }

  console.log('✅ Operation allowed');
}
