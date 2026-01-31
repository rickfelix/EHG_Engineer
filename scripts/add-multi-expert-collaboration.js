#!/usr/bin/env node
/**
 * Add Multi-Expert RCA Collaboration Protocol
 *
 * Creates:
 * 1. Issue pattern for multi-expert collaboration
 * 2. Domain-expert routing map
 * 3. Updates RCA agent definition
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Domain expert routing map - maps issue categories to relevant experts
const DOMAIN_EXPERT_ROUTING = {
  // Technical domains
  database: {
    primary: 'DATABASE',
    secondary: ['SECURITY', 'PERFORMANCE'],
    keywords: ['migration', 'schema', 'sql', 'query', 'rls', 'postgres', 'table', 'column', 'index']
  },
  api: {
    primary: 'API',
    secondary: ['SECURITY', 'PERFORMANCE'],
    keywords: ['endpoint', 'rest', 'graphql', 'route', 'middleware', 'request', 'response']
  },
  security: {
    primary: 'SECURITY',
    secondary: ['DATABASE', 'API'],
    keywords: ['auth', 'vulnerability', 'cve', 'injection', 'xss', 'csrf', 'token', 'permission']
  },
  performance: {
    primary: 'PERFORMANCE',
    secondary: ['DATABASE', 'API'],
    keywords: ['slow', 'latency', 'optimization', 'cache', 'n+1', 'bottleneck', 'memory']
  },
  testing: {
    primary: 'TESTING',
    secondary: ['REGRESSION', 'UAT'],
    keywords: ['test', 'e2e', 'playwright', 'jest', 'coverage', 'spec', 'assertion']
  },
  ui: {
    primary: 'DESIGN',
    secondary: ['UAT', 'TESTING'],
    keywords: ['component', 'ui', 'ux', 'accessibility', 'responsive', 'layout', 'css']
  },
  cicd: {
    primary: 'GITHUB',
    secondary: ['TESTING', 'DEPENDENCY'],
    keywords: ['pipeline', 'workflow', 'action', 'ci', 'cd', 'deploy', 'build']
  },
  dependency: {
    primary: 'DEPENDENCY',
    secondary: ['SECURITY', 'GITHUB'],
    keywords: ['npm', 'package', 'version', 'outdated', 'cve', 'audit', 'upgrade']
  },
  refactor: {
    primary: 'REGRESSION',
    secondary: ['VALIDATION', 'TESTING'],
    keywords: ['refactor', 'backward', 'breaking', 'compatibility', 'restructure']
  }
};

// Multi-domain issue patterns - when to invoke multiple experts
const MULTI_DOMAIN_PATTERNS = [
  {
    pattern: 'security_breach',
    experts: ['SECURITY', 'API', 'DATABASE'],
    trigger: 'unauthorized access, data leak, auth bypass'
  },
  {
    pattern: 'migration_failure',
    experts: ['DATABASE', 'VALIDATION', 'GITHUB'],
    trigger: 'migration error, schema change failed, deploy blocked'
  },
  {
    pattern: 'performance_degradation',
    experts: ['PERFORMANCE', 'DATABASE', 'API'],
    trigger: 'slow response, timeout, high latency'
  },
  {
    pattern: 'test_infrastructure',
    experts: ['TESTING', 'GITHUB', 'DATABASE'],
    trigger: 'tests failing in CI, flaky tests, test db issues'
  },
  {
    pattern: 'deployment_failure',
    experts: ['GITHUB', 'DEPENDENCY', 'SECURITY'],
    trigger: 'deploy failed, build error, dependency conflict'
  }
];

async function addCollaborationPattern() {
  console.log('\n📋 Adding Multi-Expert Collaboration Pattern...\n');

  const pattern = {
    pattern_id: 'PAT-RCA-MULTI-001',
    category: 'protocol',
    issue_summary: 'RCA agent should collaborate with multiple domain experts for complex issues spanning multiple domains. Single-agent analysis often misses cross-domain root causes.',
    severity: 'high',
    occurrence_count: 1,
    status: 'active',
    trend: 'stable',
    proven_solutions: [{
      solution: 'RCA invokes relevant domain experts IN PARALLEL, synthesizes their findings into unified 5-whys analysis, and creates multi-domain CAPA with all experts validating their portion.',
      times_applied: 1,
      times_successful: 1,
      success_rate: 100
    }],
    prevention_checklist: [
      'RCA detects issue spans multiple domains via keyword analysis',
      'RCA invokes 2-4 relevant domain experts in parallel',
      'Each expert provides domain-specific root cause analysis',
      'RCA synthesizes into unified 5-whys spanning all domains',
      'CAPA includes preventive actions for each domain',
      'Pattern stored with related_sub_agents array populated',
      'All contributing experts validate their portion'
    ],
    related_sub_agents: ['RCA', 'DATABASE', 'API', 'SECURITY', 'PERFORMANCE', 'TESTING', 'GITHUB']
  };

  const { error } = await supabase
    .from('issue_patterns')
    .upsert([pattern], { onConflict: 'pattern_id' });

  if (error) {
    console.error('Error adding pattern:', error.message);
    return false;
  }

  console.log('✅ Added PAT-RCA-MULTI-EXPERT-001');
  return true;
}

async function addRoutingMapPattern() {
  console.log('\n📋 Adding Domain Expert Routing Map Pattern...\n');

  const pattern = {
    pattern_id: 'PAT-RCA-ROUTE-001',
    category: 'protocol',
    issue_summary: 'RCA agent needs a routing map to identify which domain experts to invoke based on issue keywords and categories.',
    severity: 'medium',
    occurrence_count: 1,
    status: 'active',
    trend: 'stable',
    proven_solutions: [{
      solution: JSON.stringify({
        routing_map: DOMAIN_EXPERT_ROUTING,
        multi_domain_patterns: MULTI_DOMAIN_PATTERNS,
        usage: 'Match issue keywords against routing_map to identify primary + secondary experts. For known multi-domain patterns, invoke all listed experts.'
      }),
      times_applied: 1,
      times_successful: 1,
      success_rate: 100
    }],
    prevention_checklist: [
      'Check issue against multi_domain_patterns first for known complex issues',
      'Extract keywords from issue description',
      'Match keywords against routing_map to find relevant domains',
      'Invoke primary expert + secondary experts if issue is complex',
      'Always invoke at least 2 experts for issues with multiple keyword matches'
    ],
    related_sub_agents: ['RCA', 'VALIDATION']
  };

  const { error } = await supabase
    .from('issue_patterns')
    .upsert([pattern], { onConflict: 'pattern_id' });

  if (error) {
    console.error('Error adding routing pattern:', error.message);
    return false;
  }

  console.log('✅ Added PAT-RCA-DOMAIN-ROUTING-001');
  return true;
}

async function updateRCAAgentDefinition() {
  console.log('\n📋 Updating RCA Agent Definition...\n');

  // Get current RCA agent
  const { data: rcaAgent, error: fetchError } = await supabase
    .from('leo_sub_agents')
    .select('*')
    .eq('code', 'RCA')
    .single();

  if (fetchError || !rcaAgent) {
    console.error('Error fetching RCA agent:', fetchError?.message);
    return false;
  }

  // Build enhanced description with collaboration protocol
  const collaborationProtocol = `

## Multi-Expert Collaboration Protocol (v1.0)

**CRITICAL**: RCA is a TRIAGE SPECIALIST that works WITH domain experts, not a replacement for them.

### When to Invoke Domain Experts

For ANY issue requiring technical knowledge, invoke relevant domain experts:

| Issue Category | Primary Expert | Secondary Experts |
|----------------|---------------|-------------------|
| Database/SQL/Migration | DATABASE | SECURITY, PERFORMANCE |
| API/Endpoints | API | SECURITY, PERFORMANCE |
| Auth/Vulnerabilities | SECURITY | DATABASE, API |
| Performance/Latency | PERFORMANCE | DATABASE, API |
| Tests/Coverage | TESTING | REGRESSION, UAT |
| UI/Components | DESIGN | UAT, TESTING |
| CI/CD/Pipelines | GITHUB | TESTING, DEPENDENCY |
| Packages/CVEs | DEPENDENCY | SECURITY, GITHUB |
| Refactoring | REGRESSION | VALIDATION, TESTING |

### Multi-Expert Collaboration Flow

\`\`\`
1. TRIAGE: Identify issue category via keywords
2. DETECT: Check if issue spans multiple domains
3. INVOKE: Launch relevant experts IN PARALLEL via Task tool
4. GATHER: Collect domain-specific findings from each expert
5. SYNTHESIZE: Unify findings into cross-domain 5-whys
6. CAPA: Create multi-domain Corrective/Preventive Actions
7. VALIDATE: Have each expert verify their portion
8. CAPTURE: Add to issue_patterns with related_sub_agents[]
\`\`\`

### Known Multi-Domain Patterns

| Pattern | Experts to Invoke |
|---------|-------------------|
| Security breach | SECURITY + API + DATABASE |
| Migration failure | DATABASE + VALIDATION + GITHUB |
| Performance degradation | PERFORMANCE + DATABASE + API |
| Test infrastructure | TESTING + GITHUB + DATABASE |
| Deployment failure | GITHUB + DEPENDENCY + SECURITY |

### Invoking Experts (Example)

\`\`\`javascript
// RCA invokes multiple experts in parallel
Task tool with subagent_type="DATABASE":
  "Analyze database aspect of: {issue_description}"

Task tool with subagent_type="SECURITY":
  "Analyze security aspect of: {issue_description}"

// Then synthesize their findings
\`\`\`

### Post-Fix Documentation

After domain experts fix an issue, RCA documents:
1. Unified root cause (5-whys across all domains)
2. Multi-domain CAPA
3. Pattern entry with all contributing experts tagged

**Remember**: RCA provides the ANALYTICAL FRAMEWORK. Domain experts provide TECHNICAL SOLUTIONS. Together they produce complete root cause analysis with effective prevention.
`;

  // Append collaboration protocol to existing description
  const updatedDescription = rcaAgent.description + collaborationProtocol;

  const { error: updateError } = await supabase
    .from('leo_sub_agents')
    .update({
      description: updatedDescription,
      metadata: {
        ...rcaAgent.metadata,
        collaboration_protocol_version: '1.0',
        updated_at: new Date().toISOString(),
        supports_multi_expert: true
      }
    })
    .eq('code', 'RCA');

  if (updateError) {
    console.error('Error updating RCA agent:', updateError.message);
    return false;
  }

  console.log('✅ Updated RCA agent with Multi-Expert Collaboration Protocol');
  return true;
}

async function addDomainExpertTriggers() {
  console.log('\n📋 Adding collaboration trigger keywords to RCA...\n');

  // Get RCA agent ID
  const { data: rcaAgent } = await supabase
    .from('leo_sub_agents')
    .select('id')
    .eq('code', 'RCA')
    .single();

  if (!rcaAgent) {
    console.error('RCA agent not found');
    return false;
  }

  // Add triggers for multi-domain issues
  const multiDomainTriggers = [
    'spans multiple domains',
    'cross-domain issue',
    'multi-expert analysis',
    'complex root cause',
    'needs domain experts'
  ];

  for (const phrase of multiDomainTriggers) {
    const { error } = await supabase
      .from('leo_sub_agent_triggers')
      .insert({
        sub_agent_id: rcaAgent.id,
        trigger_phrase: phrase,
        trigger_type: 'keyword',
        priority: 6,
        active: true,
        metadata: {
          triggers_multi_expert: true,
          added_from: 'PAT-RCA-MULTI-EXPERT-001'
        }
      });

    if (error && !error.message.includes('duplicate')) {
      console.log('Error adding trigger:', phrase, error.message);
    } else {
      console.log('  Added trigger:', phrase);
    }
  }

  return true;
}

async function main() {
  console.log('═'.repeat(60));
  console.log('MULTI-EXPERT RCA COLLABORATION PROTOCOL');
  console.log('═'.repeat(60));

  const results = {
    pattern: await addCollaborationPattern(),
    routing: await addRoutingMapPattern(),
    rcaUpdate: await updateRCAAgentDefinition(),
    triggers: await addDomainExpertTriggers()
  };

  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log('Collaboration pattern:', results.pattern ? '✅' : '❌');
  console.log('Routing map pattern:', results.routing ? '✅' : '❌');
  console.log('RCA agent updated:', results.rcaUpdate ? '✅' : '❌');
  console.log('Triggers added:', results.triggers ? '✅' : '❌');

  if (Object.values(results).every(r => r)) {
    console.log('\n✅ All components added successfully!');
    console.log('\nNext: Run node scripts/generate-claude-md-from-db.js to regenerate CLAUDE files');
  } else {
    console.log('\n⚠️ Some components failed. Review errors above.');
  }
}

main().catch(console.error);
