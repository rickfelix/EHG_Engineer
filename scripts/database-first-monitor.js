#!/usr/bin/env node

import { watch } from 'fs';
import path from 'path';

const prohibitedPatterns = ["^PRD-.*\\.md$","^handoff-.*\\.(md|json)$","^verification-.*\\.(md|json)$","^LEAD-.*\\.md$","^PLAN-.*\\.md$","^EXEC-.*\\.md$","^.*-Final-Approval-.*\\.md$","^.*-Supervisor-Verification-.*\\.md$"];

console.log('🚨 DATABASE-FIRST MONITOR ACTIVE');
console.log('Watching for LEO Protocol violations...');

const directories = ['.', 'scripts', 'database', 'ops', 'prds', 'docs'];

directories.forEach(dir => {
  try {
    watch(dir, (eventType, filename) => {
      if (eventType === 'rename' && filename) {
        for (const pattern of prohibitedPatterns) {
          if (new RegExp(pattern).test(filename)) {
            console.error(`\n⛔ VIOLATION DETECTED: ${filename}`);
            console.error('❌ This file violates LEO Protocol database-first principles!');
            console.error('📝 Required Action: Store in database, not as file');
            console.error('🔧 Use appropriate script: unified-handoff-system.js, add-prd-to-database.js, etc.');

            // Log to compliance table
            logViolation(dir, filename);
          }
        }
      }
    });
  } catch (err) {
    // Directory might not exist
  }
});

async function logViolation(dir, filename) {
  // Log violation to database for tracking
  const { createClient } = await import('@supabase/supabase-js');
  const dotenv = await import('dotenv');
  dotenv.config();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  await supabase.from('leo_protocol_compliance').insert({
    check_type: 'file_creation_violation',
    entity_type: 'file',
    entity_id: path.join(dir, filename),
    compliant: false,
    violations: {
      type: 'prohibited_file_pattern',
      file: filename,
      directory: dir,
      timestamp: new Date().toISOString()
    },
    enforced_by: 'file_system_monitor'
  });
}
