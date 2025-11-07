#!/usr/bin/env node

/**
 * Create Minimal PRD for SD-VENTURE-UNIFICATION-001
 * Per LEO Protocol v4.3.0 - PLAN Phase PRD Creation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createPRD() {
  console.log('📋 Creating PRD for SD-VENTURE-UNIFICATION-001...\n');

  // Get SD data
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, uuid_id, title, category, priority, description, scope, rationale')
    .eq('id', 'SD-VENTURE-UNIFICATION-001')
    .single();

  if (sdError || !sd) {
    console.error('❌ SD not found:', sdError?.message);
    process.exit(1);
  }

  console.log('✅ SD found:', sd.title);

  const prd = {
    id: 'PRD-VENTURE-UNIFICATION-001',
    directive_id: 'SD-VENTURE-UNIFICATION-001',
    sd_uuid: sd.uuid_id,
    title: sd.title,
    version: '1.0',
    status: 'planning',
    category: sd.category || 'feature',
    priority: sd.priority,
    executive_summary: `# Executive Summary

**Product**: Unified Venture Creation System with Intelligent Dependency-Driven Recursion

**Strategic Directive**: SD-VENTURE-UNIFICATION-001 (CRITICAL Priority)

**Problem**: Two parallel venture creation systems with zero integration. No smart recursion.

**Solution**: Unify systems with intelligent dependency-driven recursion.

**Timeline**: 11 weeks, ~144-166 hours across 5 implementation phases`,

    content: `# Product Requirements Document
## PRD-VENTURE-UNIFICATION-001

### Overview
${sd.description}

### Scope
${sd.scope}

### Rationale
${sd.rationale}

### Implementation
See Epic Execution Sequences in execution_sequences_v2 table (5 phases).

### Testing Strategy
- Tier 1: Smoke tests (MANDATORY)
- Tier 2: Comprehensive E2E (100% user story coverage)

### Component Sizing
Target: 300-600 LOC per component per LEO Protocol guidelines.

### Next Steps
1. Auto-generate user stories from success criteria
2. Run PRD enrichment (v4.3.0)
3. Define E2E test suite structure
4. Create PLAN→EXEC handoff`,

    progress: 0,
    phase: 'planning',
    created_by: 'PLAN',
    metadata: {
      protocol_version: 'v4.3.0',
      ees_count: 5,
      total_estimated_hours: '144-166',
      timeline_weeks: 11
    }
  };

  try {
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .insert({
        ...prd,
        metadata: JSON.stringify(prd.metadata)
      })
      .select()
      .single();

    if (error) {
      console.error('❌ PRD creation error:', error.message);
      console.error('Details:', error);
      process.exit(1);
    }

    console.log('✅ PRD Created Successfully!\n');
    console.log('PRD ID:', data.id);
    console.log('Title:', data.title);
    console.log('Status:', data.status);
    console.log('Priority:', data.priority);

    console.log('\n📋 Next Steps:');
    console.log('1. Auto-generate user stories from success criteria');
    console.log('2. Run PRD enrichment: node scripts/enrich-prd-with-research.js PRD-VENTURE-UNIFICATION-001');
    console.log('3. Create PLAN→EXEC handoff');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createPRD();
