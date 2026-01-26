# Sub-Agent Activation Guide for LEO Protocol v4.1.2_database_first


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, e2e

## Executive Summary
This guide documents when and how to activate sub-agents during LEO Protocol execution. Sub-agents are MANDATORY when specific triggers are detected. Failure to activate required sub-agents is a protocol violation.

## Mandatory Activation Triggers

### 1. Database Sub-Agent
**MUST ACTIVATE WHEN:**
- ANY schema changes (CREATE TABLE, ALTER TABLE, etc.)
- New database migrations needed
- Index optimization required
- Query performance issues (>100ms)
- Data integrity constraints needed
- Backup/recovery planning

**Example Triggers:**
```sql
-- Creating new tables
CREATE TABLE sdip_submissions...  -- ✅ ACTIVATE

-- Adding columns
ALTER TABLE strategic_directives_v2 ADD COLUMN...  -- ✅ ACTIVATE

-- Performance issues
-- "Query taking 500ms" mentioned  -- ✅ ACTIVATE
```

### 2. Security Sub-Agent
**MUST ACTIVATE WHEN:**
- ANY mention of "security", "auth", "authentication", "authorization"
- Input validation requirements
- Access control requirements
- Encryption needs
- API rate limiting
- Session management
- Audit logging

**Example Triggers:**
```javascript
// Authentication mentioned
"Users must log in"  -- ✅ ACTIVATE

// Validation gates
"6-gate validation system"  -- ✅ ACTIVATE

// Role-based access
"Only Chairman can approve"  -- ✅ ACTIVATE
```

### 3. Performance Sub-Agent
**MUST ACTIVATE WHEN:**
- ANY performance metric defined
- Load time requirements (<2s, <500ms, etc.)
- Concurrent user targets
- Bundle size limits
- Memory usage concerns
- API response time SLAs

**Example Triggers:**
```
"Dashboard must load in <2 seconds"  -- ✅ ACTIVATE
"Support 100+ concurrent users"  -- ✅ ACTIVATE
"Reduce bundle size to <500KB"  -- ✅ ACTIVATE
```

### 4. Design Sub-Agent
**MUST ACTIVATE WHEN:**
- 2+ UI/UX requirements
- Dashboard/interface creation
- Component design needed
- Style guide requirements
- Accessibility requirements
- Mobile responsiveness

**Example Triggers:**
```
"Create dashboard with filters and tables"  -- ✅ ACTIVATE (2+ UI elements)
"Design validation modal"  -- ❌ Don't activate (1 element)
"Build submission list with pagination"  -- ✅ ACTIVATE (2+ UI elements)
```

### 5. Testing Sub-Agent
**MUST ACTIVATE WHEN:**
- Test coverage >80% required
- E2E testing mentioned
- Integration testing needed
- Performance testing required
- Security testing needed
- Regression testing planned

**Example Triggers:**
```
"85% test coverage required"  -- ✅ ACTIVATE
"E2E tests for submission flow"  -- ✅ ACTIVATE
"Unit tests only"  -- ❌ Don't activate
```

### 6. Documentation Sub-Agent
**MUST ACTIVATE WHEN:**
- API documentation needed
- User guides required
- Technical documentation requested
- README updates needed
- Architecture diagrams required

**Example Triggers:**
```
"Document API endpoints"  -- ✅ ACTIVATE
"Create user manual"  -- ✅ ACTIVATE
"Add code comments"  -- ❌ Don't activate (too minor)
```

### 7. Cost Optimization Sub-Agent
**MUST ACTIVATE WHEN:**
- Budget constraints mentioned
- Resource optimization needed
- Cloud cost concerns
- API usage limits
- Storage optimization

**Example Triggers:**
```
"Minimize Supabase costs"  -- ✅ ACTIVATE
"Stay under $100/month"  -- ✅ ACTIVATE
"Optimize API calls"  -- ✅ ACTIVATE
```

## Activation Process

### Step 1: Detection
During PLAN phase, scan PRD for triggers:
```javascript
function detectSubAgentTriggers(prd) {
  const triggers = {
    database: checkDatabaseTriggers(prd),
    security: checkSecurityTriggers(prd),
    performance: checkPerformanceTriggers(prd),
    design: checkDesignTriggers(prd),
    testing: checkTestingTriggers(prd),
    documentation: checkDocumentationTriggers(prd),
    cost: checkCostTriggers(prd)
  };
  
  return Object.entries(triggers)
    .filter(([agent, triggered]) => triggered)
    .map(([agent]) => agent);
}
```

### Step 2: Handoff Creation
For each triggered sub-agent, create mandatory handoff:
```bash
# Example for SDIP implementation
node scripts/create-subagent-handoff.js database --sd SD-2025-0903-SDIP
node scripts/create-subagent-handoff.js security --sd SD-2025-0903-SDIP
node scripts/create-subagent-handoff.js design --sd SD-2025-0903-SDIP
node scripts/create-subagent-handoff.js testing --sd SD-2025-0903-SDIP
```

### Step 3: Handoff Validation
Every handoff MUST include 7 elements:
1. Executive Summary (≤200 tokens)
2. Completeness Report
3. Deliverables Manifest
4. Key Decisions & Rationale
5. Known Issues & Risks
6. Resource Utilization
7. Action Items for Receiver

### Step 4: Sub-Agent Execution
Sub-agents work in parallel where possible:
```
PLAN → [Database, Security, Design] → EXEC
                                    ↓
                              [Testing] → PLAN
```

## Common Mistakes to Avoid

### ❌ WRONG: Skipping Sub-Agents
```javascript
// PRD has "create dashboard with auth"
// But no Design or Security sub-agents activated
```

### ✅ RIGHT: Proper Activation
```javascript
// PRD has "create dashboard with auth"
// Activated: Design Sub-Agent (2+ UI elements)
// Activated: Security Sub-Agent (auth mentioned)
```

### ❌ WRONG: Late Activation
```javascript
// Discovering database needs during EXEC phase
// Creating handoff after implementation started
```

### ✅ RIGHT: Early Detection
```javascript
// PLAN phase scans PRD for all triggers
// All handoffs created before EXEC begins
```

## SDIP Case Study: What We Should Have Done

### Triggers Detected in SDIP:
1. **Database**: Schema creation (sdip_submissions, sdip_groups)
2. **Security**: 6-gate validation, role-based access
3. **Design**: Dashboard with multiple UI components
4. **Testing**: E2E testing requirement, 85% coverage
5. **Performance**: "MVP+" scope implies performance standards
6. **Documentation**: Not explicitly required

### Proper Execution Flow:
```
LEAD: Create SD-2025-0903-SDIP
  ↓
PLAN: Create PRD, Detect triggers
  ↓
PLAN: Create 4 sub-agent handoffs (Database, Security, Design, Testing)
  ↓
Sub-Agents: Work in parallel
  ↓
EXEC: Implement with sub-agent guidance
  ↓
Testing Sub-Agent: Verification phase
  ↓
LEAD: Final approval
```

## Automation Tools

### Check for Required Sub-Agents
```bash
node scripts/check-subagent-requirements.js SD-2025-XXX
```

### Auto-Generate Handoffs
```bash
node scripts/auto-generate-handoffs.js SD-2025-XXX
```

### Validate Handoff Completeness
```bash
node scripts/validate-handoff.js /handoffs/[handoff-file].md
```

## Enforcement

### Pre-EXEC Checkpoint
```javascript
// scripts/pre-exec-validation.js
async function validateSubAgentHandoffs(sdId) {
  const prd = await getPRD(sdId);
  const requiredAgents = detectSubAgentTriggers(prd);
  const existingHandoffs = await getHandoffs(sdId);
  
  const missingHandoffs = requiredAgents.filter(agent => 
    !existingHandoffs.includes(agent)
  );
  
  if (missingHandoffs.length > 0) {
    throw new Error(`Missing required handoffs: ${missingHandoffs.join(', ')}`);
  }
}
```

### Dashboard Integration
The LEO Protocol Dashboard now shows:
- 🟢 All required sub-agents activated
- 🟡 Some sub-agents may be needed (review)
- 🔴 Required sub-agents missing (blocking)

## Key Takeaways

1. **Sub-agents are MANDATORY, not optional** when triggers are detected
2. **Detection happens in PLAN phase**, not during implementation
3. **Handoffs must be complete** with all 7 elements
4. **Parallel execution** where dependencies allow
5. **Validation before EXEC** prevents protocol violations

## Quick Reference Card

| If you see... | Activate... |
|--------------|-------------|
| CREATE TABLE, ALTER TABLE | Database Sub-Agent |
| "auth", "security", "validation" | Security Sub-Agent |
| "<2s", "100 users", "500KB" | Performance Sub-Agent |
| "dashboard", "UI", "interface" (2+) | Design Sub-Agent |
| ">80% coverage", "E2E" | Testing Sub-Agent |
| "document API", "user guide" | Documentation Sub-Agent |
| "minimize cost", "$X budget" | Cost Sub-Agent |

---

*This guide ensures proper sub-agent activation per LEO Protocol v4.1.2_database_first*
*Last Updated: 2025-01-03*