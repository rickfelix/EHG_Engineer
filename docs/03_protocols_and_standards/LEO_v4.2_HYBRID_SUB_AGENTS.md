# LEO Protocol v4.2 - Hybrid Sub-Agent System


## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, e2e

**Version**: 4.2.0  
**Status**: Enhancement  
**Date**: 2025-09-03  
**Enhancement**: Hybrid Context + Tool Sub-Agent Architecture

---

## Overview: The Two-Layer Sub-Agent System

LEO Protocol v4.2 introduces a **hybrid approach** to sub-agents, combining:
1. **Context Files** (Personas) - Guide Claude's thinking
2. **Executable Tools** - Validate actual implementation

This provides both guided intelligence AND measurable validation.

---

## Sub-Agent Components

Each sub-agent has TWO parts that work together:

### 1. Context File (Persona)
- **Location**: `templates/claude-md/sub-agents/CLAUDE-{AGENT}.md`
- **Purpose**: Loads into Claude's context to guide thinking
- **Contains**: Responsibilities, boundaries, checklists, standards
- **Usage**: EXEC loads this when working on related tasks

### 2. Executable Tool (Validator)
- **Location**: `lib/agents/{agent}-sub-agent.js`
- **Purpose**: Performs actual validation and measurement
- **Contains**: Real checks, scans, measurements, analysis
- **Usage**: EXEC runs this to validate implementation

---

## Available Sub-Agents

### 🔐 Security Sub-Agent
- **Context**: `templates/claude-md/sub-agents/CLAUDE-SECURITY.md`
- **Tool**: `lib/agents/security-sub-agent.js`
- **Activation**: authentication, encryption, PII, OWASP
- **Validates**: Hardcoded secrets, SQL injection, XSS, auth implementation

### ⚡ Performance Sub-Agent
- **Context**: `templates/claude-md/sub-agents/CLAUDE-PERFORMANCE.md`
- **Tool**: `lib/agents/performance-sub-agent.js`
- **Activation**: load time, scalability, optimization
- **Measures**: Bundle size, memory usage, API latency, query performance

### 🧪 Testing Sub-Agent
- **Context**: `templates/claude-md/sub-agents/CLAUDE-TESTING.md`
- **Tool**: `lib/testing/testing-sub-agent.js`
- **Activation**: coverage >80%, e2e testing, visual inspection
- **Validates**: Test coverage, failure analysis, fix recommendations

### 🎨 Design Sub-Agent
- **Context**: `templates/claude-md/sub-agents/CLAUDE-DESIGN.md`
- **Tool**: `lib/agents/design-sub-agent.js`
- **Activation**: UI/UX, accessibility, WCAG, responsive
- **Validates**: WCAG compliance, contrast ratios, touch targets, responsive design

### 🗄️ Database Sub-Agent
- **Context**: `templates/claude-md/sub-agents/CLAUDE-DATABASE.md`
- **Tool**: `lib/agents/database-sub-agent.js`
- **Activation**: schema, migration, query optimization
- **Validates**: Schema integrity, migrations, query performance, indexes

### 💰 Cost Optimization Sub-Agent
- **Context**: `templates/claude-md/sub-agents/CLAUDE-COST.md`
- **Tool**: `lib/agents/cost-sub-agent.js`
- **Activation**: Supabase usage, API limits, cost constraints
- **Monitors**: Database size, API calls, bandwidth usage, cost projections

### 📚 Documentation Sub-Agent
- **Context**: `templates/claude-md/sub-agents/CLAUDE-DOCUMENTATION.md`
- **Tool**: `lib/agents/documentation-sub-agent.js`
- **Activation**: README, API docs, setup instructions
- **Validates**: README accuracy, command execution, link validity, doc/code sync

---

## Activation Mechanisms

Sub-agents activate in TWO ways:

### 1. Keyword Activation (Proactive)
- **When**: PLAN phase, reading PRD
- **How**: Keywords in PRD trigger activation
- **Purpose**: Guide implementation from the start
- **Script**: `node scripts/activate-sub-agents.js PRD-XXX.md`

### 2. Handoff Requirements (Mandatory)
- **When**: At handoff points
- **How**: Validator enforces requirements
- **Purpose**: Block handoff if critical sub-agents haven't run
- **Script**: `node scripts/handoff-validator.js validate EXEC PLAN SD-XXX`

---

## Usage Workflow

### For EXEC (Implementation Phase)

```bash
# 1. PRD triggers security requirements
# EXEC sees "authentication" keyword in PRD

# 2. Load security context for guidance
cat templates/claude-md/sub-agents/CLAUDE-SECURITY.md
# Claude now thinks with security mindset

# 3. Implement with security principles
# ... write authentication code ...

# 4. Validate implementation with tool
node lib/agents/security-sub-agent.js
# Tool scans for vulnerabilities, generates report

# 5. Include both in handoff
# - Checklist from context (manual verification)
# - Scan results from tool (automated validation)
```

### Batch Activation

```bash
# Scan PRD and activate all relevant sub-agents
node scripts/activate-sub-agents.js docs/prds/PRD-XXX.md

# This will:
# 1. Analyze PRD for keywords
# 2. Generate handoff documents
# 3. List context files to load
# 4. List tools to run
```

---

## Handoff Requirements

### EXEC → PLAN Handoff
**Always Required**:
- Testing Sub-Agent (verify implementation)

**Conditionally Required**:
- Security (if auth/tokens implemented)
- Database (if migrations created)
- Performance (if metrics defined)
- Design (if UI components created)
- Documentation (if user-facing features)

### PLAN → LEAD Handoff
**Always Required**:
- Testing Sub-Agent (test results)
- Documentation Sub-Agent (handover docs)

**Conditionally Required**:
- Cost (if cloud services used)
- Security (if sensitive data handled)

---

## Tool Execution

### Running Individual Tools

```bash
# Security scan
node lib/agents/security-sub-agent.js ./src

# Performance analysis
node lib/agents/performance-sub-agent.js ./src http://localhost:3000

# Design validation
node lib/agents/design-sub-agent.js ./src

# Database validation
node lib/agents/database-sub-agent.js

# Cost analysis
node lib/agents/cost-sub-agent.js ./src

# Documentation validation
node lib/agents/documentation-sub-agent.js
```

### Understanding Tool Output

Each tool generates:
1. **Score** (0-100) - Overall health metric
2. **Issues** - Problems found (Critical/High/Medium/Low)
3. **Recommendations** - Specific fixes
4. **Report Files** - Detailed analysis saved to disk

### Exit Codes
- `0` - Pass (score >= threshold)
- `1` - Fail (critical issues or low score)

---

## Benefits of Hybrid Approach

### Context Files (Personas)
✅ Guide correct thinking patterns
✅ Provide domain expertise
✅ Ensure consistent approach
✅ Lightweight and flexible

### Executable Tools
✅ Provide concrete measurements
✅ Catch actual issues
✅ Generate evidence for handoffs
✅ Automate validation

### Combined Benefits
✅ Both guidance AND validation
✅ Human-like thinking + machine verification
✅ Flexible activation (can use either/or/both)
✅ Clear evidence trail for handoffs

---

## Integration with Handoff Validator

The handoff validator now checks:
1. **Checklist completion** (from context)
2. **Tool execution** (from validators)
3. **Combined requirements** (both must pass)

```bash
# Validate handoff with sub-agent requirements
node scripts/handoff-validator.js validate EXEC PLAN SD-XXX

# Output will show:
# - Checklist status
# - Required sub-agents
# - Tool execution results
# - Overall handoff approval
```

---

## Best Practices

### For EXEC Role

1. **Always load context files** when starting related work
2. **Run tools after implementation** to validate
3. **Include both outputs** in handoff documentation
4. **Fix issues before handoff** if tools find problems

### For PLAN Role

1. **Verify sub-agent outputs** in EXEC handback
2. **Check tool scores** meet thresholds
3. **Review recommendations** for future improvements
4. **Block handoff** if critical tools weren't run

### For LEAD Role

1. **Confirm sub-agent coverage** matches PRD requirements
2. **Review aggregate scores** across all tools
3. **Ensure documentation** sub-agent has validated

---

## Common Patterns

### Pattern 1: Security-Critical Feature
```
PRD: "Implement user authentication with OAuth"
→ Security Sub-Agent activates
→ EXEC loads CLAUDE-SECURITY.md
→ EXEC implements OAuth
→ EXEC runs security-sub-agent.js
→ Tool finds hardcoded client secret
→ EXEC fixes issue
→ Tool passes
→ Handoff includes clean security report
```

### Pattern 2: Performance-Sensitive Feature
```
PRD: "Dashboard must load in <3 seconds"
→ Performance Sub-Agent activates
→ EXEC loads CLAUDE-PERFORMANCE.md
→ EXEC implements with performance mindset
→ EXEC runs performance-sub-agent.js
→ Tool measures 4.2 second load time
→ EXEC optimizes bundle size
→ Tool measures 2.8 seconds
→ Handoff includes performance metrics
```

---

## Troubleshooting

### Sub-Agent Not Activating
- Check PRD for activation keywords
- Run `node scripts/activate-sub-agents.js PRD.md --verbose`
- Manually activate if needed

### Tool Failing
- Check tool-specific requirements (e.g., Supabase credentials)
- Run with specific path: `node lib/agents/xxx-sub-agent.js ./src`
- Review generated reports for details

### Handoff Blocked
- Run handoff validator to see requirements
- Execute missing sub-agent tools
- Update checklists in database
- Request exception if truly not applicable

---

## Summary

LEO Protocol v4.2's hybrid sub-agent system provides:
- **Intelligent guidance** through context files
- **Concrete validation** through executable tools
- **Flexible activation** via keywords or requirements
- **Evidence-based handoffs** with measurable results

This approach ensures both quality thinking AND quality outcomes.

---

*LEO Protocol v4.2 - Hybrid Sub-Agents*
*Better thinking, better validation, better software*