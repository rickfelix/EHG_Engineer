# LEO Hook Feedback System Documentation


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, migration, schema

## Overview

The LEO Hook Feedback System is an intelligent git hook integration that automatically resolves common commit-time issues through sub-agent delegation. It ensures LEO Protocol compliance while providing a seamless developer experience.

## Quick Start

### Basic Usage

Instead of using regular `git commit`, use:

```bash
npm run leo:commit -m "Your commit message"
```

This command will:
1. Attempt the commit
2. If hooks fail, automatically resolve issues
3. Retry the commit with resolved issues
4. Provide clear feedback throughout

## Architecture

### Components

1. **LEO Hook Feedback** (`scripts/leo-hook-feedback.js`)
   - Main orchestrator for commit operations
   - Implements exponential backoff and circuit breaker patterns
   - Delegates to sub-agent system for resolution

2. **Hook Sub-Agent Activator** (`scripts/hook-subagent-activator.js`)
   - Maps hook failures to appropriate sub-agents
   - Coordinates resolution strategies
   - Tracks activation metrics

3. **Session Manager Sub-Agent** (`scripts/session-manager-subagent.js`)
   - Manages orchestrator sessions
   - Auto-creates sessions when missing
   - Refreshes stale sessions

4. **Pre-Commit Hook** (`.githooks/pre-commit`)
   - Validates LEO Protocol compliance
   - Checks for filesystem drift
   - Logs failures for feedback system

## Error Resolution Capabilities

### Automated Resolutions

| Error Type | Sub-Agent | Resolution |
|------------|-----------|------------|
| No orchestrator session | Session Manager | Creates temporary session |
| Stale session (>2 hours) | Session Manager | Refreshes session |
| PRD files detected | Database Migration | Migrates to database |
| Handoff files detected | Database Migration | Migrates to database |
| Uncommitted changes | Git Operations | Stashes changes |
| Old duplicate services | Code Analysis | Auto-deprecates |

### Manual Resolutions

- Recent duplicate services (requires review)
- Complex merge conflicts
- Custom validation failures

## Resilience Features

### Exponential Backoff
- Starts at 1 second delay
- Doubles with each retry (max 30 seconds)
- Adds jitter to prevent thundering herd

### Circuit Breaker
- Opens after 3 consecutive failures
- Prevents cascade failures
- Auto-resets after 1 minute

### Timeout Protection
- 30-second timeout per operation
- Prevents hanging on network issues
- Graceful degradation

## Database Schema

### Tables

1. **sub_agent_activations**
   - Tracks all sub-agent invocations
   - Records success/failure metrics
   - Stores resolution details

2. **leo_session_tracking**
   - Manages orchestrator sessions
   - Tracks expiration times
   - Links sessions to SDs

3. **circuit_breaker_state**
   - Maintains circuit breaker status
   - Tracks failure counts
   - Manages retry schedules

4. **leo_hook_feedback**
   - Records all hook failures
   - Tracks resolution methods
   - Stores retry counts

### Views

- `sub_agent_activation_stats` - Aggregated sub-agent metrics
- `hook_resolution_stats` - Resolution success rates

## Maintenance

### Automated Cleanup

Run maintenance tasks:

```bash
# Run all maintenance
node scripts/leo-maintenance.js all

# Clean sessions only
node scripts/leo-maintenance.js sessions

# Rotate logs
node scripts/leo-maintenance.js logs

# Health report
node scripts/leo-maintenance.js health
```

### What Gets Cleaned

- Sessions older than 24 hours
- Activation logs older than 30 days
- Failure logs exceeding 100 entries
- Stale circuit breakers (>1 hour)
- Temporary files and old stashes

## Troubleshooting

### Common Issues

#### Circuit Breaker Open

**Symptom**: "Circuit breaker is open. Retry in X seconds"

**Solution**:
- Wait for the specified time
- Or manually reset: `node scripts/leo-maintenance.js all`

#### Session Creation Fails

**Symptom**: Session repeatedly fails to create

**Solution**:
1. Check git configuration is correct
2. Ensure you're in a git repository
3. Manually create: `node scripts/session-manager-subagent.js create SD-XXXX`

#### Database Not Available

**Symptom**: Warning messages about database operations

**Solution**:
- System continues to work without database
- Apply schema when possible: `database/schema/complete_subagent_integration.sql`

### Debug Mode

Enable verbose logging:

```bash
DEBUG=leo:* npm run leo:commit -m "message"
```

## Configuration

### Environment Variables

```env
# Required for database features
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key

# Optional
LEO_MAX_RETRIES=3
LEO_TIMEOUT_MS=30000
LEO_CIRCUIT_BREAKER_THRESHOLD=3
```

### Customization

Modify retry behavior in `leo-hook-feedback.js`:

```javascript
this.retryConfig = {
  baseDelay: 1000,          // Starting delay
  maxDelay: 30000,          // Maximum delay
  backoffMultiplier: 2,     // Exponential factor
  operationTimeout: 30000,  // Operation timeout
  circuitBreakerThreshold: 3 // Failure threshold
};
```

## Integration with LEO Protocol

### Sub-Agent Registration

The Session Manager is registered as an official LEO Protocol sub-agent:

- **Code**: SESSION_MGR
- **Priority**: 50
- **Activation**: On-demand
- **Capabilities**: session_creation, validation, refresh, cleanup

### Compliance

The system enforces:
- Database-first architecture (no PRD/handoff files)
- Mandatory orchestrator sessions
- Sub-agent activation tracking
- Comprehensive audit trails

## API Reference

### Session Manager Sub-Agent

```javascript
// Create session
node scripts/session-manager-subagent.js create SD-2025-001

// Validate session
node scripts/session-manager-subagent.js validate

// Refresh session
node scripts/session-manager-subagent.js refresh

// Cleanup session
node scripts/session-manager-subagent.js cleanup
```

### Hook Sub-Agent Activator

```javascript
// Show available sub-agents
node scripts/hook-subagent-activator.js

// Activate for specific failure
node scripts/hook-subagent-activator.js no_orchestrator_session
```

## Best Practices

1. **Always use `npm run leo:commit`** for commits during LEO Protocol work
2. **Run maintenance weekly** to keep system healthy
3. **Monitor health reports** for resolution success rates
4. **Apply database schema** for full tracking capabilities
5. **Keep failure logs** for debugging patterns

## Future Enhancements

- [ ] Web dashboard for monitoring (if needed)
- [ ] Slack/Discord notifications for failures
- [ ] Machine learning for pattern detection
- [ ] Custom resolution strategies via plugins
- [ ] Integration with CI/CD pipelines

## Support

For issues or questions:
1. Check troubleshooting section above
2. Run health report: `node scripts/leo-maintenance.js health`
3. Review logs: `.leo-hook-failures.json`
4. Check GitHub issues: https://github.com/rickfelix/EHG_Engineer/issues