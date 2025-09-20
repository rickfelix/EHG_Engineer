# STORY Sub-Agent Runbook

## Enabling/Disabling

### Enable
```bash
export FEATURE_STORY_AGENT=true
export GOVERNANCE_API_URL=https://api.ehg-engineering.com
npm run agents:restart
```

### Disable
```bash
export FEATURE_STORY_AGENT=false
npm run agents:restart
```

## Environment Variables
```bash
FEATURE_STORY_AGENT=false       # Master switch (DEFAULT: false)
GOVERNANCE_API_URL=http://...    # API endpoint
STORY_AGENT_RETRY_MAX=3          # Max retry attempts
STORY_AGENT_TIMEOUT_MS=5000      # API call timeout
STORY_AGENT_DLQ_ENABLED=true     # Dead letter queue
```

## Monitoring

### Health Check
```bash
curl http://localhost:3000/agents/story/health
```

Expected response:
```json
{
  "status": "healthy",
  "enabled": true,
  "processed_events": 42,
  "last_event": "2025-01-17T10:30:00Z"
}
```

### Metrics
- `story_agent_events_processed`: Total events processed
- `story_agent_api_calls`: API calls by endpoint
- `story_agent_errors`: Errors by type
- `story_agent_retry_count`: Retry attempts

### Logs
```bash
# View recent logs
journalctl -u ehg-agents -f | grep STORY

# Error analysis
grep "story.*failed" /var/log/ehg/agents.log

# Event processing
grep "Stories generated" /var/log/ehg/agents.log
```

## Troubleshooting

### Agent not processing events
1. Check feature flag:
   ```bash
   echo $FEATURE_STORY_AGENT
   ```
2. Verify API connectivity:
   ```bash
   curl $GOVERNANCE_API_URL/health
   ```
3. Check event bus connection
4. Review DLQ for failed events

### High retry rate
1. Check API response times
2. Verify network stability
3. Review error logs for patterns
4. Consider increasing timeout:
   ```bash
   export STORY_AGENT_TIMEOUT_MS=10000
   ```

### Memory leak symptoms
1. Check processedEvents Set size:
   ```bash
   curl http://localhost:3000/agents/story/debug
   ```
2. Review event retention period
3. Force garbage collection if needed
4. Restart agent as last resort

### API rate limiting
1. Check rate limit headers in responses
2. Implement backoff strategy
3. Consider batching requests
4. Contact API team for limit increase

## Common Error Patterns

### "Strategic Directive does not exist"
- Cause: SD not found in database
- Fix: Ensure SD is created before generating stories
- Verify: `SELECT * FROM strategic_directives_v2 WHERE id = 'SD-XXX';`

### "No acceptance criteria found"
- Cause: PRD lacks acceptance_criteria field
- Fix: Update PRD with acceptance criteria
- Verify: `SELECT acceptance_criteria FROM product_requirements_v2 WHERE id = 'PRD-XXX';`

### "Cross-SD updates not allowed"
- Cause: Verification request contains stories from multiple SDs
- Fix: Split verification by SD
- Prevention: Group stories by SD before verification

## Performance Tuning

### Optimal Configuration
```bash
# Production settings
STORY_AGENT_RETRY_MAX=3
STORY_AGENT_TIMEOUT_MS=5000
STORY_AGENT_BATCH_SIZE=10      # Process stories in batches
STORY_AGENT_CACHE_TTL=300      # Cache API responses for 5 minutes
```

### Load Testing
```bash
# Generate load
for i in {1..100}; do
  curl -X POST http://localhost:3000/events \
    -H "Content-Type: application/json" \
    -d '{
      "event": "story.create",
      "payload": {
        "sd_key": "SD-TEST-'$i'",
        "prd_id": "550e8400-e29b-41d4-a716-446655440000"
      }
    }'
done
```

## Recovery Procedures

### After Outage
1. Check DLQ for unprocessed events
2. Replay failed events:
   ```bash
   npm run agents:replay-dlq --agent=story
   ```
3. Verify story generation completed
4. Check release gates updated

### Data Consistency
1. Compare event log with database:
   ```sql
   SELECT sd_key, COUNT(*) FROM v_story_verification_status
   GROUP BY sd_key;
   ```
2. Identify missing stories
3. Regenerate if needed:
   ```bash
   curl -X POST /api/stories/generate \
     -d '{"sd_key":"SD-XXX","mode":"upsert"}'
   ```

## Deployment Checklist

### Pre-deployment
- [ ] Review feature flags
- [ ] Check API endpoint configuration
- [ ] Verify database migrations applied
- [ ] Test in staging environment

### Post-deployment
- [ ] Monitor error rates
- [ ] Check processing latency
- [ ] Verify gate calculations
- [ ] Review audit logs

## Contact

- **Team**: Platform Engineering
- **Slack**: #ehg-platform
- **On-call**: PagerDuty - Platform Team
- **Wiki**: https://wiki.ehg.com/story-agent