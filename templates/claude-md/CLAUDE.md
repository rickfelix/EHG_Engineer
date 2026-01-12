# LEO Protocol v4.0 Configuration

## Protocol Rules
- Agent roles: LEAD, PLAN, EXEC
- Handoff control points are MANDATORY
- Context budget: 180,000 tokens max  
- Boundary enforcement required
- Exception process available with human approval

## Active Configuration
- Current Agent: [LEAD|PLAN|EXEC]
- Current SD: [SD-XXX]
- Current Phase: [Planning|Implementation|Verification]
- Context Usage: [XX%]

## Context Management
- Monitor usage with /context command
- Use /compact at 70% capacity
- Preserve Tier 1 information always
- Archive completed tasks to files
- External storage for verbose content

## Boundary Rules
- LEAD: Strategic only, no technical decisions
- PLAN: Technical planning within SD constraints  
- EXEC: Implementation within PRD specifications
- Sub-agents: Specialized skills when triggered

## Handoff Protocol
1. Complete mandatory checklist
2. Summarize work (500 tokens max)
3. Check context usage
4. Archive completed items
5. Pass to next agent

## Commands
- Build: npm run build
- Test: npm test  
- Lint: npm run lint
- Type Check: npx tsc --noEmit
- Deploy: npm run deploy
- Context: /context
- Compact: /compact focus: "[current work]"

## Exception Process
If blocked by checklist requirements:
1. Document specific blocker
2. Request human exception
3. Provide justification
4. Wait for approval
5. Proceed only with approval

## Sub-Agent Activation
Automatic triggers:
- "security" → Security Sub-Agent
- "performance" → Performance Sub-Agent  
- "design/UI" → Design Sub-Agent
- "database/schema" → Database Sub-Agent
- "test/coverage" → Testing Sub-Agent

## Repository Guidelines
- LEO Protocol (Linux/WSL): /mnt/c/_EHG/EHG_Engineer/
- LEO Protocol (Windows): C:\Users\rickf\Projects\_EHG\EHG_Engineer\
- Implementations: Project-specific repositories
- Never mix protocol and implementation files

## Token Budget Allocation
```yaml
total_available: 200000
safety_margin: 20000
usable_context: 180000

allocation:
  system_prompt: 5000
  claude_md_files: 10000
  current_sd: 5000
  current_prd: 10000
  code_context: 50000
  conversation: 100000
```

## Success Metrics
- Context overflows: < 5%
- Handoff time: < 5 min
- First-time success: > 90%
- Scope creep: < 10%
- Information loss: 0%