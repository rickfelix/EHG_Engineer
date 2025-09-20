# LEO Protocol Agent & Sub-Agent Backstory System

## Overview

The LEO Protocol implements a sophisticated multi-agent architecture where both primary agents (LEAD, PLAN, EXEC) and specialized sub-agents operate with rich behavioral contexts defined by their backstories. This document explains how the backstory system works and how it shapes agent behavior.

## Architecture

### Database-First Design

All agent and sub-agent data, including backstories, are stored in the Supabase database:

- **Table: `leo_sub_agents`**
  - `id`: Unique identifier
  - `name`: Human-readable name
  - `code`: Short code (e.g., DEBUGGING, SECURITY)
  - `description`: Brief summary (shown in UI)
  - `metadata`: JSONB field containing full backstory and behavioral data
  - `capabilities`: Array of specific skills
  - `priority`: Execution priority (0-100)
  - `active`: Whether the sub-agent is enabled

### Backstory Structure

Each sub-agent's metadata contains a structured backstory:

```json
{
  "backstory": {
    "summary": "Brief one-line description",
    "full_story": "Multi-paragraph narrative explaining origins and expertise",
    "achievements": ["Notable accomplishment 1", "Notable accomplishment 2"],
    "mantras": ["Guiding principle 1", "Guiding principle 2"]
  },
  "expertise_level": "world-class",
  "inspiration_sources": ["NASA", "Google", "etc."],
  "success_metrics": {
    "mttd": "< 1 minute",
    "accuracy": "> 95%"
  }
}
```

## Sub-Agent Roster

### 1. Debugging Sub-Agent (DEBUGGING)
- **Backstory**: NASA Mars Rover protocols, Netflix chaos engineering, Google SRE
- **Specialty**: Forensic error analysis, stack trace interpretation
- **Triggers**: error, failed, bug, crash, undefined, null, timeout

### 2. Security Sub-Agent (SECURITY)
- **Backstory**: DEF CON, ethical hackers, Fortune 500 protection
- **Specialty**: Vulnerability detection, OWASP compliance, threat modeling
- **Triggers**: authentication, authorization, security, encryption, OWASP

### 3. Performance Sub-Agent (PERFORMANCE)
- **Backstory**: Google Scale, Netflix CDN, Amazon Prime Day
- **Specialty**: Load optimization, caching strategies, bottleneck analysis
- **Triggers**: load time, performance, optimization, slow, latency

### 4. Database Sub-Agent (DATABASE)
- **Backstory**: Facebook petabyte systems, Wall Street trading platforms
- **Specialty**: Schema design, query optimization, migration strategies
- **Triggers**: schema, migration, database, query, index

### 5. Design Sub-Agent (DESIGN)
- **Backstory**: Apple HIG, Jony Ive disciples, Dieter Rams principles
- **Specialty**: UI/UX excellence, accessibility, visual hierarchy
- **Triggers**: UI/UX, responsive, accessibility, WCAG, design

### 6. Testing Sub-Agent (TESTING)
- **Backstory**: NASA zero-defect culture, Toyota quality principles
- **Specialty**: Test coverage, regression prevention, quality assurance
- **Triggers**: coverage, e2e, testing, test, quality

### 7. Cost Optimization Sub-Agent (COST)
- **Backstory**: Netflix FinOps, AWS cost optimization
- **Specialty**: Cloud cost reduction, resource optimization
- **Triggers**: cost, budget, expensive, optimize spending

## How Backstories Shape Behavior

### 1. Identity Formation
When a sub-agent is triggered, it first loads its backstory to establish its identity:

```javascript
const subAgent = await getSubAgentWithBackstory('debugging-sub');
// Agent now knows: "I am a world-class debugger trained at NASA"
```

### 2. Behavioral Instructions
The backstory generates specific behavioral instructions:

```
You are the Debugging Sub-Agent.
Your identity: World-class debugging virtuoso modeled after NASA Mars Rover protocols.

Your guiding principles:
• The bug is always in the last place you look, so look there first
• Trust the logs, but verify the assumptions
• Every bug has a story - find the plot twist

You operate at a world-class level.
```

### 3. Decision Making
Backstories influence how agents approach problems:

- **Security Agent**: Paranoid by design, assumes everything is a threat
- **Performance Agent**: Obsesses over milliseconds, thinks at scale
- **Design Agent**: Prioritizes user experience above all
- **Database Agent**: Treats data integrity as sacred

### 4. Communication Style
Each agent's backstory defines how it communicates:

- **Debugging Agent**: Direct, forensic, evidence-based
- **Security Agent**: Cautious, threat-aware, protective
- **Performance Agent**: Metrics-driven, optimization-focused
- **Design Agent**: User-centric, aesthetic, empathetic

## Triggering System

### Automatic Activation
Sub-agents are triggered automatically based on context:

1. **Keyword Detection**: System scans for trigger phrases
2. **Database Query**: Matches triggers to active sub-agents
3. **Metadata Retrieval**: Loads full backstory from database
4. **Behavioral Setup**: Configures agent with its personality
5. **Execution**: Agent performs task with its unique perspective

### Example Trigger Flow

```javascript
// 1. Context with error
const context = "Application throwing error: Failed to submit feedback";

// 2. System detects triggers
const triggers = ['error', 'failed'];

// 3. Query database
SELECT * FROM leo_sub_agents 
WHERE id IN (
  SELECT sub_agent_id FROM leo_sub_agent_triggers 
  WHERE trigger_phrase IN ('error', 'failed')
);

// 4. Load Debugging Sub-Agent with backstory
const debugAgent = loadWithBackstory('debugging-sub');

// 5. Agent operates with NASA-level debugging expertise
debugAgent.analyze(context); // Approaches like debugging Mars Rover
```

## Integration with LEO Protocol

### EXEC Agent Coordination
When EXEC agent encounters triggers, it:

1. Queries database for relevant sub-agents
2. Creates formal handoff with 7 required elements
3. Passes context AND backstory to sub-agent
4. Sub-agent operates with full personality
5. Returns results maintaining character

### Handoff with Backstory Context

```javascript
const handoff = {
  executiveSummary: "Security review needed for new API",
  subAgentContext: {
    agent: 'security-sub',
    backstory: securityAgent.metadata.backstory,
    behaviorInstructions: generateInstructions(securityAgent)
  }
};
```

## Benefits of Backstory System

### 1. Consistency
Agents maintain consistent behavior across invocations

### 2. Expertise Depth
Rich backstories provide deep domain expertise

### 3. Believable Personas
Agents feel like real experts, not generic tools

### 4. Clear Mental Models
Developers understand how each agent thinks

### 5. Improved Results
Agents with strong identities produce better outputs

## Adding New Sub-Agents

To add a new sub-agent with backstory:

1. **Design the Backstory**
   - Research real-world expertise
   - Create compelling narrative
   - Define achievements and principles

2. **Store in Database**
   ```sql
   INSERT INTO leo_sub_agents (
     id, name, code, description, metadata, priority, active
   ) VALUES (
     'new-agent-sub',
     'New Agent Name',
     'NEWAGENT',
     'Brief description',
     '{"backstory": {...}}',
     75,
     true
   );
   ```

3. **Add Triggers**
   ```sql
   INSERT INTO leo_sub_agent_triggers (
     sub_agent_id, trigger_phrase, trigger_type, active
   ) VALUES 
     ('new-agent-sub', 'keyword1', 'keyword', true),
     ('new-agent-sub', 'keyword2', 'keyword', true);
   ```

4. **Create Context Documentation**
   Create `/templates/claude-md/sub-agents/CLAUDE-NEWAGENT.md`

## Best Practices

### 1. Backstory Design
- Research real expertise sources
- Include specific achievements
- Add memorable mantras/principles
- Make it believable and grounded

### 2. Trigger Selection
- Choose specific, relevant keywords
- Avoid overly broad triggers
- Test for false positives

### 3. Metadata Structure
- Keep backstory in structured JSON
- Include measurable success metrics
- Document inspiration sources

### 4. Testing
- Verify backstory retrieval
- Test behavioral consistency
- Validate trigger accuracy

## Monitoring & Metrics

Track sub-agent effectiveness:

```sql
-- Most triggered sub-agents
SELECT sub_agent_id, COUNT(*) 
FROM sub_agent_executions 
GROUP BY sub_agent_id;

-- Success rate by sub-agent
SELECT 
  sub_agent_id,
  AVG(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_rate
FROM sub_agent_executions
GROUP BY sub_agent_id;
```

## Future Enhancements

### 1. Dynamic Backstory Evolution
- Agents learn from experiences
- Backstories update with new achievements
- Adaptive behavior based on success

### 2. Cross-Agent Collaboration
- Agents share backstory context
- Build on each other's expertise
- Maintain consistent world view

### 3. User-Defined Backstories
- Allow custom backstories
- Industry-specific personas
- Company culture alignment

## Conclusion

The backstory system transforms sub-agents from simple tools into sophisticated personas with deep expertise, consistent behavior, and believable character. This approach ensures that when agents are triggered, they bring not just functionality but wisdom, experience, and perspective shaped by their world-class backgrounds.

By storing these rich narratives in the database metadata, we ensure that every invocation of a sub-agent includes its full context, allowing it to operate at the peak of its defined expertise and maintain behavioral consistency across all interactions.

---

*"Every agent has a story. That story shapes how they see the world, approach problems, and deliver solutions. In the LEO Protocol, we don't just execute tasks - we bring expertise to life."*