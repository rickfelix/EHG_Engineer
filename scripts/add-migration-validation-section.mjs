#!/usr/bin/env node
/**
 * Add Database Migration Validation section to CLAUDE.md
 * Context: SD-RECONNECT-009 lesson learned
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const MIGRATION_VALIDATION_CONTENT = `## Database Migration Validation (MANDATORY)

**Context**: SD-RECONNECT-009 - Always validate migration scripts BEFORE troubleshooting connections.

### Pre-Migration Checklist

BEFORE attempting supabase db push or psql execution:

#### 1. Scan for Cross-Schema Foreign Keys
Check: grep -E "REFERENCES (auth|storage|extensions)\\." migration.sql

If found: Remove FK constraints. Supabase migrations cannot reference auth schema.

Fix:
-- WRONG: Cross-schema FK
documentation_author UUID REFERENCES auth.users(id),

-- CORRECT: UUID without FK
documentation_author UUID,  -- FK removed

#### 2. Check RLS Policies
Allowed: auth.uid() function calls
Blocked: FROM auth.users or JOIN auth.users

#### 3. Validate INSERT Statements
Check for hardcoded UUIDs referencing auth.users - use NULL instead.

#### 4. Common Errors

Error: relation "auth.users" does not exist
Fix: Remove REFERENCES auth.users

Error: permission denied for schema auth
Fix: Use auth.uid() only

Error: Tenant or user not found
Fix: Only check credentials AFTER validating script

**See docs/DATABASE_MIGRATION_CHECKLIST.md for full guide**`;

async function addSection() {
  console.log('Adding migration validation section...');

  const { data: protocol } = await supabase
    .from('leo_protocols')
    .select('id')
    .eq('status', 'active')
    .single();

  if (!protocol) {
    console.error('No active protocol found');
    return;
  }

  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .insert({
      protocol_id: protocol.id,
      section_type: 'best_practices',
      title: 'Database Migration Validation',
      content: MIGRATION_VALIDATION_CONTENT,
      order_index: 900,
      metadata: { source: 'SD-RECONNECT-009', date: '2025-10-04' }
    });

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✅ Section added/updated');
    console.log('Next: Run node scripts/generate-claude-md-from-db.js');
  }
}

addSection();
