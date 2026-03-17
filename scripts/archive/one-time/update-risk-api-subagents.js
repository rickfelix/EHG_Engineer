#!/usr/bin/env node

/**
 * Update RISK and API Sub-Agents (Minimal Enhancement)
 * Creates v1.0.0 for both unversioned sub-agents
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ============================================================================
// RISK SUB-AGENT v1.0.0
// ============================================================================

const riskDescription = `## Risk Assessment Sub-Agent v1.0.0

**BMAD Enhancement**: Multi-domain risk assessment for Strategic Directives.

### Overview
Evaluates Strategic Directives across 6 risk domains to enable risk-informed decision making and prevent 4-6 hours of rework per SD.

---

## Risk Domains Assessed

### 1. Technical Complexity
- Code complexity and refactoring needs
- Technical debt implications
- Architecture changes required
- Integration with existing systems

### 2. Security Risk
- Authentication and authorization requirements
- Data exposure vulnerabilities
- RLS policy design complexity
- Security best practices adherence

### 3. Performance Risk
- Query optimization requirements
- Caching strategy needs
- Scaling concerns
- Database indexing impacts

### 4. Integration Risk
- Third-party API dependencies
- Service dependency reliability
- External system availability
- API versioning concerns

### 5. Data Migration Risk
- Schema change complexity
- Data integrity requirements
- Rollback complexity
- Migration testing needs

### 6. UI/UX Risk
- Component complexity
- Accessibility requirements
- Responsive design challenges
- User experience impact

---

## Risk Scoring Methodology

**Scale**: 1-10 per domain
- **1-3**: LOW - Minimal risk, standard implementation
- **4-6**: MEDIUM - Moderate risk, requires attention
- **7-8**: HIGH - Significant risk, needs mitigation plan
- **9-10**: CRITICAL - Severe risk, may block approval

**Overall Risk Level**: Calculated from domain scores
- **LOW**: All domains ≤ 4
- **MEDIUM**: Any domain 5-6, none > 6
- **HIGH**: Any domain 7-8, none > 8
- **CRITICAL**: Any domain 9-10

---

## Output Format

**Risk Assessment Report**:
\`\`\`
{
  "overall_risk": "MEDIUM",
  "domain_scores": {
    "technical_complexity": 5,
    "security_risk": 6,
    "performance_risk": 3,
    "integration_risk": 4,
    "data_migration_risk": 7,
    "ui_ux_risk": 2
  },
  "critical_issues": [
    "Data migration requires complex rollback strategy"
  ],
  "warnings": [
    "Security: RLS policies need careful design",
    "Performance: Consider caching for frequent queries"
  ],
  "mitigation_recommendations": [
    "Create detailed migration rollback plan",
    "Review RLS policies with security sub-agent",
    "Add performance monitoring for critical queries"
  ]
}
\`\`\`

---

## Activation

**LEAD Pre-Approval**: All Strategic Directives
- Run risk assessment before LEAD approval
- Include risk report in LEAD→PLAN handoff

**PLAN PRD Creation**: Complex SDs
- Re-assess risk after PRD requirements defined
- Update mitigation strategies

---

## Blocking Criteria

**HIGH Risk**: Requires documented mitigation plan
**CRITICAL Risk**: Blocks approval until risk reduced or comprehensive mitigation plan approved

---

## Integration with Issue Patterns

**Leverages**:
- Security issue patterns (1 pattern)
- Performance issue patterns (1 pattern)
- Database migration patterns (1 pattern)
- Build/deployment patterns (3 patterns)

**Prevention**: Early risk detection prevents 4-6 hours rework per SD (BMAD metrics)

---

## Capabilities

1. Multi-domain risk scoring (6 domains, 1-10 scale)
2. Overall risk level calculation (LOW/MEDIUM/HIGH/CRITICAL)
3. Critical issue identification
4. Warning generation for moderate risks
5. Mitigation recommendation synthesis
6. Integration with issue patterns for historical context
7. Risk-informed blocking decisions

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-26 | Initial versioned release with BMAD integration |

---

**Evidence**: BMAD User Guide, 11 issue patterns, LEO Protocol v4.2.0
`;

const riskCapabilities = [
  'Multi-domain risk scoring (6 domains, 1-10 scale)',
  'Overall risk level calculation (LOW/MEDIUM/HIGH/CRITICAL)',
  'Critical issue identification and escalation',
  'Warning generation for moderate risks',
  'Mitigation recommendation synthesis',
  'Integration with issue patterns for historical context',
  'Risk-informed blocking decisions (HIGH/CRITICAL)',
  'LEAD pre-approval risk assessment',
  'PLAN PRD phase risk re-assessment'
];

const riskMetadata = {
  version: '1.0.0',
  updated_date: new Date().toISOString(),
  framework: 'BMAD Method',
  domains: 6,
  scoring_scale: '1-10 per domain',
  risk_levels: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  activation: {
    lead_approval: 'All SDs',
    plan_prd: 'Complex SDs'
  },
  blocking: {
    high: 'Requires mitigation plan',
    critical: 'Blocks approval'
  },
  impact: {
    prevention: '4-6 hours rework per SD',
    source: 'BMAD metrics'
  },
  integration: {
    issue_patterns: 11,
    security_patterns: 1,
    performance_patterns: 1,
    database_patterns: 1,
    build_patterns: 3
  },
  evidence_sources: [
    'docs/guides/bmad-user-guide.md',
    'LEO Protocol v4.2.0',
    '11 issue patterns'
  ]
};

// ============================================================================
// API SUB-AGENT v1.0.0
// ============================================================================

const apiDescription = `## API Sub-Agent v1.0.0

**Mission**: REST/GraphQL endpoint design, API architecture, versioning, and documentation quality assessment.

### Overview
Evaluates API design quality, performance, security, and documentation completeness based on established patterns from existing codebase.

---

## Core Capabilities

### 1. Schema Validation Design
**Pattern**: Zod-based schema validation
\`\`\`javascript
import { z } from 'zod';

const requestSchema = z.object({
  required_field: z.string(),
  optional_field: z.string().optional(),
  enum_field: z.enum(['option1', 'option2'])
}).refine(data => customValidation(data), {
  message: "Custom validation message"
});
\`\`\`

**Best Practices**:
- Use Zod for runtime schema validation
- Define clear error messages
- Support optional fields explicitly
- Use refinements for complex validation

### 2. Rate Limiting Patterns
**Pattern**: Express rate limiting
\`\`\`javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000,    // Time window
  max: 100,               // Max requests per window
  message: 'Rate limit exceeded'
});

app.use('/api/endpoint', limiter, handler);
\`\`\`

**Recommendations**:
- Set appropriate limits per endpoint criticality
- Use different limits for authenticated vs anonymous
- Include clear rate limit messages
- Consider distributed rate limiting for scaling

### 3. Feature Flag Enforcement
**Pattern**: Environment-based feature flags
\`\`\`javascript
const FEATURE_FLAGS = {
  FEATURE_NAME: process.env.FEATURE_NAME === 'true'
};

export async function handler(req, res) {
  if (!FEATURE_FLAGS.FEATURE_NAME) {
    return res.status(403).json({
      error: 'Feature disabled',
      flag: 'FEATURE_NAME'
    });
  }
  // Implementation
}
\`\`\`

**Best Practices**:
- Default features to OFF
- Return 403 with clear flag name
- Document flag in API documentation
- Use environment variables for configuration

### 4. Error Handling Patterns
**Standard Error Response**:
\`\`\`javascript
// Success
{ data: {...}, metadata: {...} }

// Error
{ error: "Description", code: "ERROR_CODE", details: {...} }

// Validation Error
{ error: "Validation failed", errors: [...] }
\`\`\`

**HTTP Status Codes**:
- 200: Success
- 400: Bad request (validation errors)
- 403: Forbidden (feature flags, permissions)
- 404: Not found
- 429: Rate limit exceeded
- 500: Server error

### 5. API Documentation Requirements
**Minimum Documentation**:
- Endpoint purpose and use case
- Request schema with examples
- Response schema with examples
- Error responses
- Rate limits
- Feature flags (if applicable)
- Authentication requirements

---

## Evaluation Criteria

### Design Quality
- [ ] RESTful design principles followed
- [ ] Clear, consistent endpoint naming
- [ ] Proper HTTP method usage (GET, POST, PUT, DELETE)
- [ ] Version strategy defined (if needed)

### Performance
- [ ] Rate limiting implemented
- [ ] Caching strategy documented
- [ ] Query optimization considered
- [ ] Response size appropriate

### Security
- [ ] Authentication/authorization defined
- [ ] Input validation comprehensive
- [ ] Sensitive data handling documented
- [ ] CORS configuration appropriate

### Documentation
- [ ] Request/response schemas documented
- [ ] Error responses documented
- [ ] Rate limits documented
- [ ] Examples provided

---

## Activation

**PLAN PRD Creation**: When SD includes API design/changes
**EXEC Implementation**: Before API endpoint implementation

---

## Integration with Existing Patterns

**Established Patterns** (from src/api/stories/index.js):
- Zod schema validation
- Express rate limiting
- Feature flag gating
- Structured error responses
- Service role key usage patterns

---

## Capabilities

1. Schema validation design review (Zod patterns)
2. Rate limiting pattern recommendation
3. Feature flag enforcement validation
4. Error handling pattern compliance
5. API documentation completeness check
6. RESTful design principles validation
7. Security best practices review

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-26 | Initial versioned release with established patterns |

---

**Evidence**: src/api/stories/index.js, Express ecosystem best practices
`;

const apiCapabilities = [
  'Schema validation design review (Zod patterns)',
  'Rate limiting pattern recommendation (express-rate-limit)',
  'Feature flag enforcement validation',
  'Error handling pattern compliance',
  'API documentation completeness check',
  'RESTful design principles validation',
  'Security best practices review (auth, input validation)',
  'HTTP status code appropriateness',
  'Response structure consistency'
];

const apiMetadata = {
  version: '1.0.0',
  updated_date: new Date().toISOString(),
  patterns: {
    validation: 'Zod schema validation',
    rate_limiting: 'express-rate-limit',
    feature_flags: 'Environment-based flags',
    error_handling: 'Structured error responses'
  },
  evaluation_criteria: {
    design_quality: 4,
    performance: 4,
    security: 3,
    documentation: 4
  },
  activation: {
    plan_prd: 'SD includes API design/changes',
    exec_implementation: 'Before API endpoint implementation'
  },
  evidence_sources: [
    'src/api/stories/index.js',
    'Express ecosystem best practices'
  ]
};

// ============================================================================
// UPDATE FUNCTION
// ============================================================================

async function updateSubAgents() {
  console.log('🔄 Updating RISK and API sub-agents to v1.0.0...\n');

  try {
    // Update RISK
    console.log('📊 Updating RISK sub-agent...');
    const { error: riskError } = await supabase
      .from('leo_sub_agents')
      .update({
        description: riskDescription,
        capabilities: riskCapabilities,
        metadata: riskMetadata
      })
      .eq('code', 'RISK')
      .select();

    if (riskError) {
      console.error('❌ RISK update error:', riskError);
      process.exit(1);
    }
    console.log('✅ RISK sub-agent updated to v1.0.0\n');

    // Update API
    console.log('🔌 Updating API sub-agent...');
    const { error: apiError } = await supabase
      .from('leo_sub_agents')
      .update({
        description: apiDescription,
        capabilities: apiCapabilities,
        metadata: apiMetadata
      })
      .eq('code', 'API')
      .select();

    if (apiError) {
      console.error('❌ API update error:', apiError);
      process.exit(1);
    }
    console.log('✅ API sub-agent updated to v1.0.0\n');

    // Verify updates
    const { data: agents } = await supabase
      .from('leo_sub_agents')
      .select('code, metadata, capabilities')
      .in('code', ['RISK', 'API'])
      .order('code');

    console.log('📊 Verification Summary:\n');
    agents.forEach(agent => {
      console.log(`${agent.code} Sub-Agent:`);
      console.log(`  Version: ${agent.metadata?.version}`);
      console.log(`  Updated: ${agent.metadata?.updated_date?.substring(0, 10)}`);
      console.log(`  Capabilities: ${agent.capabilities?.length}`);

      if (agent.code === 'RISK') {
        console.log(`  Domains: ${agent.metadata?.domains}`);
        console.log(`  Impact: ${agent.metadata?.impact?.prevention}`);
      } else {
        console.log(`  Patterns: ${Object.keys(agent.metadata?.patterns || {}).length}`);
        console.log(`  Criteria: ${Object.keys(agent.metadata?.evaluation_criteria || {}).length}`);
      }
      console.log('');
    });

    console.log('🎉 Both sub-agents enhanced successfully!');

  } catch (_err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

updateSubAgents().then(() => {
  process.exit(0);
});
