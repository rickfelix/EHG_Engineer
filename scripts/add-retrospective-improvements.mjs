#!/usr/bin/env node
/**
 * Add LEO Protocol Improvements from Retrospective Analysis
 *
 * This script adds 2 new sections to leo_protocol_sections:
 * 1. Edge Case Testing Checklist (CLAUDE_EXEC.md)
 * 2. Visual Documentation Best Practices (CLAUDE_PLAN.md)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function main() {
  console.log('🚀 Adding retrospective improvements to leo_protocol_sections...\n');

  // Step 1: Get active protocol ID
  console.log('📋 Step 1: Getting active protocol ID...');
  const { data: protocols, error: protocolError } = await supabase
    .from('leo_protocols')
    .select('id, version, status')
    .eq('status', 'active')
    .limit(1);

  if (protocolError) {
    console.error('❌ Error fetching active protocol:', protocolError);
    process.exit(1);
  }

  if (!protocols || protocols.length === 0) {
    console.error('❌ No active protocol found');
    process.exit(1);
  }

  const protocolId = protocols[0].id;
  console.log(`✅ Active protocol: ${protocols[0].version} (ID: ${protocolId})`);

  // Step 2: Define Section 1 - Edge Case Testing Checklist
  const section1 = {
    protocol_id: protocolId,
    section_type: 'exec_edge_case_testing_checklist',
    title: 'Edge Case Testing Checklist',
    content: `## Edge Case Testing Checklist

When implementing tests, ensure coverage for:

### Input Validation Edge Cases
- [ ] Empty strings, null values, undefined
- [ ] Maximum length inputs (overflow testing)
- [ ] Special characters (SQL injection, XSS vectors)
- [ ] Unicode and emoji inputs
- [ ] Whitespace-only inputs

### Boundary Conditions
- [ ] Zero, negative, and maximum numeric values
- [ ] Array min/max lengths (empty, single item, very large)
- [ ] Date boundaries (leap years, timezone edge cases)

### Concurrent Operations
- [ ] Race conditions (simultaneous updates)
- [ ] Database transaction rollbacks
- [ ] Cache invalidation timing

### Error Scenarios
- [ ] Network failures (timeout, disconnect)
- [ ] Database connection errors
- [ ] Invalid authentication tokens
- [ ] Permission denied scenarios

### State Transitions
- [ ] Idempotency (repeated operations)
- [ ] State rollback on error
- [ ] Partial success scenarios`,
    context_tier: 'PHASE_EXEC',
    order_index: 900,
    metadata: {
      source: 'Retrospective Analysis Report',
      created_date: '2025-10-24',
      priority: 'high',
      category: 'testing'
    }
  };

  // Step 3: Define Section 2 - Visual Documentation Best Practices
  const section2 = {
    protocol_id: protocolId,
    section_type: 'plan_visual_documentation_examples',
    title: 'Visual Documentation Best Practices',
    content: `## Visual Documentation Best Practices

When creating PRDs and technical specifications, consider adding:

### Architecture Diagrams (Mermaid)
\`\`\`mermaid
graph TD
    A[User Request] --> B[Validation Layer]
    B --> C{Valid?}
    C -->|Yes| D[Business Logic]
    C -->|No| E[Error Response]
    D --> F[Database]
    F --> G[Success Response]
\`\`\`

### State Flow Diagrams
\`\`\`mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Review
    Review --> Approved
    Review --> Rejected
    Rejected --> Draft
    Approved --> [*]
\`\`\`

### Sequence Diagrams (Complex Interactions)
\`\`\`mermaid
sequenceDiagram
    User->>+Frontend: Submit Form
    Frontend->>+API: POST /api/submit
    API->>+Database: INSERT data
    Database-->>-API: Success
    API->>+Queue: Enqueue job
    Queue-->>-API: Acknowledged
    API-->>-Frontend: 202 Accepted
    Frontend-->>-User: Show success
\`\`\`

**When to Use**:
- Complex workflows with multiple decision points → Flowchart
- Multi-component interactions → Sequence diagram
- State transitions → State diagram
- System architecture → Component diagram`,
    context_tier: 'PHASE_PLAN',
    order_index: 1000,
    metadata: {
      source: 'Retrospective Analysis Report',
      created_date: '2025-10-24',
      priority: 'medium',
      category: 'documentation'
    }
  };

  // Step 4: Insert Section 1
  console.log('\n📝 Step 2: Inserting Edge Case Testing Checklist...');
  const { data: insert1, error: error1 } = await supabase
    .from('leo_protocol_sections')
    .insert(section1)
    .select('id, section_type, title');

  if (error1) {
    console.error('❌ Error inserting section 1:', error1);
    process.exit(1);
  }

  console.log(`✅ Inserted: ${insert1[0].section_type} (ID: ${insert1[0].id})`);

  // Step 5: Insert Section 2
  console.log('\n📝 Step 3: Inserting Visual Documentation Best Practices...');
  const { data: insert2, error: error2 } = await supabase
    .from('leo_protocol_sections')
    .insert(section2)
    .select('id, section_type, title');

  if (error2) {
    console.error('❌ Error inserting section 2:', error2);
    process.exit(1);
  }

  console.log(`✅ Inserted: ${insert2[0].section_type} (ID: ${insert2[0].id})`);

  // Step 6: Verify inserts
  console.log('\n🔍 Step 4: Verifying inserts...');
  const { data: verification, error: verifyError } = await supabase
    .from('leo_protocol_sections')
    .select('id, section_type, title, context_tier, order_index')
    .in('section_type', [
      'exec_edge_case_testing_checklist',
      'plan_visual_documentation_examples'
    ]);

  if (verifyError) {
    console.error('❌ Error verifying inserts:', verifyError);
    process.exit(1);
  }

  console.log('\n✅ Successfully added 2 new sections:');
  verification.forEach(section => {
    console.log(`   - ${section.section_type}`);
    console.log(`     Title: ${section.title}`);
    console.log(`     Tier: ${section.context_tier}`);
    console.log(`     Order: ${section.order_index}`);
    console.log('');
  });

  console.log('🎉 Done! Sections added successfully.');
  console.log('\n📋 Next Steps:');
  console.log('   1. Run: node scripts/generate-claude-md.mjs');
  console.log('   2. Review generated CLAUDE_EXEC.md and CLAUDE_PLAN.md');
  console.log('   3. Commit changes if satisfied');
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
