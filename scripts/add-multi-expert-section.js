#!/usr/bin/env node
/**
 * Add Multi-Expert Collaboration Protocol Section to CLAUDE_CORE.md
 * Part of SD-LEO-INFRA-LEARNING-ARCHITECTURE-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sectionContent = `## RCA Multi-Expert Collaboration Protocol (v1.0)

**Pattern ID**: PAT-RCA-MULTI-001

### Overview

The RCA (Root Cause Analysis) agent functions as a **triage specialist** that collaborates with domain experts rather than attempting to solve technical issues alone. For complex, cross-domain issues, RCA invokes multiple experts IN PARALLEL.

### When to Invoke Multiple Experts

RCA automatically invokes 2+ experts when:
1. Issue matches known multi-domain patterns
2. Issue keywords span multiple categories in routing map
3. Explicit triggers: "spans multiple domains", "cross-domain issue", "multi-expert analysis"

### Domain Expert Routing Map

| Category | Primary | Secondary | Keywords |
|----------|---------|-----------|----------|
| Database | DATABASE | SECURITY, PERFORMANCE | migration, schema, sql, query, rls |
| API | API | SECURITY, PERFORMANCE | endpoint, rest, graphql, route |
| Security | SECURITY | DATABASE, API | auth, vulnerability, cve, injection |
| Performance | PERFORMANCE | DATABASE, API | slow, latency, optimization, cache |
| Testing | TESTING | REGRESSION, UAT | test, e2e, playwright, coverage |
| UI | DESIGN | UAT, TESTING | component, ui, ux, accessibility |
| CI/CD | GITHUB | TESTING, DEPENDENCY | pipeline, workflow, action, deploy |
| Dependencies | DEPENDENCY | SECURITY, GITHUB | npm, package, version, cve |
| Refactoring | REGRESSION | VALIDATION, TESTING | refactor, backward, compatibility |

### Multi-Domain Issue Patterns

| Pattern | Experts to Invoke |
|---------|-------------------|
| \`security_breach\` | SECURITY + API + DATABASE |
| \`migration_failure\` | DATABASE + VALIDATION + GITHUB |
| \`performance_degradation\` | PERFORMANCE + DATABASE + API |
| \`test_infrastructure\` | TESTING + GITHUB + DATABASE |
| \`deployment_failure\` | GITHUB + DEPENDENCY + SECURITY |

### Collaboration Flow

\`\`\`
1. TRIAGE: Identify issue category via keywords
2. DETECT: Check if issue spans multiple domains
3. INVOKE: Launch relevant experts IN PARALLEL via Task tool
4. GATHER: Collect domain-specific findings from each expert
5. SYNTHESIZE: Unify findings into cross-domain 5-whys
6. CAPA: Create multi-domain Corrective/Preventive Actions
7. CAPTURE: Add to issue_patterns with related_sub_agents[]
\`\`\`

### Example Invocation

\`\`\`javascript
// RCA invokes DATABASE expert (parallel)
Task tool with subagent_type="database-agent":
  "Analyze database aspect of: {issue_description}"

// RCA invokes VALIDATION expert (parallel)
Task tool with subagent_type="validation-agent":
  "Analyze validation aspect of: {issue_description}"
\`\`\`

### Key Principle

**RCA provides the ANALYTICAL FRAMEWORK. Domain experts provide TECHNICAL SOLUTIONS. Together they produce complete root cause analysis with effective prevention.**

*Full documentation: docs/reference/rca-multi-expert-collaboration.md*
`;

async function addSection() {
  console.log('Adding Multi-Expert Collaboration Protocol section...\n');

  // Check if section already exists
  const { data: existing } = await supabase
    .from('leo_protocol_sections')
    .select('id')
    .eq('section_type', 'rca_multi_expert_protocol')
    .limit(1);

  if (existing && existing.length > 0) {
    console.log('Section already exists with id:', existing[0].id);

    // Update it
    const { error } = await supabase
      .from('leo_protocol_sections')
      .update({
        content: sectionContent,
        target_file: 'CLAUDE_CORE.md',
        metadata: {
          version: '1.0',
          pattern_id: 'PAT-RCA-MULTI-001',
          updated_at: new Date().toISOString(),
          source_sd: 'SD-LEO-INFRA-LEARNING-ARCHITECTURE-001'
        }
      })
      .eq('id', existing[0].id)
      .select();

    if (error) {
      console.error('Error updating section:', error.message);
      return;
    }
    console.log('✅ Section updated');
    return;
  }

  // Insert new section
  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .insert({
      protocol_id: 'leo-v4-3-3-ui-parity',
      section_type: 'rca_multi_expert_protocol',
      title: 'RCA Multi-Expert Collaboration Protocol',
      content: sectionContent,
      order_index: 2380,
      metadata: {
        version: '1.0',
        pattern_id: 'PAT-RCA-MULTI-001',
        created_at: new Date().toISOString(),
        source_sd: 'SD-LEO-INFRA-LEARNING-ARCHITECTURE-001'
      },
      context_tier: 'REFERENCE',
      target_file: 'CLAUDE_CORE.md',
      priority: 'STANDARD'
    })
    .select();

  if (error) {
    console.error('Error creating section:', error.message);
    return;
  }

  console.log('✅ Section created with id:', data[0].id);
  console.log('\nNext: Update section-file-mapping.json and regenerate CLAUDE*.md files');
}

addSection().catch(console.error);
