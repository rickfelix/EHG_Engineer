#!/usr/bin/env node
/**
 * Add stream workflow documentation to leo_protocol_sections
 * SD-LEO-STREAMS-001: Design & Architecture Streams for PLAN Phase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addStreamDocumentation() {
  // Get active protocol ID
  const { data: protocol } = await supabase
    .from('leo_protocols')
    .select('id')
    .eq('status', 'active')
    .single();

  if (!protocol) {
    console.error('No active protocol found');
    return;
  }

  console.log('Active protocol:', protocol.id);

  // Add stream workflow section
  const streamSection = {
    protocol_id: protocol.id,
    section_type: 'plan_streams',
    title: 'PLAN Phase Design & Architecture Streams',
    order_index: 50,
    content: `## Design & Architecture Streams (SD-LEO-STREAMS-001)

The PLAN phase includes explicit Design Streams and Architecture Streams that activate based on SD type.

### Design Streams (User-Facing)
| Stream | Description | Validator |
|--------|-------------|-----------|
| Information Architecture | Content structure, navigation, data relationships | DESIGN |
| UX Design | User flows, interaction patterns, wireframes | DESIGN |
| UI Design | Visual design, components, branding | DESIGN |
| Data Models | Core entities, relationships, schemas | DATABASE |

### Architecture Streams (Technical)
| Stream | Description | Validator |
|--------|-------------|-----------|
| Technical Setup | Frameworks, environments, deployment | - |
| API Design | Service boundaries, contracts, integrations | API |
| Security Design | AuthN/AuthZ, data protection, threat model | SECURITY |
| Performance Design | Scalability, latency targets, caching | PERFORMANCE |

### Stream Activation by SD Type
- **feature**: IA, UX, UI, Data Models REQUIRED; API CONDITIONAL; Security REQUIRED
- **database**: Data Models, API, Security, Performance REQUIRED
- **refactor**: Technical Setup, Performance REQUIRED; Data Models CONDITIONAL
- **bugfix**: Most streams SKIP; Security CONDITIONAL if vulnerability-related

### Conditional Stream Triggers
Streams marked CONDITIONAL activate when PRD contains 2+ matching keywords:
- **API Design**: endpoint, rest, graphql, integration, webhook
- **Data Models**: table, schema, entity, relationship, migration
- **Security Design**: auth, permission, rls, role, sensitive

### Gate 1 Stream Check
Gate 1 (PLAN→EXEC) now includes stream completion validation (informational).
Future versions will enforce stream completion based on SD type requirements.

### Database Tables
- \`sd_stream_requirements\`: Activation matrix by SD type (80 rows)
- \`sd_stream_completions\`: Per-SD stream completion tracking

### Stream Functions
Use \`scripts/modules/sd-type-checker.js\` for programmatic access:
- \`getStreamRequirements(sdType, supabase)\`
- \`evaluateConditionalStreams(prdText, sdType, supabase)\`
- \`validateStreamCompletion(sdId, supabase, options)\`
- \`getApplicableStreams(sdType, prdText, supabase)\`
`,
    metadata: {
      sd_reference: 'SD-LEO-STREAMS-001',
      version: '1.0.0',
      created_at: new Date().toISOString()
    }
  };

  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .upsert(streamSection, {
      onConflict: 'protocol_id,section_type,order_index'
    })
    .select();

  if (error) {
    console.error('Error adding section:', error.message);
  } else {
    console.log('Stream section added/updated:', data[0]?.id);
    console.log('Run: node scripts/generate-claude-md-from-db.js to regenerate CLAUDE_PLAN.md');
  }
}

addStreamDocumentation().catch(console.error);
