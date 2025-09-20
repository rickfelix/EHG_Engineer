# STORY Sub-Agent

## Overview
Sub-agent under PLAN responsible for user story lifecycle management.

## Responsibilities
- Normalize acceptance criteria from PRDs
- Generate story skeletons with Given/When/Then format
- Track verification state changes
- Reconcile CI test results with story database
- Publish release gate status

## Lifecycle
1. **Activation**: Auto-triggered when PRD contains acceptance_criteria
2. **Processing**: Calls Governance API to generate/update stories
3. **Verification**: Listens for test results, updates verification status
4. **Completion**: Publishes gate status when all stories verified

## Event Flow
```
PRD Created → story.create → Generate Stories → Store in DB
CI Complete → story.verify → Update Status → gate.story.release
```

## Failure Modes
- **API timeout**: Retry 3x with exponential backoff (2s, 4s, 8s)
- **Invalid PRD format**: Log warning, skip generation, notify PLAN
- **Verification conflict**: Latest timestamp wins, audit trail preserved
- **Rate limit hit**: Queue for retry after cooldown

## Configuration
```bash
FEATURE_STORY_AGENT=false       # Enable agent
GOVERNANCE_API_URL=http://...   # API endpoint
STORY_AGENT_RETRY_MAX=3         # Max retries
STORY_AGENT_TIMEOUT_MS=5000     # API timeout
```

## Observability
- Metrics: story_created_total, story_verified_total, story_errors_total
- Logs: JSON structured with correlation_id
- Traces: OpenTelemetry spans for API calls

## Testing
```bash
# Unit tests
npm test agents/story

# Integration test
npm run test:integration -- --grep "STORY"

# Load test
npm run test:load -- --agent story
```

## Deployment
The STORY sub-agent is deployed as part of the PLAN agent container.

### Enable in Production
1. Set `FEATURE_STORY_AGENT=true` in environment
2. Restart PLAN agent: `kubectl rollout restart deployment/plan-agent`
3. Verify health: `curl http://plan-agent:3000/agents/story/health`

### Disable
1. Set `FEATURE_STORY_AGENT=false`
2. Restart PLAN agent
3. Events will be ignored, no processing occurs