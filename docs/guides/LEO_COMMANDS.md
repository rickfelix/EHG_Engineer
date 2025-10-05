# 🤖 LEO Sub-Agent Commands

## ✅ REAL Claude Code Slash Commands!

**These ARE actual slash commands** that appear in Claude Code's slash command menu when you type `/`.

## Quick Start

1. Type `/` in Claude Code to see the command menu
2. Select `/leo` or any variant
3. Add your prompt after selecting the command

```
Example usage:
/leo Fix the dark mode toggle in my dashboard
```

**Location:** Commands are stored in `.claude/commands/` directory

## Available Commands

### `/leo [prompt]`
**Full sub-agent analysis with detailed insights**

Activates complete analysis showing:
- All relevant sub-agents with confidence scores
- Detailed reasoning for selections
- Specific recommendations from each agent
- Coordination strategy between agents

Example:
```
/leo Why is my database query running slowly?
```

Response includes:
- DATABASE sub-agent insights on query optimization
- PERFORMANCE sub-agent analysis of bottlenecks  
- DEBUG sub-agent diagnostic steps

### `/leo-quick [prompt]`
**Fast analysis with concise output**

Quick sub-agent selection without verbose details.

Example:
```
/leo-quick Add user authentication
```

### `/leo-debug [prompt]`
**Force DEBUG sub-agent analysis**

Focuses on troubleshooting and error diagnosis.

Example:
```
/leo-debug The app crashes when clicking submit
```

### `/leo-design [prompt]`
**Force DESIGN sub-agent analysis**

Emphasizes UI/UX and styling considerations.

Example:
```
/leo-design Make the dashboard more intuitive
```

### `/leo-security [prompt]`
**Force SECURITY sub-agent analysis**

Prioritizes security implications and best practices.

Example:
```
/leo-security Review my login implementation
```

### `/leo-perf [prompt]`
**Force PERFORMANCE sub-agent analysis**

Concentrates on optimization and speed improvements.

Example:
```
/leo-perf The page takes 5 seconds to load
```

### `/leo-test [prompt]`
**Force TESTING sub-agent analysis**

Focuses on testing strategies and coverage.

Example:
```
/leo-test How should I test this feature?
```

### `/leo-verify [prompt]`
**Trigger PLAN Supervisor Verification**

Activates PLAN's final "done done" verification with all sub-agents.

Example:
```
/leo-verify Check if all requirements are met for PRD-2025-001
```

This command:
- Queries ALL sub-agents for their verification status
- Ensures requirements are truly met
- Provides confidence scoring
- Returns clear pass/fail verdict

## Sub-Agent Reference

### Available Sub-Agents

| Sub-Agent | Code | Focus Area | Trigger Examples |
|-----------|------|------------|------------------|
| Security | SECURITY | Auth, encryption, vulnerabilities | "login", "password", "security" |
| Performance | PERFORMANCE | Speed, optimization, caching | "slow", "optimize", "cache" |
| Design | DESIGN | UI/UX, styling, themes | "dark mode", "layout", "CSS" |
| Testing | TESTING | Tests, QA, coverage | "test", "coverage", "QA" |
| Database | DATABASE | Queries, schema, migrations | "database", "SQL", "query" |
| API | API | REST, GraphQL, endpoints | "API", "endpoint", "REST" |
| Debug | DEBUG | Errors, troubleshooting | "error", "crash", "bug" |
| Documentation | DOCS | Docs, comments, guides | "document", "README", "guide" |
| Cost | COST | Resource optimization | "cost", "billing", "optimize" |
| Dependency | DEPENDENCY | Packages, updates | "npm", "package", "dependency" |

## How It Works

1. **Command Detection**: When you start a prompt with `/leo`, Claude recognizes it as a sub-agent command
2. **Analysis**: The prompt is analyzed to identify relevant technical domains
3. **Selection**: Appropriate sub-agents are selected based on confidence scores
4. **Enhancement**: Response includes specific insights from each selected sub-agent
5. **Coordination**: Multiple sub-agents work together for comprehensive analysis

## Confidence Scoring

Sub-agents are selected based on confidence levels:
- **90-100%**: Definitely relevant, auto-included
- **70-89%**: Likely relevant, included with context
- **50-69%**: Possibly relevant, mentioned if space allows
- **Below 50%**: Not included

## Examples

### Example 1: Dark Mode Issue
```
You: /leo The dark mode toggle shows dark but displays light

Claude: 🤖 LEO Sub-Agent Analysis
   
Selected Sub-Agents:
• DESIGN (92%) - CSS theme implementation issue
• DEBUG (85%) - State vs display mismatch
• TESTING (73%) - Browser testing needed

DESIGN Analysis:
- Check if 'dark' class is applied to document root
- Verify Tailwind dark: prefix configuration
- Inspect CSS specificity conflicts

DEBUG Analysis:
- localStorage theme value vs actual DOM class
- Component re-render after toggle
- Check for !important overrides

TESTING Recommendations:
- Test in multiple browsers
- Verify with browser dev tools
- Check computed styles on affected elements

[Detailed solution follows...]
```

### Example 2: Performance Issue
```
You: /leo-perf My API endpoint takes 3 seconds to respond

Claude: 🤖 LEO Performance Analysis

PERFORMANCE Sub-Agent Focus:
• Database query optimization needed
• Consider caching strategy
• Check N+1 query problems
• Add response pagination
• Implement query indexing

[Detailed optimization plan...]
```

## Tips

- Use `/leo` for complex issues needing multiple perspectives
- Use specific commands (`/leo-debug`, `/leo-security`) when you know the domain
- The more specific your prompt, the better the sub-agent selection
- Combine with code snippets for best results

## Integration with LEO Protocol

These commands work alongside the LEO Protocol workflow:
- **PLAN phase**: Use `/leo` for technical analysis
- **EXEC phase**: Use `/leo-debug` for implementation issues
- **LEAD phase**: Use `/leo-security` and `/leo-cost` for strategic decisions

---

*Last Updated: 2025-09-04*
*Status: Active and Available*