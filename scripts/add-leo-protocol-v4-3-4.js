#!/usr/bin/env node
/**
 * LEO Protocol v4.3.4 - Quality Intelligence Enhancement
 *
 * Updates the database with new protocol content for v4.3.4 which adds:
 * 1. LLM-based intelligent impact analysis
 * 2. Mandatory sub-agent matrix for SECURITY + PERFORMANCE
 * 3. Gate 2E: Hardening Validation
 * 4. Pattern-based learning integration
 *
 * After running this script, regenerate CLAUDE.md files with:
 *   node scripts/generate-claude-md-from-db.js
 *
 * Created: 2025-12-18
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('LEO Protocol v4.3.4 - Quality Intelligence Enhancement');
  console.log('=' .repeat(60));

  // 1. Get active protocol ID
  console.log('\nStep 1: Finding active protocol...');
  const { data: activeProtocol, error: protocolError } = await supabase
    .from('leo_protocols')
    .select('id, version')
    .eq('status', 'active')
    .single();

  let protocolId = 'leo-v4-3-4-quality-intelligence';

  if (protocolError || !activeProtocol) {
    console.log('   No active protocol found, creating new one...');

    const { error: createError } = await supabase
      .from('leo_protocols')
      .insert({
        id: protocolId,
        version: '4.3.4',
        status: 'active',
        title: 'LEO Protocol v4.3.4 - Quality Intelligence',
        description: 'Quality Intelligence Enhancement with LLM-based validation',
        metadata: {
          created_by: 'add-leo-protocol-v4-3-4.js',
          created_at: new Date().toISOString()
        }
      });

    if (createError) {
      console.error('   Failed to create protocol:', createError.message);
    } else {
      console.log('   Created new protocol v4.3.4');
    }
  } else {
    protocolId = activeProtocol.id;
    console.log(`   Found active protocol: ${activeProtocol.version} (${protocolId})`);
  }

  // 2. Add new protocol section for Quality Intelligence
  console.log('\nStep 2: Adding Quality Intelligence protocol section...');

  const qualityIntelligenceContent = `## Quality Intelligence System (LEO Protocol v4.3.4)

### Sub-Agent Selection Now Uses 4 Methods

1. **Keyword/Semantic Matching** (existing)
   - 60% semantic + 40% keyword weighted scoring
   - Coordination groups for related agents

2. **LLM Impact Analysis** (NEW)
   - Uses Claude to analyze SD scope for implicit concerns
   - Example: "Add API endpoint" triggers SECURITY + PERFORMANCE
   - Location: lib/intelligent-impact-analyzer.js

3. **Mandatory Sub-Agent Matrix** (NEW)
   - SECURITY + PERFORMANCE are now MANDATORY for code-impacting SDs
   - SD types: feature, database, api all require both
   - Location: scripts/orchestrate-phase-subagents.js

4. **Pattern-Based Learning** (NEW)
   - Patterns from retrospectives influence selection
   - If pattern occurred 2+ times, related agents required
   - Location: lib/learning/pattern-to-subagent-mapper.js

### Gate 2E: Hardening Validation

Run before SD completion to catch final gaps:
PRD_ID=PRD-SD-XXX npx ts-node tools/gates/gate2e.ts

Validates:
- RLS policies complete (35% weight)
- Query patterns clean (30% weight) - no N+1
- Type safety score >= 80% (20% weight)
- Data integrity checks (15% weight)

### Why This Matters

SD-HARDENING-V1 was created to fix issues that should have been caught.
v4.3.4 prevents this class of issues from recurring.`;

  // Get max order_index for the protocol
  const { data: maxOrder } = await supabase
    .from('leo_protocol_sections')
    .select('order_index')
    .eq('protocol_id', protocolId)
    .order('order_index', { ascending: false })
    .limit(1);

  const nextOrder = (maxOrder?.[0]?.order_index || 0) + 1;

  const { error: sectionError } = await supabase
    .from('leo_protocol_sections')
    .insert({
      protocol_id: protocolId,
      section_type: 'quality_intelligence',
      title: 'Quality Intelligence System (v4.3.4)',
      content: qualityIntelligenceContent,
      order_index: nextOrder,
      metadata: {
        version: '4.3.4',
        created_at: new Date().toISOString(),
        key_files: [
          'lib/intelligent-impact-analyzer.js',
          'lib/learning/pattern-to-subagent-mapper.js',
          'tools/gates/gate2e.ts'
        ]
      }
    });

  if (sectionError) {
    if (sectionError.message.includes('duplicate')) {
      console.log('   Section already exists, skipping');
    } else {
      console.error('   Failed to add section:', sectionError.message);
    }
  } else {
    console.log('   Quality Intelligence section added');
  }

  // 3. Update PERFORMANCE sub-agent priority and metadata
  console.log('\nStep 3: Updating PERFORMANCE sub-agent...');

  const { data: perfAgent } = await supabase
    .from('leo_sub_agents')
    .select('metadata')
    .eq('code', 'PERFORMANCE')
    .single();

  const perfMetadata = {
    ...(perfAgent?.metadata || {}),
    mandatory_for_sd_types: ['feature', 'database', 'api'],
    v434_update: true,
    updated_at: new Date().toISOString()
  };

  const { error: perfError } = await supabase
    .from('leo_sub_agents')
    .update({
      priority: 85,
      metadata: perfMetadata
    })
    .eq('code', 'PERFORMANCE');

  if (perfError) {
    console.error('   Failed to update PERFORMANCE:', perfError.message);
  } else {
    console.log('   PERFORMANCE sub-agent updated (priority: 85)');
  }

  // 4. Update SECURITY sub-agent similarly
  console.log('\nStep 4: Updating SECURITY sub-agent...');

  const { data: secAgent } = await supabase
    .from('leo_sub_agents')
    .select('metadata')
    .eq('code', 'SECURITY')
    .single();

  const secMetadata = {
    ...(secAgent?.metadata || {}),
    mandatory_for_sd_types: ['feature', 'database', 'api', 'security', 'infrastructure'],
    v434_update: true,
    updated_at: new Date().toISOString()
  };

  const { error: secError } = await supabase
    .from('leo_sub_agents')
    .update({
      priority: 90,
      metadata: secMetadata
    })
    .eq('code', 'SECURITY');

  if (secError) {
    console.error('   Failed to update SECURITY:', secError.message);
  } else {
    console.log('   SECURITY sub-agent updated (priority: 90)');
  }

  // 5. Record the protocol change
  console.log('\nStep 5: Recording protocol change...');

  const { error: changeError } = await supabase
    .from('leo_protocol_changes')
    .insert({
      protocol_id: protocolId,
      change_type: 'enhancement',
      description: 'LEO Protocol v4.3.4 - Quality Intelligence Enhancement',
      changed_fields: {
        new_sections: ['quality_intelligence'],
        updated_sub_agents: ['PERFORMANCE', 'SECURITY'],
        new_features: [
          'LLM intelligent impact analyzer',
          'Mandatory sub-agent matrix',
          'Gate 2E: Hardening Validation',
          'Pattern-based learning integration'
        ]
      },
      changed_by: 'add-leo-protocol-v4-3-4.js',
      change_reason: 'Prevent SD-HARDENING-V1 type issues from recurring'
    });

  if (changeError) {
    console.error('   Failed to record change:', changeError.message);
  } else {
    console.log('   Protocol change recorded');
  }

  console.log('\n' + '=' .repeat(60));
  console.log('LEO Protocol v4.3.4 database updates complete!');
  console.log('\nNext steps:');
  console.log('   1. Regenerate CLAUDE.md files:');
  console.log('      node scripts/generate-claude-md-from-db.js');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
